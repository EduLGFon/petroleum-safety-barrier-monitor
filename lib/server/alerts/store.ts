// Alert store contract - what the cycle needs from persistence.
// This is why it exists: the cycle (detect -> enqueue -> send -> mark) is
// pure orchestration over this interface, so tests inject a fake while prod
// uses lib/server/sql/alerts.ts. Idempotency lives in the UNIQUE dedup_key,
// not in the caller's memory.
import type { Urgency } from "../../dashboard/urgent.ts";

export interface TransitionCandidate {
  barrierId: number;
  transitionDate: string; // YYYY-MM-DD
  statusId: number;
}

export interface NewAlertEvent {
  barrierId: number;
  transitionDate: string;
  statusId: number;
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
}

export interface UnsentAlert {
  id: number;
  barrierId: number | null;
  transitionDate: string;
  statusId: number;
  dedupKey: string;
  payload: AlertPayload;
}

export interface AlertStore {
  watermark(): Promise<string | null>;
  recentTransitions(
    since: string | null,
    onlyBarrierIds?: number[],
  ): Promise<TransitionCandidate[]>;
  enqueue(events: NewAlertEvent[]): Promise<number>;
  listUnsent(): Promise<UnsentAlert[]>;
  // countDead: parked events (sent_at null + dead flag). listUnsent hides
  // them by design, so the cycle needs this separately for observability.
  countDead(): Promise<number>;
  markDelivered(id: number, email: string, complete: boolean): Promise<void>;
  markFailed(id: number, error: string, deadLetter: boolean): Promise<void>;
  reprocessDeadLetters(): Promise<number>;
}

// dedupKey: barrier:date:status, matching the alert_events comment.
export function dedupKey(
  barrierId: number,
  transitionDate: string,
  statusId: number,
): string {
  return `${barrierId}:${transitionDate}:${statusId}`;
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
