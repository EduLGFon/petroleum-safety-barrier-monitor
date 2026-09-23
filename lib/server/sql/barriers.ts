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

// Fetches a single wire barrier by id, or null when missing/deleted.
export async function getBarrierById(id: number): Promise<WireBarrier | null> {
  const found = await getBarriersByIds([id]);
  return found.get(id) ?? null;
}

// getBarriersByIds: batch version of getBarrierById (the alert detector
// resolves hundreds of candidates per run - one query each would stall it).
// Chunked IN lists keep placeholder counts bounded; missing/deleted ids are
// simply absent from the map.
export async function getBarriersByIds(
  ids: number[],
): Promise<Map<number, WireBarrier>> {
  const out = new Map<number, WireBarrier>();
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n));
  for (let at = 0; at < unique.length; at += 500) {
    const chunk = unique.slice(at, at + 500);
    const placeholders = chunk.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await queryRows<BarrierRow>(
      `select ${SELECT_COLUMNS} from barriers b
       ${HISTORY_JOIN}
       where b.id in (${placeholders}) and b.deleted_at is null`,
      chunk,
    );
    for (const r of rows) {
      const w = toWireBarrier(r);
      out.set(w.id, w);
    }
  }
  return out;
}

// Computes KPI snapshot counts over the given filters (location-only callers
// pass a bare id, which keeps the old call shape working). Fixed fields
// cover the well-known statuses; dynamic by* buckets carry EVERY id present
// (GROUP BY) so new statuses reconcile instead of vanishing.
export async function getKpi(
  filter?: number | BarriersQuery,
): Promise<WireKpiSnapshot> {
  const q: BarriersQuery = typeof filter === "number"
    ? { locationId: filter }
    : filter ?? {};
  const where = buildWhere(q);
  const from =
    `from barriers b join locations loc on loc.id = b.location_id ${where.text}`;
  const [rows, dispRows, confRows, critRows] = await Promise.all([
    queryRows<{
      total: string;
      available: string;
      out_of_service: string;
      contingency_outage: string;
      degraded_contingency: string;
      degraded: string;
      unavailable: string;
      other: string;
      compliant: string;
      non_compliant: string;
      critical_non_compliant: string;
      without_action_plan: string;
    }>(
      `select
        count(*)::text as total,
        count(*) filter (where b.availability_id = 0)::text as available,
        count(*) filter (where b.availability_id = 1)::text as out_of_service,
        count(*) filter (where b.availability_id = 2)::text as contingency_outage,
        count(*) filter (where b.availability_id = 3)::text as degraded_contingency,
        count(*) filter (where b.availability_id = 4)::text as degraded,
        count(*) filter (where b.availability_id = 5)::text as unavailable,
        count(*) filter (where b.availability_id not in (0, 1, 2, 3, 4, 5))::text as other,
        count(*) filter (where b.compliance_id = 0)::text as compliant,
        count(*) filter (where b.compliance_id = 1)::text as non_compliant,
        count(*) filter (where b.compliance_id = 1 and b.criticality_id = 1)::text as critical_non_compliant,
        count(*) filter (where b.action_plan is null or b.action_plan = '')::text as without_action_plan
      from barriers b join locations loc on loc.id = b.location_id ${where.text}`,
      where.args,
    ),
    queryRows<{ id: string; count: string }>(
      `select b.availability_id::text as id, count(*)::text as count
       ${from} group by b.availability_id`,
      where.args,
    ),
    queryRows<{ id: string; count: string }>(
      `select b.compliance_id::text as id, count(*)::text as count
       ${from} group by b.compliance_id`,
      where.args,
    ),
    queryRows<{ id: string; count: string }>(
      `select b.criticality_id::text as id, count(*)::text as count
       ${from} group by b.criticality_id`,
      where.args,
    ),
  ]);

  const r = rows[0];
  const total = Number(r?.total ?? 0);
  const compliant = Number(r?.compliant ?? 0);

  // Collects GROUP BY rows into id-keyed buckets (wire keys stay numeric).
  const toBucket = (bucketRows: { id: string; count: string }[]) => {
    const bucket: Record<string, number> = {};
    for (const row of bucketRows) bucket[row.id] = Number(row.count ?? 0);
    return bucket;
  };

  return {
    total,
    available: Number(r?.available ?? 0),
    outOfService: Number(r?.out_of_service ?? 0),
    contingencyOutage: Number(r?.contingency_outage ?? 0),
    degradedContingency: Number(r?.degraded_contingency ?? 0),
    degraded: Number(r?.degraded ?? 0),
    unavailable: Number(r?.unavailable ?? 0),
    other: Number(r?.other ?? 0),
    compliant,
    nonCompliant: Number(r?.non_compliant ?? 0),
    criticalNonCompliant: Number(r?.critical_non_compliant ?? 0),
    withoutActionPlan: Number(r?.without_action_plan ?? 0),
    pctCompliant: total > 0 ? Math.round((compliant / total) * 100) : 0,
    byAvailability: toBucket(dispRows),
    byCompliance: toBucket(confRows),
    byCriticality: toBucket(critRows),
    syncedAt: new Date().toISOString(),
  };
}

// The one write path: calls record_status_change() (see db/schema.sql),
// which updates availability_id + status_since and appends history.
// Never UPDATE availability_id directly from application code.
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
