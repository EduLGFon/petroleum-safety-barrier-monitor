// Immediate fan-out - enqueue + optional at-once send after a PATCH.
// This is why it exists: the hybrid model promises critical transitions
// reach inboxes without waiting for the 15-minute digest cron. The status
// route calls this after record_status_change commits; send failures never
// throw (the event stays unsent for the cron), only store failures do, and
// the route logs those without failing the already-committed PATCH.
import { immediateSubject, urgentDigestBody } from "./templates.ts";

import { type AlertMailer, sendWithRetry } from "./mailer.ts";

import type { AlertRule } from "../sql/alert_rules.ts";

import { type AlertStore, dedupKey } from "./store.ts";

import { urgencyOf } from "../../dashboard/urgent.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import { resolveBarrier } from "../../resolve.ts";

import type { DetectedUrgent } from "./detect.ts";

import { matchRules } from "./rules.ts";

export interface ImmediateRecipient {
  email: string;
}

// IMMEDIATE_TIMEOUT_MS: upper bound for the at-once send inside a PATCH
// request. A hung relay must not hold the response; expiry leaves the event
// unsent and the digest cron retries it on schedule.
export const IMMEDIATE_TIMEOUT_MS = 10_000;

export interface ImmediateOptions {
  store: Pick<AlertStore, "enqueue" | "listUnsent" | "markDelivered">;
  barrier: WireBarrier;
  statusId: number;
  transitionDate: string; // YYYY-MM-DD, authoritative status_since
  rules: AlertRule[];
  hasAnyRule: boolean;
  mailer?: AlertMailer; // absent = enqueue only (no relay configured)
  recipients?: ImmediateRecipient[];
  timeoutMs?: number;
  now?: () => Date;
  logger?: (line: string) => void;
}

export interface ImmediateResult {
  matched: boolean;
  immediate: boolean;
  enqueued: number;
  emailed: number;
}

// buildImmediateEvent: same payload shape the detector builds, so digest
// and at-once mail render identically for the same transition.
export function buildImmediateEvent(
  barrier: WireBarrier,
  transitionDate: string,
  statusId: number,
  immediate: boolean,
): DetectedUrgent {
  const resolved = resolveBarrier(barrier);
  const urgency = urgencyOf(resolved);
  return {
    barrierId: barrier.id,
    transitionDate,
    statusId,
    dedupKey: dedupKey(barrier.id, transitionDate, statusId),
    payload: {
      tag: resolved.tag,
      location: resolved.location,
      availability: resolved.availability,
      criticality: resolved.criticality,
      urgency,
      attempts: 0,
      lastError: null,
      deadLetter: false,
      delivered: [],
      category: resolved.category,
      immediate,
    },
    urgency,
  };
}

// withTimeout: rejects when the send outlives the PATCH budget. The timer
// is cleared only once the race settles, so slow relays still trip it.
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("immediate send timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// maybeSendImmediate: match rules, always enqueue matches, and when the
// winning rule asks for at-once delivery, send one single-event email per
// recipient (single attempt, bounded by timeoutMs). Successful sends are
// marked delivered so the cron never resends; failures only log.
export async function maybeSendImmediate(
  options: ImmediateOptions,
): Promise<ImmediateResult> {
  const {
    store,
    barrier,
    statusId,
    transitionDate,
    rules,
    hasAnyRule,
    mailer,
    recipients = [],
    timeoutMs = IMMEDIATE_TIMEOUT_MS,
    now = () => new Date(),
    logger = () => {},
  } = options;
  const resolved = resolveBarrier(barrier);
  const match = matchRules(
    {
      categoryId: barrier.categoryId,
      statusId,
      criticalityId: barrier.criticalityId,
      compliant: resolved.compliance === "Conforme",
    },
    rules,
    hasAnyRule,
  );
  if (!match.matched) {
    return { matched: false, immediate: false, enqueued: 0, emailed: 0 };
  }
  if (!hasAnyRule && urgencyOf(resolved) === "none") {
    return { matched: false, immediate: false, enqueued: 0, emailed: 0 };
  }
  const event = buildImmediateEvent(
    barrier,
    transitionDate,
    statusId,
    match.immediate,
  );
  const enqueued = await store.enqueue([event]);
  logger(`[immediate] enqueued=${enqueued} ${event.dedupKey}`);
  if (!match.immediate || !mailer) {
    return { matched: true, immediate: match.immediate, enqueued, emailed: 0 };
  }
  const active = recipients.filter((r) => r.email !== "");
  if (active.length === 0) {
    logger("[immediate] no recipients, leaving for the digest cron");
    return { matched: true, immediate: true, enqueued, emailed: 0 };
  }
  const critical = urgencyOf(resolved) === "critical" ? 1 : 0;
  const subject = immediateSubject(1, critical);
  const body = urgentDigestBody(
    [{
      tag: event.payload.tag,
      location: event.payload.location,
      availability: event.payload.availability,
      criticality: event.payload.criticality,
      transitionDate,
      urgency: event.payload.urgency,
    }],
    now().toISOString(),
  );
  // Fresh id lookup: a dedup-hit (enqueued 0) may already be delivered, in
  // which case there is nothing to send.
  const unsent = await store.listUnsent();
  const pending = unsent.find((e) => e.dedupKey === event.dedupKey);
  if (!pending) {
    logger(`[immediate] ${event.dedupKey} already delivered, skipping send`);
    return { matched: true, immediate: true, enqueued, emailed: 0 };
  }
  let emailed = 0;
  const delivered: string[] = [];
  for (const recipient of active) {
    try {
      await withTimeout(
        sendWithRetry(mailer, [recipient.email], subject, body, {
          attempts: 1,
        }),
        timeoutMs,
      );
      emailed++;
      delivered.push(recipient.email);
      logger(`[immediate] sent to ${recipient.email}`);
    } catch (err) {
      logger(
        `[immediate] send to ${recipient.email} failed: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  const complete = delivered.length === active.length;
  for (const email of delivered) {
    await store.markDelivered(pending.id, email, complete);
  }
  return { matched: true, immediate: true, enqueued, emailed };
}
