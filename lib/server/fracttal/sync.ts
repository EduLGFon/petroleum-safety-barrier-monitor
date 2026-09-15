// Fracttal sync orchestrator (P3) - idempotent reconcile plan + runner.
// This is why it exists: P3 needs rows to land idempotently, deletions soft.
// The planner is pure (unit-testable headless); the runner wires a remote
// source through parse -> map -> reconcile -> apply, with every write behind
// a dry-run flag. Real SQL I/O comes from lib/server/sql/sync.ts via
// defaultSyncIo (imported lazily so fixtures/tests can run without a DB).
import type { MapContext, SyncBarrierInput } from "./map.ts";

import type { WorkEventsResolver } from "./work.ts";

import { parsePage } from "./client.ts";

import { mapAsset } from "./map.ts";

export interface LocalBarrier {
  id: number;
  externalCode: string;
  availabilityId: number;
  deletedAt: string | null;
  signature: string;
}

export type PlanEntry =
  | { kind: "insert"; input: SyncBarrierInput }
  | {
    kind: "update";
    local: LocalBarrier;
    input: SyncBarrierInput;
    statusChanged: boolean;
  }
  | {
    kind: "restore";
    local: LocalBarrier;
    input: SyncBarrierInput;
    statusChanged: boolean;
  }
  | { kind: "delete"; local: LocalBarrier }
  | { kind: "skip"; code: string; reason: string };

export interface PlanCounts {
  inserts: number;
  updates: number;
  deletes: number;
  skips: number;
}

export interface SyncPlan {
  entries: PlanEntry[];
  counts: PlanCounts;
}

export interface SyncIo {
  buildMapContext(): Promise<MapContext>;
  // loadLocal: local barriers that could match this sync, scoped to the
  // location set the remote rows resolved to (deletion is per-scope, so a
  // one-station sync can never retire another station's barriers).
  loadLocal(scopeLocationIds: number[]): Promise<LocalBarrier[]>;
  startRun(scope: string): Promise<number>;
  applyPlan(entries: PlanEntry[]): Promise<PlanCounts>;
  finishRun(
    runId: number,
    status: "ok" | "failed",
    counts: PlanCounts,
    note: string,
  ): Promise<void>;
}

// SignatureSource: the ten fields that drive change detection (shared with
// the SQL repo so stored-row signatures and planner signatures never drift).
export type SignatureSource = Pick<
  SyncBarrierInput,
  | "tag"
  | "locationId"
  | "typologyId"
  | "locDescId"
  | "criticalityId"
  | "categoryId"
  | "groupingId"
  | "ownerId"
  | "comments"
  | "actionPlan"
>;

// fieldsSignature: two rows with the same signature and status are identical
// and never rewritten. ORDER IS PART OF THE CONTRACT - keep in step with the
// stored signature built by lib/server/sql/sync.ts.
export function fieldsSignature(input: SignatureSource): string {
  return JSON.stringify([
    input.tag,
    input.locationId,
    input.typologyId,
    input.locDescId,
    input.criticalityId,
    input.categoryId,
    input.groupingId,
    input.ownerId,
    input.comments,
    input.actionPlan,
  ]);
}

// planReconcile: pure diff of remote inputs vs local rows -> executable plan.
// Deleted local rows reappearing upstream are restored, never duplicated.
export function planReconcile(
  remote: SyncBarrierInput[],
  local: LocalBarrier[],
): SyncPlan {
  const byCode = new Map<string, LocalBarrier>();
  for (const row of local) byCode.set(row.externalCode, row);

  const entries: PlanEntry[] = [];
  const touched = new Set<string>();
  for (const input of remote) {
    touched.add(input.externalCode);
    const existing = byCode.get(input.externalCode);
    if (!existing) {
      entries.push({ kind: "insert", input });
      continue;
    }
    const signature = fieldsSignature(input);
    const statusChanged = existing.availabilityId !== input.availabilityId;
    if (existing.deletedAt !== null) {
      entries.push({ kind: "restore", local: existing, input, statusChanged });
      continue;
    }
    if (signature === existing.signature && !statusChanged) {
      entries.push({
        kind: "skip",
        code: input.externalCode,
        reason: "unchanged",
      });
      continue;
    }
    entries.push({ kind: "update", local: existing, input, statusChanged });
  }

  // Deletions: scoped locals absent upstream are soft-deleted; rows already
  // deleted stay untouched so later restores keep a clean signal.
  for (const [code, row] of byCode) {
    if (touched.has(code)) continue;
    if (row.deletedAt !== null) continue;
    entries.push({ kind: "delete", local: row });
  }

  return { entries, counts: countPlan(entries) };
}

