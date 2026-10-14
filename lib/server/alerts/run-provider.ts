// Provider cycle - detect -> enqueue -> one POST per event, idempotently.
// Replaces the local SMTP digest: delivery, templates and retry belong to
// the upstream provider. Detection, rules, watermark and dedup stay local.
import {
  buildAlertPayload,
  mapLanding,
  type ProviderAccept,
  type ProviderPayload,
} from "./provider.ts";

import { type AlertStore, isDead, withFailure } from "./store.ts";

import { matchesStaleScope, sortedRules } from "./rules.ts";

import { isCriticalRankId } from "../../enums/codes.ts";

import { fromCriticalityId, fromLocationId } from "../../enums.ts";

import type { ResolverLabels } from "../../resolve.ts";

import type { AlertRule } from "../sql/alert_rules.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import { detectUrgentTransitions, landingLabel } from "./detect.ts";

import type { StatusInfo } from "./detect.ts";

import { extractDetail } from "./enrich.ts";

export const PROVIDER_MAX_SEND_RUNS = 5;

export interface ProviderCycleRecipient {
  email: string;
  name?: string;
  phone?: string;
}

export interface ProviderSender {
  post(payload: ProviderPayload): Promise<ProviderAccept>;
}

export interface ProviderCycleOptions {
  store: AlertStore;
  loadBarriers: (ids: number[]) => Promise<Map<number, WireBarrier>>;
  sender: ProviderSender;
  recipients: ProviderCycleRecipient[];
  companyId: number;
  appBaseUrl?: string;
  onlyBarrierIds?: number[];
  dryRun?: boolean;
  reprocess?: boolean;
  now?: () => Date;
  logger?: (line: string) => void;
  rules?: AlertRule[];
  hasAnyRule?: boolean;
  listStale?: (staleDays: number) => Promise<
    Array<{ id: number; categoryId: number; statusSince: string }>
  >;
  labels?: ResolverLabels;
  statusInfo?: StatusInfo;
  onRuleFired?: (ruleId: number) => void;
}

export interface ProviderCycleResult {
  watermark: string | null;
  detected: number;
  enqueued: number;
  reprocessed: number;
  sent: number;
  failed: number;
  skippedDead: number;
  posted: number;
  parcial: number;
}

export function staleDedupKey(
  ruleId: number,
  barrierId: number,
  date: string,
): string {
  return `stale:${ruleId}:${barrierId}:${date}`;
}

async function throttleAllows(
  store: AlertStore,
  rule: AlertRule,
  barrierId: number,
  at: Date,
): Promise<boolean> {
  if (!store.countRuleEvents) return true;
  if (rule.cooldown_minutes !== null && rule.cooldown_minutes !== undefined) {
    const since = new Date(at.getTime() - rule.cooldown_minutes * 60_000)
      .toISOString();
    if (await store.countRuleEvents(rule.id, barrierId, since) > 0) {
      return false;
    }
  }
  if (rule.max_per_day !== null && rule.max_per_day !== undefined) {
    const dayStart = `${at.toISOString().slice(0, 10)}T00:00:00Z`;
    if (
      await store.countRuleEvents(rule.id, barrierId, dayStart) >=
        rule.max_per_day
    ) return false;
  }
  return true;
}

function ocorridoEm(transitionDate: string, now: Date): string {
  const day = transitionDate.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return `${day}T12:00:00-03:00`;
  return now.toISOString();
}

function barrierLink(
  appBaseUrl: string | undefined,
  barrierId: number | null,
): string | undefined {
  const base = (appBaseUrl ?? "").replace(/\/+$/, "");
  if (!base || barrierId === null) return undefined;
  return `${base}/barriers/${barrierId}`;
}

