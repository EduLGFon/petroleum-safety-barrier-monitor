// Alert store contract - what the cycle needs from persistence.
// This is why it exists: the cycle (detect -> enqueue -> send -> mark) is
// pure orchestration over this interface, so tests inject a fake while prod
// uses lib/server/sql/alerts.ts. Idempotency lives in the UNIQUE dedup_key,
// not in the caller's memory.
import type { Urgency } from "../../dashboard/urgent.ts";

export interface TransitionCandidate {
  id?: number; // barrier_status_history row id (dedup identity)
  barrierId: number;
  transitionDate: string; // YYYY-MM-DD
  statusId: number;
}

export interface NewAlertEvent {
  barrierId: number;
  transitionDate: string;
  statusId: number;
  historyId?: number;
  dedupKey: string;
  payload: AlertPayload;
  kind?: string;
}

export interface AlertPayload {
  tag: string;
  location: string;
  availability: string;
  criticality: string;
  urgency: Urgency;
  attempts: number;
  lastError: string | null;
  deadLetter: boolean;
  // delivered: recipient emails that already received this event. An event
  // is fully sent once every active recipient is listed here - a rerun
  // after partial delivery sends only the remainder, never duplicates.
  delivered: string[];
  category?: string;
  ruleId?: number | null;
  immediate?: boolean;
  // History row that produced this event. Two landings with the same
  // status on the same day are distinct events and must not dedup away.
  historyId?: number;
  // Rich detail (optional so rows enqueued before the premium template
  // still render - the template falls back gracefully when absent):
  typology?: string;
  grouping?: string;
  owner?: string;
  compliance?: string;
  locationName?: string;
  // author: who recorded the transition (latest matching history entry),
  // note: their note. Absent for sync rows without attribution.
  author?: string;
  note?: string;
  actionPlan?: string;
  // Before/after diff (sync-change parity, see enrich.ts). old* is the
  // replaced status; the new side is availability/compliance above.
  oldAvailability?: string;
  oldCompliance?: string;
  previousDate?: string;
  source?: "Manual" | "Sincronização Fracttal";
  historyTrail?: Array<{
    date: string;
    status: string;
    author?: string;
    note?: string;
  }>;
}

export interface UnsentAlert {
  id: number;
  barrierId: number | null;
  transitionDate: string;
  statusId: number;
  dedupKey: string;
  payload: AlertPayload;
}

export interface TransitionCursor {
  date: string; // YYYY-MM-DD of the last row of the previous page
  id: number; // its history-row id tiebreaker
}

export interface AlertStore {
  watermark(): Promise<string | null>;
  // Cursor walk: pass the previous page's last (date, id) to stream large
  // windows without OFFSET rescans (idx_history_date_id). limit caps one
  // call (default 20000, the legacy ceiling); after caps the walk.
  recentTransitions(
    since: string | null,
    onlyBarrierIds?: number[],
    opts?: { limit?: number; after?: TransitionCursor | null },
  ): Promise<TransitionCandidate[]>;
  enqueue(events: NewAlertEvent[]): Promise<number>;
  listUnsent(limit?: number, offset?: number): Promise<UnsentAlert[]>;
  // countDead: parked events (sent_at null + dead flag). listUnsent hides
  // them by design, so the cycle needs this separately for observability.
  countDead(): Promise<number>;
  markDelivered(id: number, email: string, complete: boolean): Promise<void>;
  markFailed(id: number, error: string, deadLetter: boolean): Promise<void>;
  reprocessDeadLetters(): Promise<number>;
  // markProviderAccepted: provider 202 receipt (optional so fakes stay
  // small; the SQL store implements it with correlation + parcial columns).
  markProviderAccepted?(id: number, receipt: {
    correlationId?: string;
    parcial: boolean;
    eventoId?: number;
    idempotencyKey?: string;
    enfileirados: number;
    rejeitados: unknown;
    avisos: unknown;
  }): Promise<void>;
  // countRuleEvents: anti-noise helper (optional so fakes stay small).
  // Counts events fired by a rule for a barrier since an ISO timestamp.
  countRuleEvents?(
    ruleId: number,
    barrierId: number,
    sinceIso: string,
  ): Promise<number>;
  // countRuleEventsBulk: cycle-wide prefetch for the helper above (optional;
  // the cycle falls back to per-pair reads). One GROUP BY per (rule, window)
  // instead of one query per candidate; absent barriers read as 0.
  countRuleEventsBulk?(
    ruleId: number,
    barrierIds: number[],
    sinceIso: string,
  ): Promise<Record<number, number>>;
}

// dedupKey: barrier:date:status[:history]. The history id keeps a second
// real landing (same barrier/status/day after a recovery) distinct; absent
// ids keep the old key for back-compat callers.
export function dedupKey(
  barrierId: number,
  transitionDate: string,
  statusId: number,
  historyId?: number,
): string {
  const base = `${barrierId}:${transitionDate}:${statusId}`;
  return historyId === undefined ? base : `${base}:${historyId}`;
}

// isDead: a dead payload stays unsent until --reprocess clears it.
export function isDead(payload: AlertPayload): boolean {
  return payload.deadLetter === true;
}

// withFailure: bumps attempts, records the error, flags dead-letter past
// the run budget (each failed run counts once, retries inside a run don't).
export function withFailure(
  payload: AlertPayload,
  error: string,
  maxRuns: number,
): AlertPayload {
  const attempts = (payload.attempts ?? 0) + 1;
  return {
    ...payload,
    attempts,
    lastError: error.slice(0, 2000),
    deadLetter: attempts >= maxRuns,
  };
}
