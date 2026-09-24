// Alert cycle - detect -> enqueue -> send digest -> mark, idempotently.
// This is why it exists: one function owns the run semantics (dry-run
// default writes nothing; reruns send zero duplicates via the dedup_key;
// delivery is tracked per recipient so a partial relay failure never
// re-sends to someone who already got the digest; failures dead-letter
// with the error attached and --reprocess retries them), so the script is
// wiring and every behavior is unit-testable.
import {
  type DigestEvent,
  urgentDigestBody,
  urgentDigestHtml,
  urgentDigestSubject,
} from "./templates.ts";

import { extractDetail } from "./enrich.ts";

import type { ResolverLabels } from "../../resolve.ts";

import {
  type AlertStore,
  isDead,
  type UnsentAlert,
  withFailure,
} from "./store.ts";

import { type AlertMailer, type RetryPolicy, sendWithRetry } from "./mailer.ts";

import { compareUrgency } from "../../dashboard/urgent.ts";

import type { AlertRule } from "../sql/alert_rules.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import { detectUrgentTransitions } from "./detect.ts";

import type { Barrier } from "../../types.ts";

// MAX_SEND_RUNS: failed send runs per event before it dead-letters. Retries
// inside one run (sendWithRetry) don't count - only whole-run failures do,
// so a flapping relay gets several runs before the event parks.
export const MAX_SEND_RUNS = 5;

export interface AlertRecipientRef {
  email: string;
}

export interface StaleCandidate {
  id: number;
  categoryId: number;
  statusSince: string;
}

export interface AlertCycleOptions {
  store: AlertStore;
  loadBarriers: (ids: number[]) => Promise<Map<number, WireBarrier>>;
  mailer: AlertMailer;
  recipients: AlertRecipientRef[];
  onlyBarrierIds?: number[];
  dryRun?: boolean;
  reprocess?: boolean;
  retry?: Partial<RetryPolicy>;
  now?: () => Date;
  logger?: (line: string) => void;
  rules?: AlertRule[];
  hasAnyRule?: boolean;
  listStale?: (staleDays: number) => Promise<StaleCandidate[]>;
  // labels: DB id->label maps (authors included) so enqueued payloads carry
  // real names instead of seed-enum sentinels. brand: COMPANY_NAME for mail.
  labels?: ResolverLabels;
  brand?: string;
}

export interface AlertCycleResult {
  watermark: string | null;
  detected: number;
  enqueued: number;
  reprocessed: number;
  sent: number;
  failed: number;
  skippedDead: number;
  emails: number;
}

// asBarrier: alert payloads back into the dashboard ordering. statusSince is
// the transition date (what the digest sorts on). Recovery events carry
// compliance Conforme so they sort after urgent ones, like the dashboard.
function asBarrier(e: UnsentAlert): Barrier {
  return {
    id: e.id,
    tag: e.payload.tag,
    typology: "",
    location: e.payload.location,
    locDesc: "",
    criticality: e.payload.criticality as Barrier["criticality"],
    category: e.payload.category ?? "",
    grouping: "",
    owner: "",
    availability: e.payload.availability as Barrier["availability"],
    compliance: e.payload.urgency === "none" ? "Conforme" : "Não Conforme",
    comments: "",
    actionPlan: "",
    statusSince: e.transitionDate,
    statusHistory: [],
    // Alert payloads carry no sheet columns; digest ordering only needs the
    // status fields above, so the inventory columns stay unset here.
    origin: "",
    externalCode: "",
    locationName: "",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "",
    contingencyDesc: "",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
  };
}

function toDigest(e: UnsentAlert): DigestEvent {
  return {
    tag: e.payload.tag,
    location: e.payload.location,
    availability: e.payload.availability,
    criticality: e.payload.criticality,
    transitionDate: e.transitionDate,
    urgency: e.payload.urgency,
    category: e.payload.category,
    typology: e.payload.typology,
    grouping: e.payload.grouping,
    owner: e.payload.owner,
    compliance: e.payload.compliance,
    locationName: e.payload.locationName,
    author: e.payload.author,
    note: e.payload.note,
    actionPlan: e.payload.actionPlan,
  };
}

// staleDedupKey: distinct namespace so a stale reminder never collides with
// the transition dedup key for the same barrier and day.
export function staleDedupKey(
  ruleId: number,
  barrierId: number,
  date: string,
): string {
  return `stale:${ruleId}:${barrierId}:${date}`;
}

