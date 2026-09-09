// Barriers repository - every SQL statement the API routes need.
// This is why it exists: single place for barrier queries against the
// Deno-native pool. All values are bound as $1/$2 args; ORDER BY uses a
// fixed whitelist so client input can never become SQL.
import type {
  BarriersQuery,
  BarriersResponse,
  WireBarrier,
  WireKpiSnapshot,
} from "../../wireTypes.ts";
import {
  type BarrierRow,
  HISTORY_JOIN,
  SELECT_COLUMNS,
  toWireBarrier,
} from "./mappers.ts";
export {
  HISTORY_JOIN,
  SELECT_COLUMNS,
  toHistory,
  toWireBarrier,
} from "./mappers.ts";
export { buildWhere, escapeLike, resolveOrderBy, SORTABLE } from "./where.ts";
export type { BarrierRow, HistoryEntry } from "./mappers.ts";
import { buildWhere, resolveOrderBy } from "./where.ts";
import { queryRows } from "../db.ts";

// Lists paged wire barriers + total for the given BarriersQuery filters.
export async function listBarriers(
  q: BarriersQuery,
): Promise<BarriersResponse> {
  // Floors fractional input (page=1.5 would otherwise yield fractional OFFSET);
  // NaN falls back to defaults via ||.
  const page = Math.max(1, Math.floor(q.page ?? 1) || 1);
  const pageSize = Math.min(
    100_000,
    Math.max(1, Math.floor(q.pageSize ?? 25) || 25),
  );
  const offset = (page - 1) * pageSize;
  const where = buildWhere(q);
  const orderBy = resolveOrderBy(q.sortCol, q.sortDir);
  const limitIdx = where.args.length + 1;
  const offsetIdx = where.args.length + 2;

  const [rows, countRows] = await Promise.all([
    queryRows<BarrierRow>(
      `select ${SELECT_COLUMNS} from barriers b
       join locations loc on loc.id = b.location_id
       ${HISTORY_JOIN} ${where.text}
       order by ${orderBy} limit $${limitIdx} offset $${offsetIdx}`,
      [...where.args, pageSize, offset],
    ),
    queryRows<{ count: string }>(
      `select count(*)::text as count from barriers b
       join locations loc on loc.id = b.location_id ${where.text}`,
      where.args,
    ),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  return {
    items: rows.map(toWireBarrier),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Fetches a single wire barrier by id, or null when missing.
export async function getBarrierById(id: number): Promise<WireBarrier | null> {
  const rows = await queryRows<BarrierRow>(
    `select ${SELECT_COLUMNS} from barriers b
     ${HISTORY_JOIN} where b.id = $1`,
    [id],
  );
  return rows[0] ? toWireBarrier(rows[0]) : null;
}

// Computes KPI snapshot counts, optionally scoped to one location.
// Fixed fields cover the well-known statuses; dynamic by* buckets carry
// EVERY id present (GROUP BY) so new statuses reconcile instead of vanishing.
export async function getKpi(locationId?: number): Promise<WireKpiSnapshot> {
  const scoped = locationId !== undefined && locationId !== 0;
  const scopeText = scoped ? "where b.location_id = $1" : "";
  const scopeArgs: unknown[] = scoped ? [locationId] : [];
  const [rows, dispRows, confRows, critRows] = await Promise.all([
    queryRows<{
      total: string;
      disponivel: string;
      fora_de_op: string;
      indisp_cont: string;
      degr_cont: string;
      degradado: string;
      indisponivel: string;
      conforme: string;
      nao_conforme: string;
      criticas_nc: string;
    }>(
      `select
        count(*)::text as total,
        count(*) filter (where b.disponibilidade_id = 0)::text as disponivel,
        count(*) filter (where b.disponibilidade_id = 1)::text as fora_de_op,
        count(*) filter (where b.disponibilidade_id = 2)::text as indisp_cont,
        count(*) filter (where b.disponibilidade_id = 3)::text as degr_cont,
        count(*) filter (where b.disponibilidade_id = 4)::text as degradado,
        count(*) filter (where b.disponibilidade_id = 5)::text as indisponivel,
        count(*) filter (where b.conformidade_id = 0)::text as conforme,
        count(*) filter (where b.conformidade_id = 1)::text as nao_conforme,
        count(*) filter (where b.conformidade_id = 1 and b.criticidade_id = 1)::text as criticas_nc
      from barriers b ${scopeText}`,
      scopeArgs,
    ),
    queryRows<{ id: string; count: string }>(
      `select b.disponibilidade_id::text as id, count(*)::text as count
       from barriers b ${scopeText} group by b.disponibilidade_id`,
      scopeArgs,
    ),
    queryRows<{ id: string; count: string }>(
      `select b.conformidade_id::text as id, count(*)::text as count
       from barriers b ${scopeText} group by b.conformidade_id`,
      scopeArgs,
    ),
    queryRows<{ id: string; count: string }>(
      `select b.criticidade_id::text as id, count(*)::text as count
       from barriers b ${scopeText} group by b.criticidade_id`,
      scopeArgs,
    ),
  ]);

  const r = rows[0];
  const total = Number(r?.total ?? 0);
  const conforme = Number(r?.conforme ?? 0);

  // Collects GROUP BY rows into id-keyed buckets (wire keys stay numeric).
  const toBucket = (bucketRows: { id: string; count: string }[]) => {
    const bucket: Record<string, number> = {};
    for (const row of bucketRows) bucket[row.id] = Number(row.count ?? 0);
    return bucket;
  };

  return {
    total,
    disponivel: Number(r?.disponivel ?? 0),
    foraDeOp: Number(r?.fora_de_op ?? 0),
    indispCont: Number(r?.indisp_cont ?? 0),
    degrCont: Number(r?.degr_cont ?? 0),
    degradado: Number(r?.degradado ?? 0),
    indisponivel: Number(r?.indisponivel ?? 0),
    conforme,
    naoConforme: Number(r?.nao_conforme ?? 0),
    criticasNC: Number(r?.criticas_nc ?? 0),
    pctConforme: total > 0 ? Math.round((conforme / total) * 100) : 0,
    byDisponibilidade: toBucket(dispRows),
    byConformidade: toBucket(confRows),
    byCriticidade: toBucket(critRows),
    syncedAt: new Date().toISOString(),
  };
}

// The one write path: calls record_status_change() (see db/schema.sql),
// which updates disponibilidade_id + status_since and appends history.
// Never UPDATE disponibilidade_id directly from application code.
export async function transitionBarrierStatus(
  barrierId: number,
  statusId: number,
  authorId: number,
  note = "",
): Promise<WireBarrier | null> {
  await queryRows("select record_status_change($1, $2, $3, $4)", [
    barrierId,
    statusId,
    authorId,
    note,
  ]);
  return getBarrierById(barrierId);
}
