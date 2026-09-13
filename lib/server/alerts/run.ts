// Alert cycle - detect -> enqueue -> send digest -> mark, idempotently.
// This is why it exists: one function owns the run semantics (dry-run
// default writes nothing; reruns send zero duplicates via the dedup_key;
// delivery is tracked per recipient so a partial relay failure never
// re-sends to someone who already got the digest; failures dead-letter
// with the error attached and --reprocess retries them), so the script is
// wiring and every behavior is unit-testable.
import { compareUrgency } from "../../dashboard/urgent.ts";
import type { Barrier } from "../../types.ts";
import type { WireBarrier } from "../../wireTypes.ts";
import { detectUrgentTransitions } from "./detect.ts";
import { type AlertMailer, type RetryPolicy, sendWithRetry } from "./mailer.ts";
import {
  type DigestEvent,
  urgentDigestBody,
  urgentDigestSubject,
} from "./templates.ts";
import {
  type AlertStore,
  isDead,
  type UnsentAlert,
  withFailure,
} from "./store.ts";

// MAX_SEND_RUNS: failed send runs per event before it dead-letters. Retries
// inside one run (sendWithRetry) don't count - only whole-run failures do,
// so a flapping relay gets several runs before the event parks.
export const MAX_SEND_RUNS = 5;

export interface AlertRecipientRef {
  email: string;
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
// the transition date (what the digest sorts on) and the event is urgent by
// construction, so compareUrgency ranks exactly like the "ver urgentes" list
// does for freshly transitioned barriers.
function asBarrier(e: UnsentAlert): Barrier {
  return {
    id: e.id,
    tag: e.payload.tag,
    tipologia: "",
    instalacao: e.payload.instalacao,
    locDesc: "",
    criticidade: e.payload.criticidade as Barrier["criticidade"],
    categoria: "",
    agrupamento: "",
    dono: "",
    disponibilidade: e.payload.disponibilidade as Barrier["disponibilidade"],
    conformidade: "Não Conforme",
    comentarios: "",
    planoAcao: "",
    statusSince: e.transitionDate,
    statusHistory: [],
  };
}

function toDigest(e: UnsentAlert): DigestEvent {
  return {
    tag: e.payload.tag,
    instalacao: e.payload.instalacao,
    disponibilidade: e.payload.disponibilidade,
    criticidade: e.payload.criticidade,
    transitionDate: e.transitionDate,
    urgency: e.payload.urgency,
  };
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
  );
  result.detected = detected.length;
  logger(
    `[alerts] watermark=${
      result.watermark ?? "none"
    } detected=${result.detected}`,
  );

  if (dryRun) {
    logger(
      `[alerts] dry-run: would enqueue ${detected.length}, no writes, no mail`,
    );
    return result;
  }

  if (detected.length > 0) {
    result.enqueued = await store.enqueue(detected);
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
    const body = urgentDigestBody(
      pending.map(toDigest),
      now().toISOString(),
    );
    try {
      await sendWithRetry(mailer, [recipient.email], subject, body, retry);
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
