// Alert rule matching - pure predicate over transitions and rules.
// This is why it exists: detection must honor admin choices (per-category
// enable/disable, critical-only, recovery, immediate vs digest) without
// touching the database, so the cycle stays unit-testable and the SQL store
// stays a thin persistence layer.
import type { AlertRule } from "../sql/alert_rules.ts";

export interface RuleTransition {
  categoryId: number;
  statusId: number;
  criticalityId: number;
  compliant: boolean;
}

export interface RuleMatch {
  matched: boolean;
  immediate: boolean;
}

// matchesRule: one rule against one transition. Inactive rules never match;
// a null category or status means "any". Recovery landings only match rules
// that opt in via include_recovery.
export function matchesRule(t: RuleTransition, rule: AlertRule): boolean {
  if (!rule.active) return false;
  if (rule.category_id !== null && rule.category_id !== t.categoryId) {
    return false;
  }
  if (rule.critical_only && t.criticalityId !== 1) return false;
  if (t.compliant && !rule.include_recovery) return false;
  if (
    !t.compliant && rule.to_status_id !== null &&
    rule.to_status_id !== t.statusId
  ) {
    return false;
  }
  if (
    t.compliant && rule.to_status_id !== null &&
    rule.to_status_id !== t.statusId
  ) {
    return false;
  }
  return true;
}

// matchRules: first matching active rule wins the immediacy flag. When no
// rules are configured at all, fall back to the legacy behavior (every
// non-compliant landing alerts via digest) so existing deployments keep
// working until an admin defines explicit rules.
export function matchRules(
  t: RuleTransition,
  rules: AlertRule[],
  hasAnyRule: boolean,
): RuleMatch {
  if (!hasAnyRule) {
    return { matched: !t.compliant, immediate: false };
  }
  for (const rule of rules) {
    if (!rule.active) continue;
    if (matchesRule(t, rule)) {
      return { matched: true, immediate: rule.notify_immediate };
    }
  }
  return { matched: false, immediate: false };
}

// isCategoryMuted: true when rules exist but none active covers the category.
// Lets the digest log explain why a category never alerts.
export function isCategoryMuted(
  categoryId: number,
  rules: AlertRule[],
): boolean {
  if (rules.length === 0) return false;
  return !rules.some((r) =>
    r.active && (r.category_id === null || r.category_id === categoryId)
  );
}
