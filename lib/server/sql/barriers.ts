// Barriers repository - every SQL statement the API routes need.
// This is why it exists: single place for barrier queries against the
// Deno-native pool. All values are bound as $1/$2 args; ORDER BY uses a
// fixed whitelist so client input can never become SQL.
import type {
  BarriersQuery,
  BarriersResponse,
  WireBarrier,
} from "../../wireTypes.ts";

import {
  type BarrierRow,
  HISTORY_JOIN,
  LIST_JOIN,
  SELECT_COLUMNS,
  SELECT_LIST_COLUMNS,
  toWireBarrier,
} from "./mappers.ts";

import {
  FIELD_COLUMNS,
  mergeOwnership,
  type OwnableFieldKey,
} from "../../field-ownership.ts";

export {
  CONTINGENCY_LATERAL,
  HISTORY_JOIN,
  LIST_JOIN,
  SELECT_COLUMNS,
  SELECT_LIST_COLUMNS,
  toHistory,
  toWireBarrier,
} from "./mappers.ts";

export { buildWhere, escapeLike, resolveOrderBy, SORTABLE } from "./where.ts";

import { buildWhere, resolveOrderBy, SORTABLE } from "./where.ts";

export type { BarrierRow, HistoryEntry } from "./mappers.ts";

import { queryRows, type TxQuery } from "../db.ts";

import { EXPORT_MAX_ROWS } from "../../export/limits.ts";