// runAlertCycle: one full pass. Reprocess first (clears dead flags so this
// run picks them up), then watermark -> detect -> enqueue -> one digest per
// recipient covering only what they haven't received -> mark.
export async function runAlertCycle(
  options: AlertCycleOptions,
): Promise<AlertCycleResult> {
  const {
    store,
    loadBarriers,
    mailer,
    recipients,
    dryRun = true,
    reprocess = false,
    retry = {},
    now = () => new Date(),
    logger = () => {},
    rules = [],
    hasAnyRule = false,
    listStale,
    labels,
    brand,
  } = options;
  const active = recipients.filter((r) => r.email !== "");
  const activeEmails = active.map((r) => r.email);
  const result: AlertCycleResult = {
    watermark: null,
    detected: 0,
    enqueued: 0,
    reprocessed: 0,
    sent: 0,
    failed: 0,
    skippedDead: 0,
    emails: 0,
  };

  if (reprocess && !dryRun) {
    result.reprocessed = await store.reprocessDeadLetters();
    logger(`[alerts] reprocess cleared ${result.reprocessed} dead letters`);
  }

  result.watermark = await store.watermark();
  const detected = await detectUrgentTransitions(
    store,
    loadBarriers,
    result.watermark,
    options.onlyBarrierIds,
    rules,
    hasAnyRule,
    labels,
  );
  result.detected = detected.length;
  logger(
    `[alerts] watermark=${
      result.watermark ?? "none"
    } detected=${result.detected}`,
  );

  // Stale sweep: one query per distinct stale_days among active rules.
  // Candidates are filtered by the rule's own category scope before enqueue.
  const staleEvents: typeof detected = [];
  if (listStale) {
    const days = [
      ...new Set(
        rules.filter((r) => r.active && r.stale_days !== null)
          .map((r) => r.stale_days as number),
      ),
    ];
    const today = now().toISOString().slice(0, 10);
    for (const d of days) {
      const cands = await listStale(d);
      const ids = cands.map((c) => c.id);
      const wires = await loadBarriers(ids);
      for (const c of cands) {
        if (
          options.onlyBarrierIds !== undefined &&
          !options.onlyBarrierIds.includes(c.id)
        ) continue;
        const wire = wires.get(c.id);
        if (!wire) continue;
        for (const r of rules) {
          if (!r.active || r.stale_days !== d) continue;
          if (r.category_id !== null && r.category_id !== c.categoryId) {
            continue;
          }
          if (r.critical_only && wire.criticalityId !== 1) continue;
          staleEvents.push({
            barrierId: c.id,
            transitionDate: today,
            statusId: wire.availabilityId,
            dedupKey: staleDedupKey(r.id, c.id, today),
            kind: "stale",
            payload: {
              tag: wire.tag,
              location: String(wire.locationId),
              availability: String(wire.availabilityId),
              criticality: String(wire.criticalityId),
              urgency: wire.criticalityId === 1 ? "critical" : "urgent",
              attempts: 0,
              lastError: null,
              deadLetter: false,
              delivered: [],
              ruleId: r.id,
              immediate: r.notify_immediate,
              ...extractDetail(wire, today, wire.availabilityId, labels),
            },
            urgency: wire.criticalityId === 1 ? "critical" : "urgent",
          });
          break; // one stale event per barrier per run is enough
        }
      }
    }
    result.detected += staleEvents.length;
  }

  if (dryRun) {
    logger(
      `[alerts] dry-run: would enqueue ${
        detected.length + staleEvents.length
      }, no writes, no mail`,
    );
    return result;
  }

  const toEnqueue = [...detected, ...staleEvents];
  if (toEnqueue.length > 0) {
    result.enqueued = await store.enqueue(toEnqueue);
    logger(`[alerts] enqueued=${result.enqueued} (dedup skips the rest)`);
  }

  const unsent = await store.listUnsent();
  const sendable = unsent.filter((e) => !isDead(e.payload));
  result.skippedDead = await store.countDead();
  if (sendable.length === 0 || active.length === 0) {
    logger(
      `[alerts] nothing to send (unsent=${sendable.length}, parked=${result.skippedDead}, recipients=${active.length})`,
    );
    return result;
  }

  // One digest per recipient, critical first, covering only events they
  // haven't received - the email count per run is bounded by the audience,
  // and a rerun after partial delivery sends only the remainder.
  const failedOnce = new Set<number>();
  for (const recipient of active) {
    const pending = sendable
      .filter((e) => !(e.payload.delivered ?? []).includes(recipient.email))
      .sort((a, b) => compareUrgency(asBarrier(a), asBarrier(b)));
    if (pending.length === 0) continue;
    const critical = pending.filter((e) =>
      e.payload.urgency === "critical"
    ).length;
    const subject = urgentDigestSubject(pending.length, critical);
    const events = pending.map(toDigest);
    const runAt = now().toISOString();
    const body = urgentDigestBody(events, runAt);
    const html = urgentDigestHtml(events, runAt, brand);
    try {
      await sendWithRetry(
        mailer,
        [recipient.email],
        subject,
        body,
        retry,
        html,
      );
      result.emails++;
      logger(
        `[alerts] digest sent to ${recipient.email} (${pending.length} events)`,
      );
      for (const e of pending) {
        const delivered = [...(e.payload.delivered ?? []), recipient.email];
        const complete = activeEmails.every((a) => delivered.includes(a));
        await store.markDelivered(e.id, recipient.email, complete);
        e.payload.delivered = delivered;
        if (complete) result.sent++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger(`[alerts] digest to ${recipient.email} failed: ${message}`);
      for (const e of pending) {
        if (failedOnce.has(e.id)) continue;
        failedOnce.add(e.id);
        const next = withFailure(e.payload, message, MAX_SEND_RUNS);
        await store.markFailed(e.id, message, next.deadLetter);
        result.failed++;
        logger(
          `[alerts] event ${e.id} ${e.payload.tag} failed: ${message} (attempt ${next.attempts}${
            next.deadLetter ? ", dead-letter" : ""
          })`,
        );
      }
    }
  }
  return result;
}
