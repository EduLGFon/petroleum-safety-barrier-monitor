// Provider cycle - detect -> enqueue -> one POST per event, idempotently.
// Replaces the local SMTP digest: delivery, templates and retry belong to
// the upstream provider. Detection, rules, watermark and dedup stay local.
import {
  barrierLink,
  buildAlertPayload,
  mapLanding,
  ocorridoEm,
  type ProviderAccept,
  type ProviderPayload,
} from "./provider.ts";

import { detectUrgentTransitions, landingLabel } from "./detect.ts";

import { fromCriticalityId, fromLocationId } from "../../enums.ts";

import {
  type AlertStore,
  isDead,
  type UnsentAlert,
  withFailure,
} from "./store.ts";

import { matchesStaleScope, sortedRules } from "./rules.ts";

import { isCriticalRankId } from "../../enums/codes.ts";

import type { ResolverLabels } from "../../resolve.ts";

import type { AlertRule } from "../sql/alert_rules.ts";

import type { WireBarrier } from "../../wireTypes.ts";

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

type CountCache = Map<string, Promise<number>>;

// throttleWindows: the (rule, window) anti-noise instants for one check.
function throttleWindows(
  rule: AlertRule,
  at: Date,
): Array<{ sinceIso: string }> {
  const out: Array<{ sinceIso: string }> = [];
  if (rule.cooldown_minutes !== null && rule.cooldown_minutes !== undefined) {
    out.push({
      sinceIso: new Date(at.getTime() - rule.cooldown_minutes * 60_000)
        .toISOString(),
    });
  }
  if (rule.max_per_day !== null && rule.max_per_day !== undefined) {
    out.push({ sinceIso: `${at.toISOString().slice(0, 10)}T00:00:00Z` });
  }
  return out;
}

// warmThrottleCache: bulk-prefetches (rule, barriers, window) counts into
// the cycle cache - one GROUP BY per distinct (rule, sinceIso) instead of
// one query per candidate. Stores without the bulk read keep the per-pair
// fallback inside cachedCount; failures here never fail the cycle.
async function warmThrottleCache(
  store: AlertStore,
  cache: CountCache | undefined,
  groups: Array<
    { ruleId: number; barrierIds: number[]; sinceIso: string }
  >,
): Promise<void> {
  if (!store.countRuleEventsBulk || !cache || groups.length === 0) return;
  await Promise.all(groups.map(async ({ ruleId, barrierIds, sinceIso }) => {
    if (barrierIds.length === 0) return;
    try {
      const counts = await store.countRuleEventsBulk!(
        ruleId,
        barrierIds,
        sinceIso,
      );
      for (const bid of barrierIds) {
        const key = `${ruleId}:${bid}:${sinceIso}`;
        if (!cache.has(key)) cache.set(key, Promise.resolve(counts[bid] ?? 0));
      }
    } catch {
      // Per-pair fallback inside cachedCount still applies.
    }
  }));
}

