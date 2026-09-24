// Urgent transition detection - history rows that entered an urgent state.
// This is why it exists: the send path must only fire on transitions INTO
// urgent (a barrier that was already urgent last run is not news), resolved
// through the same isUrgent predicate the dashboard uses, then filtered by
// admin alert rules (per-category enable/disable, critical-only, recovery).
import { type AlertStore, dedupKey, type NewAlertEvent } from "./store.ts";

import { isUrgent } from "../../dashboard/urgent.ts";

import type { AlertRule } from "../sql/alert_rules.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import { isCompliant } from "../../constants.ts";

import { fromAvailabilityId } from "../../enums.ts";

import { resolveBarrier, type ResolverLabels } from "../../resolve.ts";

import { extractDetail } from "./enrich.ts";

import { matchRules } from "./rules.ts";

export interface DetectedUrgent extends NewAlertEvent {
  urgency: "critical" | "urgent" | "none";
}

// StatusInfo: the landing status looked up by id (authoritative when loaded
// from availability_statuses; seed-enum fallback otherwise, fail-closed:
// unknown ids count as non-compliant so novel statuses alert).
export interface StatusInfo {
  labelOf?: (statusId: number) => string;
  compliantOf?: (statusId: number) => boolean;
}

export function landingLabel(
  statusId: number,
  info?: StatusInfo,
): string {
  return info?.labelOf?.(statusId) ?? fromAvailabilityId(statusId);
}

export function landingCompliant(
  statusId: number,
  info?: StatusInfo,
): boolean {
  return info?.compliantOf?.(statusId) ??
    isCompliant(fromAvailabilityId(statusId));
}

// detectUrgentTransitions: candidates since the watermark, resolved to
// domain barriers, keeping landings allowed by active rules. Legacy path
// (no rules configured) keeps the old isUrgent gate; configured rules add
// per-category enable/disable, critical-only narrowing, and opt-in recovery
// alerts. loadBarriers batches ids in one query so tests stay DB-free.
export async function detectUrgentTransitions(
  store: Pick<AlertStore, "recentTransitions">,
  loadBarriers: (ids: number[]) => Promise<Map<number, WireBarrier>>,
  since: string | null,
  onlyBarrierIds?: number[],
  rules: AlertRule[] = [],
  hasAnyRule = false,
  labels?: ResolverLabels,
  statusInfo?: StatusInfo,
): Promise<DetectedUrgent[]> {
  const candidates = await store.recentTransitions(since, onlyBarrierIds);
  const barriers = await loadBarriers(candidates.map((c) => c.barrierId));
  const out: DetectedUrgent[] = [];
  for (const c of candidates) {
    const wire = barriers.get(c.barrierId);
    if (!wire) continue; // barrier deleted after the transition
    const barrier = resolveBarrier(wire, labels);
    // Landing truth, not current state: the barrier may have moved on
    // since (the sync poller reverts manual edits within a minute), so
    // compliance, urgency and the display status all derive from the
    // candidate statusId - otherwise reverted transitions go invisible.
    const compliant = landingCompliant(c.statusId, statusInfo);
    const urgency = !compliant
      ? (wire.criticalityId === 1 ? "critical" : "urgent")
      : "none";
    const match = matchRules(
      {
        categoryId: wire.categoryId,
        statusId: c.statusId,
        criticalityId: wire.criticalityId,
        compliant,
      },
      rules,
      hasAnyRule,
    );
    if (!match.matched) continue; // muted category, narrowed or calm
    if (!hasAnyRule && urgency === "none") continue; // legacy calm skip
    const detail = extractDetail(
      wire,
      c.transitionDate,
      c.statusId,
      labels,
    );
    out.push({
      barrierId: c.barrierId,
      transitionDate: c.transitionDate,
      statusId: c.statusId,
      dedupKey: dedupKey(c.barrierId, c.transitionDate, c.statusId),
      payload: {
        tag: barrier.tag,
        location: barrier.location,
        availability: landingLabel(c.statusId, statusInfo),
        criticality: barrier.criticality,
        urgency,
        attempts: 0,
        lastError: null,
        deadLetter: false,
        delivered: [],
        category: barrier.category,
        immediate: match.immediate,
        ...detail,
      },
      urgency,
    });
  }
  return out;
}

// isUrgent re-export for call sites that only need the gate.
export { isUrgent };