export async function runProviderCycle(
  options: ProviderCycleOptions,
): Promise<ProviderCycleResult> {
  const {
    store,
    loadBarriers,
    sender,
    recipients,
    companyId,
    appBaseUrl,
    dryRun = true,
    reprocess = false,
    now = () => new Date(),
    logger = () => {},
    rules = [],
    hasAnyRule = false,
    listStale,
    labels,
    statusInfo,
  } = options;
  const active = recipients.filter((r) => r.email.trim() !== "");
  const result: ProviderCycleResult = {
    watermark: null,
    detected: 0,
    enqueued: 0,
    reprocessed: 0,
    sent: 0,
    failed: 0,
    skippedDead: 0,
    posted: 0,
    parcial: 0,
  };

  if (reprocess && !dryRun) {
    result.reprocessed = await store.reprocessDeadLetters();
    logger(`[provider] reprocess cleared ${result.reprocessed} dead letters`);
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
    statusInfo,
  );
  result.detected = detected.length;

  const staleEvents: typeof detected = [];
  if (listStale) {
    const days = [
      ...new Set(
        rules.filter((r) => r.active && r.stale_days !== null)
          .map((r) => r.stale_days as number),
      ),
    ];
    const at = now();
    const today = at.toISOString().slice(0, 10);
    const ordered = sortedRules(rules);
    for (const d of days) {
      const cands = await listStale(d);
      const wires = await loadBarriers(cands.map((c) => c.id));
      for (const c of cands) {
        if (
          options.onlyBarrierIds !== undefined &&
          !options.onlyBarrierIds.includes(c.id)
        ) continue;
        const wire = wires.get(c.id);
        if (!wire) continue;
        const urgency = isCriticalRankId(wire.criticalityId)
          ? "critical"
          : "urgent";
        for (const r of ordered) {
          if (!r.active || r.stale_days !== d) continue;
          if (
            !matchesStaleScope(
              {
                categoryId: c.categoryId,
                criticalityId: wire.criticalityId,
                locationId: wire.locationId,
                typologyId: wire.typologyId,
                groupingId: wire.groupingId,
                ownerId: wire.ownerId,
                urgency,
                hasActionPlan: (wire.actionPlan ?? "").trim() !== "",
              },
              r,
              at,
            )
          ) continue;
          const daysSince = Math.floor(
            (Date.parse(`${today}T00:00:00Z`) -
              Date.parse(`${c.statusSince.slice(0, 10)}T00:00:00Z`)) /
              86_400_000,
          );
          const repeat = r.stale_repeat_days ?? 1;
          if (daysSince >= 0 && (daysSince - d) % repeat !== 0) continue;
          if (!(await throttleAllows(store, r, c.id, at))) continue;
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
              urgency,
              attempts: 0,
              lastError: null,
              deadLetter: false,
              delivered: [],
              ruleId: r.id,
              immediate: r.notify_immediate,
              ...extractDetail(wire, today, wire.availabilityId, labels),
            },
            urgency,
          });
          options.onRuleFired?.(r.id);
          break;
        }
      }
    }
    result.detected += staleEvents.length;
  }

  const throttled: typeof detected = [];
  if (!dryRun) {
    const at = now();
    const byRule = new Map<number, AlertRule>();
    for (const r of rules) byRule.set(r.id, r);
    for (const e of detected) {
      const ruleId = e.payload.ruleId ?? null;
      const rule = ruleId !== null ? byRule.get(ruleId) : undefined;
      if (!rule) {
        throttled.push(e);
        if (ruleId !== null) options.onRuleFired?.(ruleId);
        continue;
      }
      if (await throttleAllows(store, rule, e.barrierId, at)) {
        throttled.push(e);
        options.onRuleFired?.(rule.id);
      }
    }
  } else {
    throttled.push(...detected);
  }

  if (dryRun) {
    logger(
      `[provider] dry-run: would enqueue ${
        detected.length + staleEvents.length
      }, no writes, no posts`,
    );
    return result;
  }

  const toEnqueue = [...throttled, ...staleEvents];
  if (toEnqueue.length > 0) {
    result.enqueued = await store.enqueue(toEnqueue);
  }

  const unsent = await store.listUnsent();
  const sendable = unsent.filter((e) => !isDead(e.payload));
  result.skippedDead = await store.countDead();
  if (sendable.length === 0 || active.length === 0) {
    logger(
      `[provider] nothing to send (unsent=${sendable.length}, parked=${result.skippedDead}, recipients=${active.length})`,
    );
    return result;
  }

  // One POST per event. Suppressed landings (planned stop) are accepted
  // locally without a call so they never reprocess.
  const wireIds = [
    ...new Set(sendable.map((e) => e.barrierId).filter((v) => v !== null)),
  ] as number[];
  const wires = await loadBarriers(wireIds);
  const at = now();
  for (const event of sendable) {
    const mapping = mapLanding(event.statusId);
    if (!mapping.send) {
      if (store.markProviderAccepted) {
        await store.markProviderAccepted(event.id, {
          parcial: false,
          enfileirados: 0,
          rejeitados: [],
          avisos: ["suppressed: planned stop"],
        });
      } else {
        for (const r of active) {
          await store.markDelivered(event.id, r.email, true);
        }
      }
      result.sent++;
      continue;
    }
    const wire = event.barrierId !== null
      ? wires.get(event.barrierId)
      : undefined;
    const criticality = wire
      ? fromCriticalityId(wire.criticalityId)
      : String(event.payload.criticality ?? "");
    const status = landingLabel(event.statusId, statusInfo);
    const location = wire
      ? (labels?.locations?.[wire.locationId] ??
        fromLocationId(wire.locationId))
      : String(event.payload.location ?? "");
    const payload = buildAlertPayload({
      barrierId: event.barrierId ?? 0,
      externalCode: wire?.externalCode ?? event.payload.tag ?? "",
      tag: wire?.tag ?? event.payload.tag ?? "",
      criticality,
      statusLabel: status,
      locationLabel: location,
      oldStatusLabel: event.payload.oldAvailability,
      transitionDate: event.transitionDate,
      ocorridoEm: ocorridoEm(event.transitionDate, at),
      statusId: event.statusId,
      category: event.payload.category,
      author: event.payload.author,
      note: event.payload.note,
      companyId,
      link: barrierLink(appBaseUrl, event.barrierId),
      recipients: active,
    });
    if (!payload) {
      logger(`[provider] event ${event.id} has no valid destinos, skipping`);
      continue;
    }
    try {
      const res = await sender.post(payload);
      result.posted++;
      if (res.aviso_token) {
        logger(
          `[provider] token rotation notice: ${
            res.aviso_token.mensagem ?? res.aviso_token.usando
          }`,
        );
      }
      if (store.markProviderAccepted) {
        await store.markProviderAccepted(event.id, {
          correlationId: res.correlation_id,
          parcial: res.parcial,
          eventoId: res.evento_id,
          idempotencyKey: res.idempotency_key,
          enfileirados: res.enfileirados,
          rejeitados: res.rejeitados,
          avisos: res.avisos,
        });
      } else {
        for (const r of active) {
          await store.markDelivered(event.id, r.email, true);
        }
      }
      result.sent++;
      if (res.parcial) {
        result.parcial++;
        logger(
          `[provider] event ${event.id} parcial: ${
            JSON.stringify(res.rejeitados)
          }`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = (err as { retryable?: boolean }).retryable ?? true;
      const status = (err as { status?: number }).status ?? 0;
      // Content/auth errors park immediately; network/5xx ride the budget.
      const deadNow = !retryable || status === 401 || status === 422;
      const next = withFailure(
        event.payload,
        message,
        deadNow ? 1 : PROVIDER_MAX_SEND_RUNS,
      );
      await store.markFailed(event.id, message, next.deadLetter || deadNow);
      result.failed++;
      logger(`[provider] event ${event.id} failed: ${message}`);
    }
  }
  return result;
}

// maybeSendProviderImmediate: enqueue always; POST at once only for the
// violada landing (messaging-eligible). Failures stay unsent for the cycle.
export async function maybeSendProviderImmediate(options: {
  store: AlertStore;
  loadBarriers: (ids: number[]) => Promise<Map<number, WireBarrier>>;
  sender?: ProviderSender;
  barrier: WireBarrier;
  statusId: number;
  transitionDate: string;
  companyId: number;
  appBaseUrl?: string;
  recipients: ProviderCycleRecipient[];
  labels?: ResolverLabels;
  statusInfo?: StatusInfo;
  now?: () => Date;
  logger?: (line: string) => void;
}): Promise<{ enqueued: number; posted: number }> {
  const {
    store,
    loadBarriers,
    sender,
    barrier,
    statusId,
    transitionDate,
    companyId,
    appBaseUrl,
    recipients,
    labels,
    statusInfo,
    now = () => new Date(),
    logger = () => {},
  } = options;
  const { dedupKey } = await import("./store.ts");
  const { extractDetail } = await import("./enrich.ts");
  const { resolveBarrier } = await import("../../resolve.ts");
  const resolved = resolveBarrier(barrier, labels);
  const event = {
    barrierId: barrier.id,
    transitionDate,
    statusId,
    dedupKey: dedupKey(barrier.id, transitionDate, statusId),
    payload: {
      tag: resolved.tag,
      location: resolved.location,
      availability: resolved.availability,
      criticality: resolved.criticality,
      urgency: resolved.compliance === "Conforme"
        ? "none" as const
        : (isCriticalRankId(barrier.criticalityId)
          ? "critical" as const
          : "urgent" as const),
      attempts: 0,
      lastError: null,
      deadLetter: false,
      delivered: [],
      ...extractDetail(barrier, transitionDate, statusId, labels),
    },
  };
  const enqueued = await store.enqueue([event]);
  const mapping = mapLanding(statusId);
  if (!mapping.send || !mapping.despacharAgora || !sender) {
    return { enqueued, posted: 0 };
  }
  const active = recipients.filter((r) => r.email.trim() !== "");
  if (active.length === 0) return { enqueued, posted: 0 };
  const at = now();
  const criticality = resolved.criticality;
  const status = landingLabel(statusId, statusInfo);
  const location = labels?.locations?.[barrier.locationId] ??
    fromLocationId(barrier.locationId);
  const payload = buildAlertPayload({
    barrierId: barrier.id,
    externalCode: barrier.externalCode || barrier.tag,
    tag: barrier.tag,
    criticality,
    statusLabel: status,
    locationLabel: location,
    transitionDate,
    ocorridoEm: ocorridoEm(transitionDate, at),
    statusId,
    companyId,
    link: barrierLink(appBaseUrl, barrier.id),
    recipients: active,
  });
  if (!payload) return { enqueued, posted: 0 };
  const unsent = await store.listUnsent();
  const pending = unsent.find((e) => e.dedupKey === event.dedupKey);
  if (!pending) return { enqueued, posted: 0 };
  try {
    const res = await sender.post(payload);
    if (store.markProviderAccepted) {
      await store.markProviderAccepted(pending.id, {
        correlationId: res.correlation_id,
        parcial: res.parcial,
        eventoId: res.evento_id,
        idempotencyKey: res.idempotency_key,
        enfileirados: res.enfileirados,
        rejeitados: res.rejeitados,
        avisos: res.avisos,
      });
    } else {
      for (const r of active) {
        await store.markDelivered(pending.id, r.email, true);
      }
    }
    return { enqueued, posted: 1 };
  } catch (err) {
    logger(
      `[provider-immediate] post failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    void loadBarriers;
    return { enqueued, posted: 0 };
  }
}
