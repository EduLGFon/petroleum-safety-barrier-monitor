// Alert rule matching - pure predicate over transitions and rules.
// This is why it exists: detection must honor admin choices (multi-select
// scopes, urgency, transition source, anti-noise windows, priority) without
// touching the database, so the cycle stays unit-testable and the SQL store
// stays a thin persistence layer.
import type { AlertRule } from "../sql/alert_rules.ts";

import { isCriticalRankId } from "../../enums/codes.ts";

export interface RuleTransition {
  categoryId: number;
  statusId: number;
  fromStatusId?: number | null;
  criticalityId: number;
  locationId?: number | null;
  typologyId?: number | null;
  groupingId?: number | null;
  ownerId?: number | null;
  compliant: boolean;
  urgency?: "critical" | "urgent" | "none";
  hasActionPlan?: boolean;
  /** Evaluation instant (UTC) for quiet hours / active days / validity. */
  at?: Date;
}

export interface RuleMatch {
  matched: boolean;
  immediate: boolean;
  ruleId: number | null;
}

function inList(
  value: number | null | undefined,
  list: number[] | null,
): boolean {
  if (list === null || list === undefined || list.length === 0) return true;
  if (value === null || value === undefined) return false;
  return list.includes(value);
}

function urgencyOf(t: RuleTransition): "critical" | "urgent" | "none" {
  if (t.urgency) return t.urgency;
  if (t.compliant) return "none";
  return isCriticalRankId(t.criticalityId) ? "critical" : "urgent";
}

// inQuietHours: overnight ranges wrap (e.g. 22 -> 6 quiets 22:00-06:00).
function inQuietHours(
  nowHour: number,
  start: number | null,
  end: number | null,
): boolean {
  if (start === null || start === undefined) return false;
  if (end === null || end === undefined) return false;
  if (start === end) return false;
  if (start < end) return nowHour >= start && nowHour < end;
  return nowHour >= start || nowHour < end;
}

function timeGatesPass(rule: AlertRule, at: Date): boolean {
  const day = at.toISOString().slice(0, 10);
  if (rule.valid_from && day < rule.valid_from.slice(0, 10)) return false;
  if (rule.valid_to && day > rule.valid_to.slice(0, 10)) return false;
  if (rule.active_days && rule.active_days.length > 0) {
    if (!rule.active_days.includes(at.getUTCDay())) return false;
  }
  if (
    inQuietHours(at.getUTCHours(), rule.quiet_start_hour, rule.quiet_end_hour)
  ) {
    return false;
  }
  return true;
}

// matchesRule: one rule against one transition. Inactive rules never match;
// a null/empty list scope means "any". Recovery landings only match rules
// that opt in via include_recovery. Legacy single-id columns stay as
// fallbacks when the multi-select arrays are null.
export function matchesRule(
  t: RuleTransition,
  rule: AlertRule,
  at: Date = new Date(),
): boolean {
  if (!rule.active) return false;
  if (rule.on_transition === false) return false;
  if (!timeGatesPass(rule, t.at ?? at)) return false;

  // Category scope: new array wins, legacy single id is the fallback.
  const cats = rule.category_ids && rule.category_ids.length > 0
    ? rule.category_ids
    : (rule.category_id !== null ? [rule.category_id] : null);
  if (!inList(t.categoryId, cats)) return false;

  // Landing status scope: same fallback pattern.
  const landing = rule.to_status_ids && rule.to_status_ids.length > 0
    ? rule.to_status_ids
    : (rule.to_status_id !== null ? [rule.to_status_id] : null);
  if (landing !== null && !landing.includes(t.statusId)) return false;
  // Without an explicit landing scope, calm landings need recovery opt-in.
  if (landing === null && t.compliant && !rule.include_recovery) return false;

  // Transition source filter (from -> to rules).
  if (!inList(t.fromStatusId ?? null, rule.from_status_ids)) return false;

  // Criticality: explicit ranks win; legacy critical_only maps to ESO/A.
  if (rule.criticality_ids && rule.criticality_ids.length > 0) {
    if (!rule.criticality_ids.includes(t.criticalityId)) return false;
  } else if (rule.critical_only && !isCriticalRankId(t.criticalityId)) {
    return false;
  }

  if (!inList(t.locationId ?? null, rule.location_ids)) return false;
  if (!inList(t.typologyId ?? null, rule.typology_ids)) return false;
  if (!inList(t.groupingId ?? null, rule.grouping_ids)) return false;
  if (!inList(t.ownerId ?? null, rule.owner_ids)) return false;

  const urgency = urgencyOf(t);
  if (rule.urgency === "critical" && urgency !== "critical") return false;
  if (rule.urgency === "urgent" && urgency === "none") return false;

  if (rule.only_no_action_plan && t.hasActionPlan) return false;

  return true;
}

