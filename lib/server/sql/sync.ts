// Sync SQL repository - the real default SyncIo for lib/server/fracttal/sync.
// This is why it exists: reconcile plans are pure, but applying them touches
// barriers + history + sync_state. Every write is idempotent (UNIQUE
// external_code + where guards), status changes go through the one sanctioned
// record_status_change() path, and deletions are soft (deleted_at).
import { queryRows } from "../db.ts";
import {
  fieldsSignature,
  type LocalBarrier,
  type PlanCounts,
  type PlanEntry,
  type SyncIo,
} from "../fracttal/sync.ts";
import type { MapContext } from "../fracttal/map.ts";

export const SYNC_AUTHOR_ID = 10; // authors.id, see db/seed_lookups.sql

// defaultSyncIo: the wiring runSync uses when no custom io is injected.
export const defaultSyncIo: SyncIo = {
  async buildMapContext(): Promise<MapContext> {
    const [locRows, catRows, critRows] = await Promise.all([
      queryRows<{ id: number; code: string }>(
        `select id, code from locations`,
      ),
      queryRows<{ id: number; label: string }>(
        `select id, label from categorias`,
      ),
      queryRows<{ id: number; label: string }>(
        `select id, label from criticidades`,
      ),
    ]);
    const ctx: MapContext = {
      locationIds: Object.fromEntries(
        locRows.map((r) => [r.code.toUpperCase(), r.id]),
      ),
      categoriaIds: Object.fromEntries(catRows.map((r) => [r.label, r.id])),
      criticidadeIds: Object.fromEntries(critRows.map((r) => [r.label, r.id])),
    };
    return ctx;
  },

  async loadLocal(scopeLocationIds: number[]): Promise<LocalBarrier[]> {
    if (scopeLocationIds.length === 0) return [];
    const rows = await queryRows<{
      id: number;
      external_code: string;
      location_id: number;
      disponibilidade_id: number;
      deleted_at: string | null;
      tag: string;
      tipologia_id: number;
      loc_desc_id: number;
      criticidade_id: number;
      categoria_id: number;
      agrupamento_id: number;
      dono_id: number | null;
      comentarios: string;
      plano_acao: string;
    }>(
      `select id, external_code, location_id, disponibilidade_id, deleted_at,
        tag, tipologia_id, loc_desc_id, criticidade_id, categoria_id,
        agrupamento_id, dono_id, comentarios, plano_acao
       from barriers
       where external_code is not null
       order by id`,
    );
    const inScope = new Set(scopeLocationIds);
    return rows
      .filter((r) => inScope.has(r.location_id))
      .map((r) => ({
        id: r.id,
        externalCode: r.external_code,
        disponibilidadeId: r.disponibilidade_id,
        deletedAt: r.deleted_at,
        signature: fieldsSignature({
          tag: r.tag,
          locationId: r.location_id,
          tipologiaId: r.tipologia_id,
          locDescId: r.loc_desc_id,
          criticidadeId: r.criticidade_id,
          categoriaId: r.categoria_id,
          agrupamentoId: r.agrupamento_id,
          donoId: r.dono_id,
          comentarios: r.comentarios,
          planoAcao: r.plano_acao,
        }),
      }));
  },

  async startRun(scope: string): Promise<number> {
    const rows = await queryRows<{ id: number }>(
      `insert into sync_state (scope, status, started_at, finished_at)
       values ($1, 'running', now(), now())
       returning id`,
      [scope],
    );
    return rows[0]!.id;
  },

  async applyPlan(entries: PlanEntry[]): Promise<PlanCounts> {
    const counts: PlanCounts = { inserts: 0, updates: 0, deletes: 0, skips: 0 };
    for (const entry of entries) {
      if (entry.kind === "skip") {
        counts.skips++;
        continue;
      }
      if (entry.kind === "delete") {
        await queryRows(
          `update barriers set deleted_at = now()
           where id = $1 and deleted_at is null`,
          [entry.local.id],
        );
        counts.deletes++;
        continue;
      }
      const input = entry.input;
      if (entry.kind === "insert") {
        const id = await insertBarrier(input);
        if (id !== null) {
          // Stamp the initial history row so the transition timeline is not
          // empty for a freshly imported barrier.
          await queryRows(
            "select record_status_change($1, $2, $3, $4)",
            [
              id,
              input.disponibilidadeId,
              SYNC_AUTHOR_ID,
              "Importado do Fracttal",
            ],
          );
          counts.inserts++;
        } else {
          // Race: the unique external_code constraint won — another run
          // inserted this row first. Count as a skip, not an error.
          counts.skips++;
        }
        continue;
      }
      // update / restore: same field write; restore clears deleted_at.
      await queryRows(
        `update barriers set
           tag = $2, tipologia_id = $3, loc_desc_id = $4, criticidade_id = $5,
           categoria_id = $6, agrupamento_id = $7, dono_id = $8,
           comentarios = $9, plano_acao = $10, source_updated_at = $11,
           deleted_at = case when $12 then null else deleted_at end
         where id = $1`,
        [
          entry.local.id,
          input.tag,
          input.tipologiaId,
          input.locDescId,
          input.criticidadeId,
          input.categoriaId,
          input.agrupamentoId,
          input.donoId,
          input.comentarios,
          input.planoAcao,
          input.sourceUpdatedAt,
          entry.kind === "restore",
        ],
      );
      if (entry.statusChanged) {
        await queryRows(
          "select record_status_change($1, $2, $3, $4)",
          [
            entry.local.id,
            input.disponibilidadeId,
            SYNC_AUTHOR_ID,
            "Sincronização Fracttal",
          ],
        );
      }
      counts.updates++;
    }
    return counts;
  },

  async finishRun(
    runId: number,
    status: "ok" | "failed",
    counts: PlanCounts,
    note: string,
  ): Promise<void> {
    await queryRows(
      `update sync_state
       set status = $2, inserts = $3, updates = $4, deletes = $5,
           skips = $6, note = $7, finished_at = now()
       where id = $1`,
      [
        runId,
        status,
        counts.inserts,
        counts.updates,
        counts.deletes,
        counts.skips,
        note,
      ],
    );
  },
};

// insertBarrier: the create path, guarded by the UNIQUE external_code
// constraint (dedup is DB-enforced, not app logic). Returns the new id when
// the row was actually inserted, null on a race-conflict.
async function insertBarrier(input: {
  externalCode: string;
  tag: string;
  locationId: number;
  tipologiaId: number;
  locDescId: number;
  criticidadeId: number;
  categoriaId: number;
  agrupamentoId: number;
  donoId: number | null;
  disponibilidadeId: number;
  comentarios: string;
  planoAcao: string;
  sourceUpdatedAt: string | null;
}): Promise<number | null> {
  const rows = await queryRows<{ id: number }>(
    `insert into barriers
       (external_code, tag, location_id, tipologia_id, loc_desc_id,
        criticidade_id, categoria_id, agrupamento_id, dono_id,
        disponibilidade_id, comentarios, plano_acao, status_since,
        source_updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, current_date, $13)
     on conflict (external_code) do nothing
     returning id`,
    [
      input.externalCode,
      input.tag,
      input.locationId,
      input.tipologiaId,
      input.locDescId,
      input.criticidadeId,
      input.categoriaId,
      input.agrupamentoId,
      input.donoId,
      input.disponibilidadeId,
      input.comentarios,
      input.planoAcao,
      input.sourceUpdatedAt,
    ],
  );
  return rows[0]?.id ?? null;
}
