import 'server-only';
import { sql } from '../db';
import type { WireBarrier, BarriersQuery, BarriersResponse, WireKpiSnapshot } from '@/lib/wireTypes';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BARRIERS REPOSITORY — every SQL statement the API routes need
 * ══════════════════════════════════════════════════════════════════════════
 * All queries are tagged-template SQL via postgres.js, which parameterizes
 * every interpolated value automatically. The one exception is ORDER BY,
 * where column names can't be parameterized the normal way — sortCol is
 * always resolved through the SORTABLE whitelist below before it's ever
 * embedded in a query, so an arbitrary client-supplied string can never
 * reach the SQL.
 */

// ─── Sort whitelist ───────────────────────────────────────────────────────
// Maps the frontend's SortableColumn values (lib/types.ts) to a fixed,
// hardcoded SQL expression. Never derive this from user input.

const SORTABLE: Record<string, string> = {
  id:              'b.id',
  tag:             'b.tag',
  criticidade:     'b.criticidade_id',
  categoria:       'b.categoria_id',
  disponibilidade: 'b.disponibilidade_id',
  conformidade:    'b.conformidade_id',
  statusSince:     'b.status_since',
};

function resolveOrderBy(sortCol?: string, sortDir?: string) {
  const col = SORTABLE[sortCol ?? 'id'] ?? SORTABLE.id;
  const dir = sortDir === 'desc' ? 'desc' : 'asc';
  // Safe: `col` only ever comes from the SORTABLE map above (fixed strings
  // we wrote), `dir` is constrained to a two-value literal check — neither
  // can carry attacker-controlled SQL, so sql.unsafe() here isn't unsafe.
  return sql.unsafe(`${col} ${dir}`);
}

// ─── Row shape returned by the shared SELECT ─────────────────────────────

interface BarrierRow {
  id: number;
  tag: string;
  tipologia_id: number;
  location_id: number;
  loc_desc_id: number;
  criticidade_id: number;
  categoria_id: number;
  agrupamento_id: number;
  dono_id: number;        // coalesced to -1 in SQL when NULL
  disponibilidade_id: number;
  comentarios: string;
  plano_acao: string;
  status_since: string;   // ISO date string as returned by postgres.js
  status_history: { date: string; statusId: number; authorId: number; note: string }[];
}

function toWireBarrier(r: BarrierRow): WireBarrier {
  return {
    id:                r.id,
    tag:               r.tag,
    tipologiaId:       r.tipologia_id,
    locationId:        r.location_id,
    locDescId:         r.loc_desc_id,
    criticidadeId:     r.criticidade_id,
    categoriaId:       r.categoria_id,
    agrupamentoId:     r.agrupamento_id,
    donoId:            r.dono_id,
    disponibilidadeId: r.disponibilidade_id,
    comentarios:       r.comentarios,
    planoAcao:         r.plano_acao,
    statusSince:       r.status_since,
    statusHistory:     r.status_history ?? [],
  };
}

// ─── Shared column list + history aggregation ────────────────────────────
// LEFT JOIN LATERAL keeps this one row per barrier (never row-multiplied by
// the one-to-many history join) and produces a ready-to-use JSON array.

const SELECT_COLUMNS = sql`
  b.id, b.tag, b.tipologia_id, b.location_id, b.loc_desc_id, b.criticidade_id,
  b.categoria_id, b.agrupamento_id, coalesce(b.dono_id, -1) as dono_id,
  b.disponibilidade_id, b.comentarios, b.plano_acao,
  to_char(b.status_since, 'YYYY-MM-DD') as status_since,
  coalesce(h.history, '[]'::json) as status_history
`;

const HISTORY_JOIN = sql`
  left join lateral (
    select json_agg(
      json_build_object(
        'date',     to_char(bsh.date, 'YYYY-MM-DD'),
        'statusId', bsh.status_id,
        'authorId', bsh.author_id,
        'note',     bsh.note
      ) order by bsh.date asc
    ) as history
    from barrier_status_history bsh
    where bsh.barrier_id = b.id
  ) h on true
`;

// ─── WHERE clause builder ────────────────────────────────────────────────
// Builds one query with each optional condition nested exactly one level
// deep inside it (`where true and <cond1> and <cond2> ...`), where every
// <condN> is either its own bound-parameter fragment or an empty fragment.
// This is NOT the same as reducing conditions into each other — postgres.js
// fragments don't compose correctly when one fragment is embedded inside
// another fragment (rather than directly inside a query template), which
// silently drops literal SQL text like the `where` keyword itself. Keeping
// every fragment a direct, single-level child of this one template avoids
// that trap. `where true` is a harmless base so the query is always valid
// SQL whether zero, one, or all conditions are present.