// sortedRules: priority first (higher wins), then lower id for stability.
export function sortedRules(rules: AlertRule[]): AlertRule[] {
  return [...rules].sort((a, b) =>
    (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
  );
}

// matchRules: first matching active rule (by priority) wins the immediacy
// flag and reports its id. When no rules are configured at all, fall back
// to the legacy behavior (every non-compliant landing alerts via digest)
// so existing deployments keep working until an admin defines rules.
export function matchRules(
  t: RuleTransition,
  rules: AlertRule[],
  hasAnyRule: boolean,
  at: Date = new Date(),
): RuleMatch {
  if (!hasAnyRule) {
    return { matched: !t.compliant, immediate: false, ruleId: null };
  }
  for (const rule of sortedRules(rules)) {
    if (!rule.active) continue;
    if (matchesRule(t, rule, at)) {
      return {
        matched: true,
        immediate: rule.notify_immediate,
        ruleId: rule.id,
      };
    }
  }
  return { matched: false, immediate: false, ruleId: null };
}

// matchesStaleScope: stale reminders reuse the scope/urgency/time gates but
// ignore landing/from filters (the barrier never "landed" now) and honor
// on_transition-only vs stale-capable rules via stale_days presence.
export function matchesStaleScope(
  scope: {
    categoryId: number;
    criticalityId: number;
    locationId?: number | null;
    typologyId?: number | null;
    groupingId?: number | null;
    ownerId?: number | null;
    urgency?: "critical" | "urgent" | "none";
    hasActionPlan?: boolean;
  },
  rule: AlertRule,
  at: Date = new Date(),
): boolean {
  if (!rule.active) return false;
  if (rule.stale_days === null || rule.stale_days === undefined) return false;
  if (!timeGatesPass(rule, at)) return false;
  const cats = rule.category_ids && rule.category_ids.length > 0
    ? rule.category_ids
    : (rule.category_id !== null ? [rule.category_id] : null);
  if (!inList(scope.categoryId, cats)) return false;
  if (rule.criticality_ids && rule.criticality_ids.length > 0) {
    if (!rule.criticality_ids.includes(scope.criticalityId)) return false;
  } else if (rule.critical_only && !isCriticalRankId(scope.criticalityId)) {
    return false;
  }
  if (!inList(scope.locationId ?? null, rule.location_ids)) return false;
  if (!inList(scope.typologyId ?? null, rule.typology_ids)) return false;
  if (!inList(scope.groupingId ?? null, rule.grouping_ids)) return false;
  if (!inList(scope.ownerId ?? null, rule.owner_ids)) return false;
  const urgency = scope.urgency ??
    (isCriticalRankId(scope.criticalityId) ? "critical" : "urgent");
  if (rule.urgency === "critical" && urgency !== "critical") return false;
  if (rule.urgency === "urgent" && urgency === "none") return false;
  if (rule.only_no_action_plan && scope.hasActionPlan) return false;
  return true;
}

// isCategoryMuted: true when rules exist but none active covers the category.
// Lets the digest log explain why a category never alerts.
export function isCategoryMuted(
  categoryId: number,
  rules: AlertRule[],
): boolean {
  if (rules.length === 0) return false;
  return !rules.some((r) =>
    r.active &&
    (r.category_ids && r.category_ids.length > 0
      ? r.category_ids.includes(categoryId)
      : (r.category_id === null || r.category_id === categoryId))
  );
}
