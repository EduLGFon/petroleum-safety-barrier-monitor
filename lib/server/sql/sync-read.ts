// Sync read repository - change lists, run history, and per-barrier diffs.
// Split out of sync.ts so the write/apply path and the read/audit path can be
// reviewed independently. All exports are re-exported by sync.ts.
import type {
  SyncBarrierDetail,
  SyncChange,
  SyncChangeItem,
  SyncChangeSummary,
  SyncRun,
} from "../../types.ts";
import {
  fromAvailabilityId,
  fromCategoryId,
  fromCriticalityId,
  fromGroupingId,
  fromLocationId,
  fromLocDescId,
  fromOwnerId,
  fromTypologyId,
} from "../../enums.ts";
import { isUndefinedTableError, queryRows } from "../db.ts";
import { memoGetOrCompute, scopeKey } from "../cache.ts";
import { getResolverLabels } from "./vocabularies.ts";
import { SYNC_AUTHOR_ID } from "./sync-constants.ts";
import type { SyncStatusRow } from "./sync-status.ts";

interface HistoryTouch {
  barrier_id: number;
  tag: string;
  location: string;
  status: string;
  note: string;
  changed_at: string;
}

// getSyncRecentChanges: newest barriers touched by the sync author (history
// rows stamped by applyPlan) plus recent soft deletes, merged by timestamp.
// Read-only; powers the card's "what changed" section so raw counts are
// never the whole story. Limit is clamped to 1..20.
export async function getSyncRecentChanges(limit = 8): Promise<SyncChange[]> {
  const take = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  const [touched, removed] = await Promise.all([
    queryRows<HistoryTouch>(
      `select b.id as barrier_id, b.tag,
        coalesce(l.name, l.code, '') as location,
        coalesce(s.label, '') as status, h.note,
        h.created_at as changed_at
       from barrier_status_history h
       join barriers b on b.id = h.barrier_id
       left join locations l on l.id = b.location_id
       left join availability_statuses s on s.id = h.status_id
       where h.author_id = $1
       order by h.created_at desc limit $2`,
      [SYNC_AUTHOR_ID, take],
    ),
    queryRows<
      Pick<HistoryTouch, "barrier_id" | "tag" | "location" | "changed_at">
    >(
      `select b.id as barrier_id, b.tag,
        coalesce(l.name, l.code, '') as location,
        b.deleted_at as changed_at
       from barriers b
       left join locations l on l.id = b.location_id
       where b.deleted_at is not null
       order by b.deleted_at desc limit $1`,
      [take],
    ),
  ]);
  const merged: SyncChange[] = [
    ...touched.map((r) => ({
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: (r.note === "Importado do Fracttal" ? "new" : "updated") as
        | "new"
        | "updated",
      status: r.status,
      changedAt: r.changed_at,
    })),
    ...removed.map((r) => ({
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: "removed" as const,
      status: "Removida",
      changedAt: r.changed_at,
    })),
  ];
  merged.sort((a, b) =>
    new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
  );
  return merged.slice(0, take);
}