export function countPlan(entries: PlanEntry[]): PlanCounts {
  const counts: PlanCounts = { inserts: 0, updates: 0, deletes: 0, skips: 0 };
  for (const e of entries) {
    counts[
      e.kind === "update" || e.kind === "restore"
        ? "updates"
        : e.kind === "insert"
        ? "inserts"
        : e.kind === "delete"
        ? "deletes"
        : "skips"
    ]++;
  }
  return counts;
}

export interface SyncResult {
  scope: string;
  fetchedAt: string;
  parsed: number;
  malformed: Array<{ index: number; reason: string }>;
  mappingSkips: Array<{ code: string; reason: string }>;
  mappingWarnings: Array<{ code: string; warning: string }>;
  plan: SyncPlan;
  written: PlanCounts | null;
  runId: number | null;
  status: "ok" | "failed";
}

export interface SyncOptions {
  dryRun?: boolean; // default true
  scope?: string; // label for sync_state
  now?: () => Date;
  io?: SyncIo; // default: real SQL repo (see lib/server/sql/sync.ts)
  // workEvents: prebuilt per-code work signals (the caller fetches work
  // orders/requests BEFORE runSync, so a fetch failure aborts with zero
  // writes instead of decaying statuses). Null = asset signals only.
  workEvents?: WorkEventsResolver | null;
}

// defaultSyncIo: lazily imported so tests importing this module do not pull
// the DB pool (DATABASE_URL may be unset in headless runs).
let defaultIoPromise: Promise<SyncIo> | null = null;
export function getDefaultSyncIo(): Promise<SyncIo> {
  defaultIoPromise ??= import("../sql/sync.ts").then((m) => m.defaultSyncIo);
  return defaultIoPromise;
}

// runSync: parse -> map -> reconcile -> (apply unless dry-run), then an
// audit row in sync_state. Failed runs are recorded and rethrown so the
// caller (script / later ops notifier) can alert separately from barrier
// alerts - failures must never go silent.
export async function runSync(
  source: () => Promise<unknown[]>,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const io = options.io ?? await getDefaultSyncIo();
  const scope = options.scope ?? "fixture";
  const now = options.now ?? (() => new Date());
  const dryRun = options.dryRun ?? true;
  const started = now();
  const runId = dryRun ? null : await io.startRun(scope);

  const emptyPlan: SyncPlan = {
    entries: [],
    counts: { inserts: 0, updates: 0, deletes: 0, skips: 0 },
  };
  const baseResult: SyncResult = {
    scope,
    fetchedAt: started.toISOString(),
    parsed: 0,
    malformed: [],
    mappingSkips: [],
    mappingWarnings: [],
    plan: emptyPlan,
    written: null,
    runId,
    status: "ok",
  };

  // finish: the sync_state audit uses ACTUAL applied counts for mutations
  // and counts malformed/unmapped/skipped rows as skips, so the row always
  // reconciles to (inserts+updates+deletes+skips) >= rows seen.
  const finish = async (
    applied: PlanCounts,
    status: "ok" | "failed",
    note: string,
  ) => {
    if (dryRun) return;
    const counts: PlanCounts = {
      ...applied,
      skips: baseResult.plan.counts.skips + baseResult.malformed.length +
        baseResult.mappingSkips.length,
    };
    await io.finishRun(runId!, status, counts, note);
  };

  try {
    const rows = await source();
    baseResult.parsed = rows.length;
    const parsed = parsePage({ data: rows });
    baseResult.malformed = parsed.malformed;

    const ctx = await io.buildMapContext();
    const inputs: SyncBarrierInput[] = [];
    const mappingSkips: Array<{ code: string; reason: string }> = [];
    const mappingWarnings: Array<{ code: string; warning: string }> = [];
    const workEvents = options.workEvents ?? null;
    for (const item of parsed.items) {
      const mapped = mapAsset(
        item,
        ctx,
        workEvents ? { work: workEvents(item.code) } : {},
      );
      if (mapped.ok) {
        inputs.push(mapped.input);
        for (const warning of mapped.warnings) {
          mappingWarnings.push({ code: item.code, warning });
        }
      } else {
        mappingSkips.push({ code: item.code, reason: mapped.reason });
      }
    }
    baseResult.mappingSkips = mappingSkips;
    baseResult.mappingWarnings = mappingWarnings;

    const scopeLocationIds = [...new Set(inputs.map((i) => i.locationId))];
    const local = await io.loadLocal(scopeLocationIds);

    const plan = planReconcile(inputs, local);
    baseResult.plan = plan;

    if (dryRun) return baseResult;

    const executable = plan.entries.filter((e) => e.kind !== "skip");
    const written = await io.applyPlan(executable);
    baseResult.written = written;
    await finish(written, "ok", "");
    return baseResult;
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    await finish(
      { inserts: 0, updates: 0, deletes: 0, skips: 0 },
      "failed",
      note,
    );
    throw new Error(`[sync] ${note}`);
  }
}