function cachedCount(
  store: AlertStore,
  cache: CountCache | undefined,
  ruleId: number,
  barrierId: number,
  sinceIso: string,
): Promise<number> {
  if (!store.countRuleEvents) return Promise.resolve(0);
  if (!cache) return store.countRuleEvents(ruleId, barrierId, sinceIso);
  const key = `${ruleId}:${barrierId}:${sinceIso}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = store.countRuleEvents(ruleId, barrierId, sinceIso);
    // Drop failures from the cache so a transient DB error does not poison
    // later checks in the same cycle.
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

async function throttleAllows(
  store: AlertStore,
  rule: AlertRule,
  barrierId: number,
  at: Date,
  cache?: CountCache,
): Promise<boolean> {
  if (!store.countRuleEvents) return true;
  const cooldownSince = (rule.cooldown_minutes !== null &&
      rule.cooldown_minutes !== undefined)
    ? new Date(at.getTime() - rule.cooldown_minutes * 60_000).toISOString()
    : null;
  const dayStart = (rule.max_per_day !== null && rule.max_per_day !== undefined)
    ? `${at.toISOString().slice(0, 10)}T00:00:00Z`
    : null;
  // Batch the two anti-noise reads concurrently; the cache dedups identical
  // (rule, barrier, window) triples across events in one cycle.
  const [cooldownHits, dayHits] = await Promise.all([
    cooldownSince !== null
      ? cachedCount(store, cache, rule.id, barrierId, cooldownSince)
      : Promise.resolve(0),
    dayStart !== null
      ? cachedCount(store, cache, rule.id, barrierId, dayStart)
      : Promise.resolve(0),
  ]);
  if (cooldownSince !== null && cooldownHits > 0) return false;
  if (
    dayStart !== null && rule.max_per_day !== null &&
    rule.max_per_day !== undefined && dayHits >= rule.max_per_day
  ) return false;
  return true;
}

function withPostTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("provider post timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
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
  // Cycle-scoped dedup for anti-noise reads: identical (rule, barrier,
  // window) checks across stale + transition events share one DB round-trip.
  const countCache: CountCache = new Map();
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
      // Bulk warm: one GROUP BY per (rule, window) over this day's
      // candidates instead of one cooldown query per barrier below.
      {
        const ids = cands.map((c) => c.id);
        const groups: Array<
          { ruleId: number; barrierIds: number[]; sinceIso: string }
        > = [];
        for (const r of ordered) {
          if (!r.active || r.stale_days !== d) continue;
          for (const w of throttleWindows(r, at)) {
            groups.push({
              ruleId: r.id,
              barrierIds: ids,
              sinceIso: w.sinceIso,
            });
          }
        }
        await warmThrottleCache(store, countCache, groups);
      }
      for (const c of cands) {
        if (
          options.onlyBarrierIds !== undefined &&
          !options.onlyBarrierIds.includes(c.id)
        ) continue;
        const wire = wires.get(c.id);
        if (!wire || wire.isActive === false) continue;
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
          const statusDay = c.statusSince.slice(0, 10);
          const parsedToday = Date.parse(`${today}T00:00:00Z`);
          const parsedSince = Date.parse(`${statusDay}T00:00:00Z`);
          if (!Number.isFinite(parsedToday) || !Number.isFinite(parsedSince)) {
            continue;
          }
          const daysSince = Math.floor(
            (parsedToday - parsedSince) / 86_400_000,
          );
          if (!Number.isFinite(daysSince)) continue;
          // Guard a zero/negative repeat (DB check should prevent it) back
          // to 1 so the modulo below never divides by zero.
          const rawRepeat = r.stale_repeat_days ?? 1;
          const repeat = rawRepeat > 0 ? rawRepeat : 1;
          if (daysSince >= 0 && (daysSince - d) % repeat !== 0) continue;
          if (!(await throttleAllows(store, r, c.id, at, countCache))) {
            continue;
          }
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
    // Bulk warm: group the cycle's events per (rule, window) and prefetch
    // one GROUP BY each, so the per-event checks below hit warm cache.
    {
      const idsByRule = new Map<number, number[]>();
      for (const e of detected) {
        const ruleId = e.payload.ruleId ?? null;
        if (ruleId === null) continue;
        const list = idsByRule.get(ruleId) ?? [];
        list.push(e.barrierId);
        idsByRule.set(ruleId, list);
      }
      const groups: Array<
        { ruleId: number; barrierIds: number[]; sinceIso: string }
      > = [];
      for (const [ruleId, ids] of idsByRule) {
        const rule = byRule.get(ruleId);
        if (!rule) continue;
        for (const w of throttleWindows(rule, at)) {
          groups.push({ ruleId, barrierIds: ids, sinceIso: w.sinceIso });
        }
      }
      await warmThrottleCache(store, countCache, groups);
    }
    // Batch the anti-noise reads: one Promise.all over the cycle instead
    // of sequential DB round-trips, sharing the countCache above.
    const decisions = await Promise.all(
      detected.map(async (e) => {
        const ruleId = e.payload.ruleId ?? null;
        const rule = ruleId !== null ? byRule.get(ruleId) : undefined;
        if (!rule) return { e, allow: true, ruleId };
        const allow = await throttleAllows(
          store,
          rule,
          e.barrierId,
          at,
          countCache,
        );
        return { e, allow, ruleId: rule.id };
      }),
    );
    for (const { e, allow, ruleId } of decisions) {
      if (!allow) continue;
      throttled.push(e);
      if (ruleId !== null && ruleId !== undefined) {
        options.onRuleFired?.(ruleId);
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

  // Paginated fetch (200/page) so an alert backlog never loads unbounded
  // rows into one query. Snapshot before any marks so offsets stay stable.
  const SEND_BATCH = 200;
  const SEND_CONCURRENCY = 4;
  const POST_TIMEOUT_MS = 15_000;
  const allUnsent: UnsentAlert[] = [];
  for (let offset = 0;; offset += SEND_BATCH) {
    const batch = await store.listUnsent(SEND_BATCH, offset);
    if (batch.length === 0) break;
    allUnsent.push(...batch);
    if (batch.length < SEND_BATCH) break;
  }
  const sendable = allUnsent.filter((e) => !isDead(e.payload));
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

  async function processEvent(event: UnsentAlert): Promise<void> {
    const mapping = mapLanding(event.statusId);
    if (!mapping.send) {
      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger(`[provider] event ${event.id} accept failed: ${message}`);
        result.failed++;
        return;
      }
      result.sent++;
      return;
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
      historyId: event.payload.historyId,
      category: event.payload.category,
      author: event.payload.author,
      note: event.payload.note,
      companyId,
      link: barrierLink(appBaseUrl, event.barrierId),
      recipients: active,
    });
    if (!payload) {
      logger(`[provider] event ${event.id} has no valid destinos, skipping`);
      return;
    }
    try {
      const res = await withPostTimeout(sender.post(payload), POST_TIMEOUT_MS);
      result.posted++;
      if (res.aviso_token) {
        logger(
          `[provider] token rotation notice: ${
            res.aviso_token.mensagem ?? res.aviso_token.usando
          }`,
        );
      }
      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger(`[provider] event ${event.id} accept failed: ${message}`);
        result.failed++;
        return;
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
      try {
        await store.markFailed(event.id, message, next.deadLetter || deadNow);
      } catch (dbErr) {
        const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        logger(`[provider] event ${event.id} markFailed failed: ${dbMsg}`);
      }
      result.failed++;
      logger(`[provider] event ${event.id} failed: ${message}`);
    }
  }

  // Bounded parallelism (4): one slow provider POST never head-blocks the
  // rest, and the upstream never sees an unbounded burst. A per-event
  // try/catch above keeps one DB failure from stopping the batch.
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(SEND_CONCURRENCY, sendable.length) },
    async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= sendable.length) break;
        await processEvent(sendable[i]!);
      }
    },
  );
  await Promise.all(workers);
  return result;
}

// Immediate send lives in immediate.ts; re-exported for callers.
export { maybeSendProviderImmediate } from "./immediate.ts";