function buildWhere(q: BarriersQuery) {
  return sql`
    where true
    ${q.locationId !== undefined && q.locationId !== 0 ? sql`and b.location_id = ${q.locationId}` : sql``}
    ${q.disponibilidadeId !== undefined ? sql`and b.disponibilidade_id = ${q.disponibilidadeId}` : sql``}
    ${q.conformidadeId !== undefined ? sql`and b.conformidade_id = ${q.conformidadeId}` : sql``}
    ${q.categoriaId !== undefined ? sql`and b.categoria_id = ${q.categoriaId}` : sql``}
    ${q.query ? sql`and (b.tag ilike ${'%' + q.query + '%'} or loc.code ilike ${'%' + q.query + '%'})` : sql``}
  `;
}

// ─── Public queries ───────────────────────────────────────────────────────

export async function listBarriers(q: BarriersQuery): Promise<BarriersResponse> {
  const page     = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100_000, Math.max(1, q.pageSize ?? 25));
  const offset   = (page - 1) * pageSize;
  const where    = buildWhere(q);
  const orderBy  = resolveOrderBy(q.sortCol, q.sortDir);

  const [rows, countRows] = await Promise.all([
    sql<BarrierRow[]>`
      select ${SELECT_COLUMNS}
      from barriers b
      join locations loc on loc.id = b.location_id
      ${HISTORY_JOIN}
      ${where}
      order by ${orderBy}
      limit ${pageSize} offset ${offset}
    `,
    sql<{ count: string }[]>`
      select count(*)::text as count
      from barriers b
      join locations loc on loc.id = b.location_id
      ${where}
    `,
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

export async function getBarrierById(id: number): Promise<WireBarrier | null> {
  const rows = await sql<BarrierRow[]>`
    select ${SELECT_COLUMNS}
    from barriers b
    ${HISTORY_JOIN}
    where b.id = ${id}
  `;
  return rows[0] ? toWireBarrier(rows[0]) : null;
}

export async function getKpi(locationId?: number): Promise<WireKpiSnapshot> {
  const where =
    locationId !== undefined && locationId !== 0
      ? sql`where b.location_id = ${locationId}`
      : sql``;

  const rows = await sql<{
    total: string; disponivel: string; fora_de_op: string; indisp_cont: string;
    degr_cont: string; degradado: string; indisponivel: string;
    conforme: string; nao_conforme: string; criticas_nc: string;
  }[]>`
    select
      count(*)::text                                                             as total,
      count(*) filter (where b.disponibilidade_id = 0)::text                     as disponivel,
      count(*) filter (where b.disponibilidade_id = 1)::text                     as fora_de_op,
      count(*) filter (where b.disponibilidade_id = 2)::text                     as indisp_cont,
      count(*) filter (where b.disponibilidade_id = 3)::text                     as degr_cont,
      count(*) filter (where b.disponibilidade_id = 4)::text                     as degradado,
      count(*) filter (where b.disponibilidade_id = 5)::text                     as indisponivel,
      count(*) filter (where b.conformidade_id = 0)::text                       as conforme,
      count(*) filter (where b.conformidade_id = 1)::text                       as nao_conforme,
      count(*) filter (where b.conformidade_id = 1 and b.criticidade_id = 1)::text as criticas_nc
    from barriers b
    ${where}
  `;

  const r = rows[0];
  const total = Number(r?.total ?? 0);
  const conforme = Number(r?.conforme ?? 0);

  return {
    total,
    disponivel:   Number(r?.disponivel ?? 0),
    foraDeOp:     Number(r?.fora_de_op ?? 0),
    indispCont:   Number(r?.indisp_cont ?? 0),
    degrCont:     Number(r?.degr_cont ?? 0),
    degradado:    Number(r?.degradado ?? 0),
    indisponivel: Number(r?.indisponivel ?? 0),
    conforme,
    naoConforme:  Number(r?.nao_conforme ?? 0),
    criticasNC:   Number(r?.criticas_nc ?? 0),
    pctConforme:  total > 0 ? Math.round((conforme / total) * 100) : 0,
  };
}

// ─── Status transition (the one write path) ──────────────────────────────
// Calls the record_status_change() stored procedure defined in
// db/schema.sql, which atomically updates disponibilidade_id + status_since
// and appends a barrier_status_history row. Never UPDATE disponibilidade_id
// directly from application code — this function is the only sanctioned
// way to change a barrier's status.

export async function transitionBarrierStatus(
  barrierId: number,
  statusId: number,
  authorId: number,
  note = ''
): Promise<WireBarrier | null> {
  await sql`select record_status_change(${barrierId}, ${statusId}, ${authorId}, ${note})`;
  return getBarrierById(barrierId);
}
