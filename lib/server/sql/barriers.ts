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
import { buildWhere, resolveOrderBy, SORTABLE } from "./where.ts";
import { queryRows } from "../db.ts";

// Lists paged wire barriers + total for the given BarriersQuery filters.
// Single round-trip: the total rides along as count(*) OVER() on every row,
// so the page and the count share one filtered scan. Out-of-range pages
// (zero rows past offset 0) fall back to one count query so totalPages
// stays exact instead of reading 0.
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

  const rows = await queryRows<BarrierRow & { full_count: string }>(
    `select ${SELECT_COLUMNS}, count(*) over () as full_count
       from barriers b
       join locations loc on loc.id = b.location_id
       ${HISTORY_JOIN} ${where.text}
       order by ${orderBy} limit $${limitIdx} offset $${offsetIdx}`,
    [...where.args, pageSize, offset],
  );

  // Empty page past the first means either zero matches or a page beyond
  // the end. Zero matches need no second query; beyond-the-end pages take
  // one cheap count so totalPages stays exact.
  let total = rows.length > 0 ? Number(rows[0]?.full_count ?? 0) : 0;
  if (rows.length === 0 && offset > 0) {
    const countRows = await queryRows<{ count: string }>(
      `select count(*)::text as count from barriers b
       join locations loc on loc.id = b.location_id ${where.text}`,
      where.args,
    );
    total = Number(countRows[0]?.count ?? 0);
  }

  return {
    items: rows.map(toWireBarrier),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Fetches a single wire barrier by id, or null when missing/deleted.
// Admin callers pass includeDeleted to audit soft-deleted rows.
export async function getBarrierById(
  id: number,
  opts: { includeDeleted?: boolean } = {},
): Promise<WireBarrier | null> {
  const found = await getBarriersByIds([id], opts);
  return found.get(id) ?? null;
}

// listBarrierWindow: one page of wire rows without the count query, so an
// export can walk the whole scope in EXPORT_PAGE_ROWS steps and stream each
// batch out. b.id is appended as a tiebreaker: a single-column sort has ties
// (same TAG, same owner), and without a unique key Postgres may return them
// in a different order per page, which would drop or repeat rows mid-export.
export async function listBarrierWindow(
  q: BarriersQuery,
  limit: number,
  offset: number,
): Promise<WireBarrier[]> {
  const where = buildWhere(q);
  const orderBy = `${resolveOrderBy(q.sortCol, q.sortDir)}, b.id asc`;
  const rows = await queryRows<BarrierRow>(
    `select ${SELECT_COLUMNS} from barriers b
     join locations loc on loc.id = b.location_id
     ${HISTORY_JOIN} ${where.text}
     order by ${orderBy} limit $${where.args.length + 1} offset $${
      where.args.length + 2
    }`,
    [...where.args, Math.max(0, limit), Math.max(0, offset)],
  );
  return rows.map(toWireBarrier);
}

// WindowCursor: keyset position for export paging - the previous page's
// last row (its sort value plus the unique id tiebreaker).
export interface WindowCursor {
  sortVal: string | number | null;
  id: number;
}

// Cursor value expression and bind cast per sortable key. statusSince
// travels as YYYY-MM-DD text (driver Dates never cross the boundary);
// owner is the only nullable sort column and gets NULL-aware predicates.
function cursorSelect(sortKey: string): string {
  if (sortKey === "statusSince") {
    return `to_char(b.status_since, 'YYYY-MM-DD') as cursor_val`;
  }
  return `${SORTABLE[sortKey]} as cursor_val`;
}

// Builds the keyset predicate for the sort key and direction. Row
// comparisons keep the exact ORDER BY semantics of listBarrierWindow
// (same whitelist, same b.id tiebreaker, same NULL placement), so the
// keyset walk returns the identical sequence without OFFSET rescans.
function cursorPredicate(
  sortKey: string,
  dir: "asc" | "desc",
  valIdx: number,
  idIdx: number,
): string {
  const cast = sortKey === "statusSince"
    ? "date"
    : sortKey === "tag" || sortKey === "location"
    ? "text"
    : "int";
  if (sortKey === "id") return ""; // handled inline (id-only bind)
  const expr = SORTABLE[sortKey];
  const cmp = dir === "asc" ? ">" : "<";
  if (sortKey !== "owner") {
    return `(${expr} ${cmp} $${valIdx}::${cast} or ` +
      `(${expr} = $${valIdx}::${cast} and b.id > $${idIdx}))`;
  }
  // Nullable owner: ASC sorts NULLS LAST, DESC sorts NULLS FIRST. The
  // DESC null branch both continues within the leading NULLs and crosses
  // from them into the values below (every non-null row sorts after NULL).
  return dir === "asc"
    ? `((b.owner_id > $${valIdx}::int) or ` +
      `(b.owner_id = $${valIdx}::int and b.id > $${idIdx}) or ` +
      `(b.owner_id is null and ($${valIdx}::int is not null or b.id > $${idIdx})))`
    : `((b.owner_id < $${valIdx}::int) or ` +
      `(b.owner_id = $${valIdx}::int and b.id > $${idIdx}) or ` +
      `(b.owner_id is null and $${valIdx}::int is null and b.id > $${idIdx}) or ` +
      `($${valIdx}::int is null and b.owner_id is not null))`;
}

// listBarrierWindowAfter: keyset version of listBarrierWindow for full
// export walks. Same rows in the same order, but each page is an
// index-range scan past the previous page's cursor instead of an OFFSET
// rescan, so large sorted scopes (tag order) stream instead of stalling.
// Returns the rows plus the cursor for the next page (null on empty).
export async function listBarrierWindowAfter(
  q: BarriersQuery,
  limit: number,
  after: WindowCursor | null,
): Promise<{ rows: WireBarrier[]; cursor: WindowCursor | null }> {
  const sortKey = q.sortCol && SORTABLE[q.sortCol] ? q.sortCol : "id";
  const dir = q.sortDir === "desc" ? "desc" : "asc";
  const where = buildWhere(q);
  const orderBy = `${resolveOrderBy(q.sortCol, q.sortDir)}, b.id asc`;
  let text = `select ${SELECT_COLUMNS}, ${cursorSelect(sortKey)} from barriers b
     join locations loc on loc.id = b.location_id
     ${HISTORY_JOIN} ${where.text}`;
  let args: unknown[] = [...where.args];
  if (after !== null) {
    // NOTE: id binds only the id (no sort value), so every bound param is
    // referenced - Postgres rejects statements with uninferrable params.
    if (sortKey === "id") {
      const idIdx = args.length + 1;
      text += dir === "asc" ? ` and b.id > $${idIdx}` : ` and b.id < $${idIdx}`;
      args = [...args, after.id];
    } else {
      const valIdx = args.length + 1;
      const idIdx = args.length + 2;
      text += ` and ${cursorPredicate(sortKey, dir, valIdx, idIdx)}`;
      args = [...args, after.sortVal, after.id];
    }
  }
  const rows = await queryRows<BarrierRow & { cursor_val: unknown }>(
    `${text} order by ${orderBy} limit $${args.length + 1}`,
    [...args, Math.max(0, limit)],
  );
  const last = rows[rows.length - 1];
  return {
    rows: rows.map(toWireBarrier),
    cursor: last === undefined ? null : {
      sortVal: last.cursor_val as string | number | null,
      id: last.id,
    },
  };
}

// getBarriersByIds: batch version of getBarrierById (the alert detector
// resolves hundreds of candidates per run - one query each would stall it).
// Chunked IN lists keep placeholder counts bounded; missing/deleted ids are
// simply absent from the map unless includeDeleted grants the admin view.
export async function getBarriersByIds(
  ids: number[],
  opts: { includeDeleted?: boolean } = {},
): Promise<Map<number, WireBarrier>> {
  const out = new Map<number, WireBarrier>();
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n));
  for (let at = 0; at < unique.length; at += 500) {
    const chunk = unique.slice(at, at + 500);
    const placeholders = chunk.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await queryRows<BarrierRow>(
      `select ${SELECT_COLUMNS} from barriers b
       join locations loc on loc.id = b.location_id
       ${HISTORY_JOIN}
       where b.id in (${placeholders})${
        opts.includeDeleted ? "" : " and b.deleted_at is null"
      }`,
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
// (GROUP BY) so new statuses reconcile instead of vanishing. Admin callers
// pass scopeCounts to also receive inactive/deleted totals over the same
// filter subset ignoring rowScope (band segments); it stays off otherwise
// so hidden rows never leak into non-admin snapshots.
export async function getKpi(
  filter?: number | BarriersQuery,
  opts: { scopeCounts?: boolean } = {},
): Promise<WireKpiSnapshot> {
  const q: BarriersQuery = typeof filter === "number"
    ? { locationId: filter }
    : filter ?? {};
  const where = buildWhere(q);
  const from =
    `from barriers b join locations loc on loc.id = b.location_id ${where.text}`;
  // Scope-wide visibility counts ignore rowScope but keep every other
  // filter, so the band segments match the table they shortcut to.
  const scopeWhere = opts.scopeCounts
    ? buildWhere({ ...q, rowScope: "all" })
    : null;
  const [rows, bucketRows] = await Promise.all([
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
        count(*) filter (where coalesce(b.compliance_id, 1) <> 0)::text as non_compliant,
        count(*) filter (where coalesce(b.compliance_id, 1) <> 0 and b.criticality_id in (0, 1))::text as critical_non_compliant,
        count(*) filter (where b.action_plan is null or b.action_plan = '')::text as without_action_plan
      from barriers b join locations loc on loc.id = b.location_id ${where.text}`,
      where.args,
    ),
    // One round-trip for all four dynamic buckets: each branch is the
    // previous GROUP BY verbatim (same filter subset, same fail-closed NC
    // definition), tagged and concatenated, grouped once outside.
    // NOTE: ${from} already contains the WHERE clause; the fourth branch
    // appends AND so its filter subset stays identical to the old query.
    queryRows<{ grp: string; id: string; count: string }>(
      `select grp, id, count(*)::text as count from (
        select 'avail' as grp, b.availability_id::text as id
        ${from}
        union all
        select 'conf' as grp, b.compliance_id::text as id
        ${from}
        union all
        select 'crit' as grp, b.criticality_id::text as id
        ${from}
        union all
        select 'nccrit' as grp, b.criticality_id::text as id
        ${from} and coalesce(b.compliance_id, 1) <> 0
      ) g group by grp, id`,
      where.args,
    ),
  ]);
  const dispRows = bucketRows.filter((r) => r.grp === "avail");
  const confRows = bucketRows.filter((r) => r.grp === "conf");
  const critRows = bucketRows.filter((r) => r.grp === "crit");
  const ncCritRows = bucketRows.filter((r) => r.grp === "nccrit");

  // Visibility scope counts (admin band segments only): live-but-disabled
  // rows plus soft-deleted rows over the unscoped filter subset. A separate
  // round-trip gated on the flag, so non-admin snapshots never observe
  // hidden rows.
  const scopeRows = scopeWhere
    ? await queryRows<{ inactive: string; deleted: string }>(
      `select
         count(*) filter (where b.deleted_at is null and not coalesce(b.is_active, true))::text as inactive,
         count(*) filter (where b.deleted_at is not null)::text as deleted
       from barriers b join locations loc on loc.id = b.location_id ${scopeWhere.text}`,
      scopeWhere.args,
    )
    : [];

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
    pctCompliant: total > 0 ? Math.round((compliant / total) * 1000) / 10 : 0,
    byAvailability: toBucket(dispRows),
    byCompliance: toBucket(confRows),
    byCriticality: toBucket(critRows),
    ncByCriticality: toBucket(ncCritRows),
    inactive: Number(scopeRows[0]?.inactive ?? 0),
    deleted: Number(scopeRows[0]?.deleted ?? 0),
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

export interface BarrierUpdatePayload {
  tag?: string;
  locationId?: number;
  typologyId?: number;
  categoryId?: number;
  groupingId?: number;
  ownerId?: number | null;
  criticalityId?: number;
  comments?: string;
  actionPlan?: string;
  origin?: string;
  installLocal?: string;
  equipTypology?: string;
  fieldInstalled?: string;
  fieldOperational?: string;
  opStatus?: string;
  hasMaintPlan?: string;
  planFollowed?: string;
  failureFree?: string;
  maintStatus?: string;
  hasContingency?: string;
  contingencyDesc?: string;
  evidenceCode?: string;
  degradationDesc?: string;
  extraComments?: string;
}

// updateBarrier: updates editable metadata and sheet inventory fields.
// Availability is excluded here (routes through transitionBarrierStatus).
export async function updateBarrier(
  id: number,
  patch: BarrierUpdatePayload,
): Promise<WireBarrier | null> {
  const sets: string[] = [];
  const args: unknown[] = [id];

  const add = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };

  if (patch.tag !== undefined) add("tag", patch.tag.trim());
  if (patch.locationId !== undefined) add("location_id", patch.locationId);
  if (patch.typologyId !== undefined) add("typology_id", patch.typologyId);
  if (patch.categoryId !== undefined) add("category_id", patch.categoryId);
  if (patch.groupingId !== undefined) add("grouping_id", patch.groupingId);
  if (patch.ownerId !== undefined) {
    add(
      "owner_id",
      patch.ownerId == null || patch.ownerId <= 0 ? null : patch.ownerId,
    );
  }
  if (patch.criticalityId !== undefined) {
    add("criticality_id", patch.criticalityId);
  }
  if (patch.comments !== undefined) add("comments", patch.comments.trim());
  if (patch.actionPlan !== undefined) {
    add("action_plan", patch.actionPlan.trim());
  }
  if (patch.origin !== undefined) add("origin", patch.origin.trim() || null);
  if (patch.installLocal !== undefined) {
    add("install_local", patch.installLocal.trim() || null);
  }
  if (patch.equipTypology !== undefined) {
    add("equip_typology", patch.equipTypology.trim() || null);
  }
  if (patch.fieldInstalled !== undefined) {
    add("field_installed", patch.fieldInstalled.trim() || null);
  }
  if (patch.fieldOperational !== undefined) {
    add("field_operational", patch.fieldOperational.trim() || null);
  }
  if (patch.opStatus !== undefined) {
    add("op_status", patch.opStatus.trim() || null);
  }
  if (patch.hasMaintPlan !== undefined) {
    add("has_maint_plan", patch.hasMaintPlan.trim() || null);
  }
  if (patch.planFollowed !== undefined) {
    add("plan_followed", patch.planFollowed.trim() || null);
  }
  if (patch.failureFree !== undefined) {
    add("failure_free", patch.failureFree.trim() || null);
  }
  if (patch.maintStatus !== undefined) {
    add("maint_status", patch.maintStatus.trim() || null);
  }
  if (patch.hasContingency !== undefined) {
    add("has_contingency", patch.hasContingency.trim() || null);
  }
  if (patch.contingencyDesc !== undefined) {
    add("contingency_desc", patch.contingencyDesc.trim() || null);
  }
  if (patch.evidenceCode !== undefined) {
    add("evidence_code", patch.evidenceCode.trim() || null);
  }
  if (patch.degradationDesc !== undefined) {
    add("degradation_desc", patch.degradationDesc.trim() || null);
  }
  if (patch.extraComments !== undefined) {
    add("extra_comments", patch.extraComments.trim() || null);
  }

  if (sets.length > 0) {
    await queryRows(
      `update barriers set ${
        sets.join(", ")
      } where id = $1 and deleted_at is null`,
      args,
    );
  }
  return getBarrierById(id);
}