// Lists paged wire barriers + total for the given BarriersQuery filters.
// Single round-trip: the total rides along as count(*) OVER() on every row,
// so the page and the count share one filtered scan. Out-of-range pages
// (zero rows past offset 0) fall back to one count query so totalPages
// stays exact instead of reading 0.
// List projection: scalars + contingency only, NO history lateral (the
// detail modal fetches history via getBarrierById). Page size is capped at
// 1000: bulk flows must use the streaming export walk or the ids listing,
// never a giant page.
export async function listBarriers(
  q: BarriersQuery,
): Promise<BarriersResponse> {
  // Floors fractional input (page=1.5 would otherwise yield fractional OFFSET);
  // NaN falls back to defaults via ||.
  const page = Math.max(1, Math.floor(q.page ?? 1) || 1);
  const pageSize = Math.min(
    1000,
    Math.max(1, Math.floor(q.pageSize ?? 25) || 25),
  );
  const offset = (page - 1) * pageSize;
  const where = buildWhere(q);
  const orderBy = resolveOrderBy(q.sortCol, q.sortDir);
  const limitIdx = where.args.length + 1;
  const offsetIdx = where.args.length + 2;

  const rows = await queryRows<BarrierRow & { full_count: string }>(
    `select ${SELECT_LIST_COLUMNS}, count(*) over () as full_count
       from barriers b
       join locations loc on loc.id = b.location_id
       ${LIST_JOIN} ${where.text}
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
  opts: { includeDeleted?: boolean; query?: TxQuery } = {},
): Promise<WireBarrier | null> {
  const found = await getBarriersByIds([id], opts);
  return found.get(id) ?? null;
}

// listBarrierWindow: one page of wire rows without the count query, so an
// export can walk the whole scope in EXPORT_PAGE_ROWS steps and stream each
// batch out. b.id is appended as a tiebreaker: a single-column sort has ties
// (same TAG, same owner), and without a unique key Postgres may return them
// in a different order per page, which would drop or repeat rows mid-export.
// List projection (no history lateral): exports render table columns only.
export async function listBarrierWindow(
  q: BarriersQuery,
  limit: number,
  offset: number,
): Promise<WireBarrier[]> {
  const where = buildWhere(q);
  const orderBy = `${resolveOrderBy(q.sortCol, q.sortDir)}, b.id asc`;
  const rows = await queryRows<BarrierRow>(
    `select ${SELECT_LIST_COLUMNS} from barriers b
     join locations loc on loc.id = b.location_id
     ${LIST_JOIN} ${where.text}
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
  const cast = sortKey === "statusSince" ? "date" : "text";
  if (sortKey === "id") return ""; // handled inline (id-only bind)
  const expr = SORTABLE[sortKey];
  const cmp = dir === "asc" ? ">" : "<";
  // Every sortable label is coalesced to text in SORTABLE, so no
  // NULL-aware branch is needed (owner/contingency included).
  return `(${expr} ${cmp} $${valIdx}::${cast} or ` +
    `(${expr} = $${valIdx}::${cast} and b.id > $${idIdx}))`;
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
  let text = `select ${SELECT_LIST_COLUMNS}, ${
    cursorSelect(sortKey)
  } from barriers b
     join locations loc on loc.id = b.location_id
     ${LIST_JOIN} ${where.text}`;
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
// Full projection (with history): detail, alerts and PATCH paths only.
export async function getBarriersByIds(
  ids: number[],
  opts: { includeDeleted?: boolean; query?: TxQuery } = {},
): Promise<Map<number, WireBarrier>> {
  const out = new Map<number, WireBarrier>();
  const q = opts.query ?? queryRows;
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n));
  for (let at = 0; at < unique.length; at += 500) {
    const chunk = unique.slice(at, at + 500);
    const placeholders = chunk.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await q<BarrierRow>(
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

// listBarrierIds: id-only walk over the filter scope for "select all that
// match" and bulk id resolution. No history lateral, no wide columns, capped
// at EXPORT_MAX_ROWS so a single call never materializes an unbounded array.
// Keeps the contingency lateral: contingency sort references it. The table
// selection only needs ids; full rows come from the page or export.
export async function listBarrierIds(q: BarriersQuery): Promise<number[]> {
  const where = buildWhere(q);
  const orderBy = `${resolveOrderBy(q.sortCol, q.sortDir)}, b.id asc`;
  const lim = where.args.length + 1;
  const rows = await queryRows<{ id: number }>(
    `select b.id from barriers b
     join locations loc on loc.id = b.location_id
     ${LIST_JOIN} ${where.text}
     order by ${orderBy} limit $${lim}`,
    [...where.args, EXPORT_MAX_ROWS],
  );
  return rows.map((r) => r.id);
}

// Computes KPI snapshot counts over the given filters (location-only callers
// pass a bare id, which keeps the old call shape working). Fixed fields
// cover the well-known statuses; dynamic by* buckets carry EVERY id present
// (GROUP BY) so new statuses reconcile instead of vanishing. Admin callers
// pass scopeCounts to also receive inactive/deleted totals over the same
// filter subset ignoring rowScope (band segments); it stays off otherwise
// so hidden rows never leak into non-admin snapshots.
// The one write path: calls record_status_change() (see db/schema.sql),
// which updates availability_id + status_since and appends history.
// Never UPDATE availability_id directly from application code (the DB
// guard trigger rejects it). No-op when the status already matches, so
// retried PATCHes never duplicate history rows or re-fire alerts.
export async function transitionBarrierStatus(
  barrierId: number,
  statusId: number,
  authorId: number,
  note = "",
  query?: TxQuery,
): Promise<WireBarrier | null> {
  const q = query ?? queryRows;
  // Lock the row so two concurrent transitions cannot both observe the old
  // status and append duplicate history rows.
  await q("select id from barriers where id = $1 for update", [barrierId]);
  const current = await getBarrierById(barrierId, { query: q });
  if (!current) return null;
  if (current.availabilityId === statusId) return current;
  await q("select record_status_change($1, $2, $3, $4)", [
    barrierId,
    statusId,
    authorId,
    note,
  ]);
  return getBarrierById(barrierId, { query: q });
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
// Every key sent with a value joins barriers.manual_fields, so the Fracttal
// sync stops overwriting it; opts.releaseFields removes keys (validated by
// the caller - unknown entries throw) so they follow the sync again.
export async function updateBarrier(
  id: number,
  patch: BarrierUpdatePayload,
  opts: { releaseFields?: string[]; query?: TxQuery } = {},
): Promise<WireBarrier | null> {
  const q = opts.query ?? queryRows;
  const sets: string[] = [];
  const args: unknown[] = [id];

  const add = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };

  const owned: string[] = [];
  const own = (key: string, present: boolean) => {
    if (present) owned.push(key);
  };

  if (patch.tag !== undefined) {
    add("tag", patch.tag.trim());
    own("tag", true);
  }
  if (patch.locationId !== undefined) {
    add("location_id", patch.locationId);
    own("locationId", true);
  }
  if (patch.typologyId !== undefined) {
    add("typology_id", patch.typologyId);
    own("typologyId", true);
  }
  if (patch.categoryId !== undefined) {
    add("category_id", patch.categoryId);
    own("categoryId", true);
  }
  if (patch.groupingId !== undefined) {
    add("grouping_id", patch.groupingId);
    own("groupingId", true);
  }
  if (patch.ownerId !== undefined) {
    add(
      "owner_id",
      patch.ownerId == null || patch.ownerId <= 0 ? null : patch.ownerId,
    );
    own("ownerId", true);
  }
  if (patch.criticalityId !== undefined) {
    add("criticality_id", patch.criticalityId);
    own("criticalityId", true);
  }
  if (patch.comments !== undefined) {
    add("comments", patch.comments.trim());
    own("comments", true);
  }
  if (patch.actionPlan !== undefined) {
    add("action_plan", patch.actionPlan.trim());
    own("actionPlan", true);
  }
  if (patch.origin !== undefined) {
    add("origin", patch.origin.trim() || null);
    own("origin", true);
  }
  if (patch.installLocal !== undefined) {
    add("install_local", patch.installLocal.trim() || null);
    own("installLocal", true);
  }
  if (patch.equipTypology !== undefined) {
    add("equip_typology", patch.equipTypology.trim() || null);
    own("equipTypology", true);
  }
  if (patch.fieldInstalled !== undefined) {
    add("field_installed", patch.fieldInstalled.trim() || null);
    own("fieldInstalled", true);
  }
  if (patch.fieldOperational !== undefined) {
    add("field_operational", patch.fieldOperational.trim() || null);
    own("fieldOperational", true);
  }
  if (patch.opStatus !== undefined) {
    add("op_status", patch.opStatus.trim() || null);
    own("opStatus", true);
  }
  if (patch.hasMaintPlan !== undefined) {
    add("has_maint_plan", patch.hasMaintPlan.trim() || null);
    own("hasMaintPlan", true);
  }
  if (patch.planFollowed !== undefined) {
    add("plan_followed", patch.planFollowed.trim() || null);
    own("planFollowed", true);
  }
  if (patch.failureFree !== undefined) {
    add("failure_free", patch.failureFree.trim() || null);
    own("failureFree", true);
  }
  if (patch.maintStatus !== undefined) {
    add("maint_status", patch.maintStatus.trim() || null);
    own("maintStatus", true);
  }
  if (patch.hasContingency !== undefined) {
    add("has_contingency", patch.hasContingency.trim() || null);
    own("hasContingency", true);
  }
  if (patch.contingencyDesc !== undefined) {
    add("contingency_desc", patch.contingencyDesc.trim() || null);
    own("contingencyDesc", true);
  }
  if (patch.evidenceCode !== undefined) {
    add("evidence_code", patch.evidenceCode.trim() || null);
    own("evidenceCode", true);
  }
  if (patch.degradationDesc !== undefined) {
    add("degradation_desc", patch.degradationDesc.trim() || null);
    own("degradationDesc", true);
  }
  if (patch.extraComments !== undefined) {
    add("extra_comments", patch.extraComments.trim() || null);
    own("extraComments", true);
  }

  const release = opts.releaseFields ?? [];
  if (owned.length > 0 || release.length > 0) {
    // Only newly-different values join manual_fields: the editor submits
    // every field on save, and a no-change save must not freeze the row.
    const current = await q<Record<string, unknown>>(
      `select tag, location_id, typology_id, category_id, grouping_id,
              owner_id, criticality_id, comments, action_plan, origin,
              install_local, equip_typology, field_installed,
              field_operational, op_status, has_maint_plan, plan_followed,
              failure_free, maint_status, has_contingency, contingency_desc,
              evidence_code, degradation_desc, extra_comments, manual_fields
         from barriers where id = $1 for update`,
      [id],
    );
    const cur = current[0];
    const norm = (v: unknown) =>
      (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
    const changed = (key: string): boolean => {
      if (!cur) return true;
      switch (key) {
        case "ownerId":
          return (patch.ownerId == null || patch.ownerId <= 0
            ? null
            : patch.ownerId) !== (cur["owner_id"] as number | null);
        case "comments":
        case "actionPlan":
        case "tag": {
          const col = key === "comments"
            ? "comments"
            : key === "actionPlan"
            ? "action_plan"
            : "tag";
          const raw = patch[key as "comments" | "actionPlan" | "tag"];
          return (raw ?? "").trim() !== norm(cur[col]);
        }
        default: {
          const col = FIELD_COLUMNS[key as OwnableFieldKey];
          const raw = patch[key as keyof BarrierUpdatePayload];
          const next = typeof raw === "number"
            ? raw
            : (typeof raw === "string" ? raw.trim() : "") || null;
          const prev = (cur[col] as number | string | null) ?? null;
          return (next ?? "") !== (prev ?? "");
        }
      }
    };
    const next = mergeOwnership(
      (cur?.["manual_fields"] as string[] | null) ?? [],
      owned.filter(changed),
      release,
    );
    args.push(next);
    sets.push(`manual_fields = $${args.length}`);
  }

  if (sets.length > 0) {
    await q(
      `update barriers set ${
        sets.join(", ")
      } where id = $1 and deleted_at is null`,
      args,
    );
  }
  return getBarrierById(id, { query: q });
}

// KPI aggregation lives in kpi.ts to keep the list/write path smaller.
export { getKpi } from "./kpi.ts";