// getLatestFinishedRun: newest non-running sync_state row, or null.
export async function getLatestFinishedRun(): Promise<SyncRun | null> {
  const rows = await queryRows<SyncStatusRow>(
    `select id, scope, status, inserts, updates, deletes, skips, note,
      started_at, finished_at
     from sync_state where status != 'running'
     order by id desc limit 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    scope: r.scope,
    status: r.status === "ok" ? "ok" : "failed",
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    inserts: r.inserts,
    updates: r.updates,
    deletes: r.deletes,
    skips: r.skips,
  };
}

// getSyncRuns: recent finished runs for the run picker (newest first).
export async function getSyncRuns(limit = 10): Promise<SyncRun[]> {
  const take = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  const rows = await queryRows<SyncStatusRow>(
    `select id, scope, status, inserts, updates, deletes, skips, note,
      started_at, finished_at
     from sync_state where status != 'running'
     order by id desc limit $1`,
    [take],
  );
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    status: r.status === "ok" ? "ok" : "failed",
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    inserts: r.inserts,
    updates: r.updates,
    deletes: r.deletes,
    skips: r.skips,
  }));
}

export interface ListSyncChangesArgs {
  runId?: number | null;
  sinceHours?: number | null;
  kind?: string | null;
  query?: string | null;
  page?: number;
  pageSize?: number;
  allowedLocationIds?: number[] | null;
}

export interface ListSyncChangesResult {
  run: SyncRun | null;
  items: SyncChangeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: SyncChangeSummary;
}

// listSyncChanges: paged per-barrier change list for one scope. Prefers the
// sync_barrier_changes audit when present; falls back to history + deletes
// for pre-migration runs so old runs still list something (without field
// diffs). Light rows only - snapshots load per barrier via detail.
export async function listSyncChanges(
  args: ListSyncChangesArgs = {},
): Promise<ListSyncChangesResult> {
  const page = Math.max(1, Math.floor(args.page ?? 1) || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Math.floor(args.pageSize ?? 25) || 25),
  );
  const offset = (page - 1) * pageSize;
  const kind = args.kind ?? null;
  const q = (args.query ?? "").trim().slice(0, 200);

  let run: SyncRun | null = null;
  let sinceIso: string | null = null;
  if (args.runId !== undefined && args.runId !== null) {
    const rows = await queryRows<SyncStatusRow>(
      `select id, scope, status, inserts, updates, deletes, skips, note,
        started_at, finished_at from sync_state where id = $1 limit 1`,
      [args.runId],
    );
    const r = rows[0];
    if (r) {
      run = {
        id: r.id,
        scope: r.scope,
        status: r.status === "ok" ? "ok" : "failed",
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        inserts: r.inserts,
        updates: r.updates,
        deletes: r.deletes,
        skips: r.skips,
      };
    }
  } else if (args.sinceHours !== undefined && args.sinceHours !== null) {
    const h = Math.max(1, Math.min(72, args.sinceHours));
    sinceIso = new Date(Date.now() - h * 3600_000).toISOString();
  } else {
    run = await getLatestFinishedRun();
  }

  // Primary path: audit table rows for the run, or last-N-hours window.
  try {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (run) {
      params.push(run.id);
      conds.push(`c.run_id = $${params.length}`);
    } else if (sinceIso) {
      params.push(sinceIso);
      conds.push(`c.created_at >= $${params.length}::timestamptz`);
    } else {
      return emptyChangeResult(page, pageSize, null);
    }
    if (kind && kind !== "all") {
      if (kind === "new") {
        params.push("new");
        conds.push(`c.kind = $${params.length}`);
      } else if (kind === "updated") {
        params.push(["updated", "restored"]);
        conds.push(`c.kind = any($${params.length})`);
      } else if (kind === "removed") {
        params.push("removed");
        conds.push(`c.kind = $${params.length}`);
      } else if (kind === "restored") {
        params.push("restored");
        conds.push(`c.kind = $${params.length}`);
      }
    }
    if (q !== "") {
      params.push(`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      conds.push(`b.tag ilike $${params.length} escape '\\'`);
    }
    // SECURITY: station access scope.
    if (Array.isArray(args.allowedLocationIds)) {
      if (args.allowedLocationIds.length === 0) {
        conds.push("false");
      } else {
        params.push(args.allowedLocationIds);
        conds.push(`b.location_id = any($${params.length})`);
      }
    }
    const where = conds.length > 0 ? `where ${conds.join(" and ")}` : "";
    // Single round-trip: the total rides along as count(*) OVER() so the
    // page and the count share one filtered scan. Out-of-range pages take
    // one cheap count query so totalPages stays exact.
    const rows = await queryRows<{
      barrier_id: number;
      tag: string;
      location: string;
      kind: string;
      old_availability_id: number | null;
      new_availability_id: number | null;
      old_status: string | null;
      new_status: string | null;
      changed_fields: unknown;
      created_at: string;
      run_id: number;
      criticality_id: number | null;
      full_count: string;
    }>(
      `select c.barrier_id, b.tag,
        coalesce(l.name, l.code, '') as location, c.kind,
        c.old_availability_id, c.new_availability_id,
        os.label as old_status, ns.label as new_status,
        c.changed_fields, c.created_at, c.run_id, b.criticality_id,
        count(*) over () as full_count
       from sync_barrier_changes c
       join barriers b on b.id = c.barrier_id
       left join locations l on l.id = b.location_id
       left join availability_statuses os on os.id = c.old_availability_id
       left join availability_statuses ns on ns.id = c.new_availability_id
       ${where} order by c.created_at desc, c.id desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    // The page-to-barrier joins are all to-one, so the window total matches
    // the old standalone count exactly.
    let total = rows.length > 0 ? Number(rows[0]?.full_count ?? 0) : 0;
    if (rows.length === 0 && offset > 0) {
      const countRows = await queryRows<{ n: number }>(
        `select count(*)::int as n from sync_barrier_changes c
         join barriers b on b.id = c.barrier_id ${where}`,
        params,
      );
      total = countRows[0]?.n ?? 0;
    }
    const items: SyncChangeItem[] = rows.map((r) => ({
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: (r.kind === "new"
        ? "new"
        : r.kind === "removed"
        ? "removed"
        : "updated") as "new" | "updated" | "removed",
      status: r.new_status ?? r.old_status ?? "",
      oldStatus: r.old_status,
      changedFields: Array.isArray(r.changed_fields)
        ? (r.changed_fields as string[])
        : [],
      changedAt: r.created_at,
      runId: r.run_id,
    }));
    const summary = run !== null
      // Finished runs are immutable: cache the summary per (run, scope) so
      // page turns share it instead of recomputing 3 aggregations per turn.
      // 60s TTL bounds staleness when the run is still in flight; live
      // windows (sinceIso, run null) stay uncached - the rows move.
      ? await memoGetOrCompute(
        scopeKey([
          "sync-summary",
          run.id,
          run.status,
          JSON.stringify(args.allowedLocationIds ?? null),
        ]),
        60_000,
        () =>
          summarizeAuditRows(run.id, sinceIso, args.allowedLocationIds),
      )
      : await summarizeAuditRows(
        null,
        sinceIso,
        args.allowedLocationIds,
      );
    return {
      run,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary,
    };
  } catch (err) {
    // Only a genuinely missing audit table may fall back. A DB outage or a
    // query bug must surface as 503, never as a plausible empty list.
    if (!isUndefinedTableError(err)) throw err;
    return listSyncChangesLegacy({
      run,
      sinceIso,
      kind,
      query: q,
      page,
      pageSize,
      allowedLocationIds: args.allowedLocationIds,
    });
  }
}

function emptyChangeResult(
  page: number,
  pageSize: number,
  run: SyncRun | null,
): ListSyncChangesResult {
  return {
    run,
    items: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
    summary: { total: 0, byKind: {}, byStatus: {}, critical: 0 },
  };
}

async function summarizeAuditRows(
  runId: number | null,
  sinceIso: string | null,
  allowedLocationIds?: number[] | null,
): Promise<SyncChangeSummary> {
  try {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (runId !== null) {
      params.push(runId);
      conds.push(`c.run_id = $${params.length}`);
    } else if (sinceIso) {
      params.push(sinceIso);
      conds.push(`c.created_at >= $${params.length}::timestamptz`);
    } else {
      return { total: 0, byKind: {}, byStatus: {}, critical: 0 };
    }
    if (Array.isArray(allowedLocationIds)) {
      if (allowedLocationIds.length === 0) {
        return { total: 0, byKind: {}, byStatus: {}, critical: 0 };
      }
      params.push(allowedLocationIds);
      conds.push(`b.location_id = any($${params.length})`);
    }
    const where = `where ${conds.join(" and ")}`;
    const [kindRows, statusRows, critRows] = await Promise.all([
      queryRows<{ kind: string; n: number }>(
        `select c.kind, count(*)::int as n from sync_barrier_changes c join barriers b on b.id = c.barrier_id ${where} group by c.kind`,
        params,
      ),
      queryRows<{ label: string; n: number }>(
        `select coalesce(ns.label, 'Removida') as label, count(*)::int as n
         from sync_barrier_changes c
         left join barriers b on b.id = c.barrier_id
         left join availability_statuses ns on ns.id = c.new_availability_id
         ${where} group by coalesce(ns.label, 'Removida')`,
        params,
      ),
      queryRows<{ n: number }>(
        `select count(*)::int as n from sync_barrier_changes c
         join barriers b on b.id = c.barrier_id ${where}
         and b.criticality_id in (0, 1)`,
        params,
      ),
    ]);
    const byKind: Record<string, number> = {};
    let total = 0;
    for (const r of kindRows) {
      byKind[r.kind] = r.n;
      total += r.n;
    }
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.label] = r.n;
    return { total, byKind, byStatus, critical: critRows[0]?.n ?? 0 };
  } catch (err) {
    // Pre-migration databases have no audit table yet; any other failure
    // must reach the route so it can answer 503.
    if (!isUndefinedTableError(err)) throw err;
    return { total: 0, byKind: {}, byStatus: {}, critical: 0 };
  }
}

// listSyncChangesLegacy: history-derived fallback for pre-migration runs.
// No changed_fields; status-only items, paged in memory (small windows).
async function listSyncChangesLegacy(args: {
  run: SyncRun | null;
  sinceIso: string | null;
  kind: string | null;
  query: string;
  page: number;
  pageSize: number;
  allowedLocationIds?: number[] | null;
}): Promise<ListSyncChangesResult> {
  const take = 200;
  let items: SyncChangeItem[] = [];
  if (args.run && !args.sinceIso) {
    const recent = await getSyncRecentChanges(take);
    const start = new Date(args.run.startedAt).getTime();
    const end = new Date(args.run.finishedAt).getTime() + 60_000;
    items = recent
      .filter((c) => {
        const t = new Date(c.changedAt).getTime();
        return t >= start && t <= end;
      })
      .map((c) => ({
        ...c,
        oldStatus: null,
        changedFields: [],
        runId: args.run!.id,
      }));
  } else if (args.sinceIso) {
    const recent = await getSyncRecentChanges(take);
    const since = new Date(args.sinceIso).getTime();
    items = recent
      .filter((c) => new Date(c.changedAt).getTime() >= since)
      .map((c) => ({ ...c, oldStatus: null, changedFields: [], runId: null }));
  }
  if (args.kind && args.kind !== "all") {
    items = items.filter((c) =>
      args.kind === "updated"
        ? c.kind === "updated"
        : c.kind === (args.kind as "new" | "updated" | "removed")
    );
  }
  if (args.query !== "") {
    const needle = args.query.toLowerCase();
    items = items.filter((c) => c.tag.toLowerCase().includes(needle));
  }
  if (Array.isArray(args.allowedLocationIds)) {
    if (args.allowedLocationIds.length === 0) {
      items = [];
    } else {
      const allowed = await queryRows<{ code: string }>(
        `select code from locations where id = any($1)`,
        [args.allowedLocationIds],
      );
      const codes = new Set(allowed.map((r) => r.code));
      items = items.filter((c) => codes.has(c.location));
    }
  }
  const total = items.length;
  const start = (args.page - 1) * args.pageSize;
  const byKind: Record<string, number> = {};
  for (const c of items) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  return {
    run: args.run,
    items: items.slice(start, start + args.pageSize),
    total,
    page: args.page,
    pageSize: args.pageSize,
    totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
    summary: { total, byKind, byStatus: {}, critical: 0 },
  };
}

// getBarrierSyncDetail: full before/after for one barrier in scope. Prefers
// the audit row; falls back to current barrier + history slice.
export async function getBarrierSyncDetail(
  barrierId: number,
  opts: { runId?: number | null; sinceHours?: number | null } = {},
): Promise<SyncBarrierDetail | null> {
  try {
    const conds = [`c.barrier_id = $1`];
    const params: unknown[] = [barrierId];
    if (opts.runId !== undefined && opts.runId !== null) {
      params.push(opts.runId);
      conds.push(`c.run_id = $${params.length}`);
    } else if (opts.sinceHours !== undefined && opts.sinceHours !== null) {
      const h = Math.max(1, Math.min(72, opts.sinceHours));
      params.push(new Date(Date.now() - h * 3600_000).toISOString());
      conds.push(`c.created_at >= $${params.length}::timestamptz`);
    }
    const rows = await queryRows<{
      barrier_id: number;
      tag: string;
      location: string;
      kind: string;
      old_availability_id: number | null;
      new_availability_id: number | null;
      changed_fields: unknown;
      old_snapshot: unknown;
      new_snapshot: unknown;
      created_at: string;
      run_id: number;
    }>(
      `select c.barrier_id, b.tag, coalesce(l.name, l.code, '') as location,
        c.kind, c.old_availability_id, c.new_availability_id,
        c.changed_fields, c.old_snapshot, c.new_snapshot,
        c.created_at, c.run_id
       from sync_barrier_changes c
       join barriers b on b.id = c.barrier_id
       left join locations l on l.id = b.location_id
       where ${conds.join(" and ")}
       order by c.created_at desc, c.id desc limit 1`,
      params,
    );
    const r = rows[0];
    if (!r) return null;
    const asRecord = (v: unknown): Record<string, unknown> =>
      typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
    const oldSnapshot = asRecord(r.old_snapshot);
    const newSnapshot = asRecord(r.new_snapshot);
    // Snapshots store numeric ids (typologyId, criticalityId, ...); bare
    // numbers mean nothing in the UI ("Tipologia 3 → 0"), so resolve id
    // fields to display labels before returning. DB vocabularies win over
    // seed enums (locations/categories are dynamic); a lookup failure
    // keeps raw ids and the client formats them via seed enums instead.
    try {
      const [labels, availRows, critRows] = await Promise.all([
        getResolverLabels(),
        queryRows<{ id: number; label: string }>(
          `select id, label from availability_statuses`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from criticality_levels`,
        ),
      ]);
      const avail: Record<number, string> = Object.fromEntries(
        availRows.map((x) => [x.id, x.label]),
      );
      const crit: Record<number, string> = Object.fromEntries(
        critRows.map((x) => [x.id, x.label]),
      );
      const resolveSnapshot = (
        snap: Record<string, unknown>,
      ): Record<string, unknown> => {
        const out: Record<string, unknown> = { ...snap };
        const num = (k: string): number | null => {
          const v = snap[k];
          return typeof v === "number" && Number.isInteger(v) ? v : null;
        };
        const id = num("locationId");
        if (id !== null) {
          out.locationId = labels.locations[id] ?? fromLocationId(id);
        }
        const typ = num("typologyId");
        if (typ !== null) {
          out.typologyId = labels.typologies[typ] ?? fromTypologyId(typ);
        }
        const loc = num("locDescId");
        if (loc !== null) {
          out.locDescId = labels.locDescs[loc] ?? fromLocDescId(loc);
        }
        const cri = num("criticalityId");
        if (cri !== null) {
          out.criticalityId = crit[cri] ?? fromCriticalityId(cri);
        }
        const cat = num("categoryId");
        if (cat !== null) {
          out.categoryId = labels.categories[cat] ?? fromCategoryId(cat);
        }
        const grp = num("groupingId");
        if (grp !== null) {
          out.groupingId = labels.groupings[grp] ?? fromGroupingId(grp);
        }
        const own = snap["ownerId"];
        if (typeof own === "number" && Number.isInteger(own)) {
          out.ownerId = own < 0 ? "" : labels.owners[own] ?? fromOwnerId(own);
        }
        const av = num("availabilityId");
        if (av !== null) {
          out.availabilityId = avail[av] ?? fromAvailabilityId(av);
        }
        return out;
      };
      return {
        barrierId: r.barrier_id,
        tag: r.tag,
        location: r.location,
        kind: (["new", "updated", "removed", "restored"] as const).includes(
            r.kind as "new",
          )
          ? (r.kind as SyncBarrierDetail["kind"])
          : "updated",
        oldAvailabilityId: r.old_availability_id,
        newAvailabilityId: r.new_availability_id,
        changedFields: Array.isArray(r.changed_fields)
          ? (r.changed_fields as string[])
          : [],
        oldSnapshot: resolveSnapshot(oldSnapshot),
        newSnapshot: resolveSnapshot(newSnapshot),
        changedAt: r.created_at,
        runId: r.run_id,
      };
    } catch {
      // Label lookups are best-effort; raw ids still render client-side.
    }
    return {
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: (["new", "updated", "removed", "restored"] as const).includes(
          r.kind as "new",
        )
        ? (r.kind as SyncBarrierDetail["kind"])
        : "updated",
      oldAvailabilityId: r.old_availability_id,
      newAvailabilityId: r.new_availability_id,
      changedFields: Array.isArray(r.changed_fields)
        ? (r.changed_fields as string[])
        : [],
      oldSnapshot: asRecord(r.old_snapshot),
      newSnapshot: asRecord(r.new_snapshot),
      changedAt: r.created_at,
      runId: r.run_id,
    };
  } catch (err) {
    // A missing optional table means no detail exists; anything else is an
    // infrastructure failure and must not masquerade as a 404.
    if (isUndefinedTableError(err)) return null;
    throw err;
  }
}
