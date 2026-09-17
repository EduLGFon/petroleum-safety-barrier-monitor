// Unit tests for alert rule matching - category toggles and event kinds.
import { isCategoryMuted, matchesRule, matchRules } from "./rules.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { AlertRule } from "../sql/alert_rules.ts";

function rule(over: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 1,
    name: "regra",
    category_id: null,
    to_status_id: null,
    critical_only: false,
    include_recovery: false,
    stale_days: null,
    notify_immediate: false,
    active: true,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

Deno.test("legacy fallback alerts every non-compliant landing", () => {
  const t = { categoryId: 3, statusId: 5, criticalityId: 0, compliant: false };
  assertStrictEquals(matchRules(t, [], false).matched, true);
  assertStrictEquals(
    matchRules({ ...t, compliant: true }, [], false).matched,
    false,
  );
});

Deno.test("disabled category never matches", () => {
  const rules = [rule({ category_id: 7 })];
  const other = {
    categoryId: 3,
    statusId: 5,
    criticalityId: 0,
    compliant: false,
  };
  assertStrictEquals(matchRules(other, rules, true).matched, false);
  assertStrictEquals(isCategoryMuted(3, rules), true);
  assertStrictEquals(isCategoryMuted(7, rules), false);
});

Deno.test("critical-only skips non-critical barriers", () => {
  const rules = [rule({ critical_only: true })];
  const calm = {
    categoryId: 1,
    statusId: 5,
    criticalityId: 0,
    compliant: false,
  };
  const crit = { ...calm, criticalityId: 1 };
  assertStrictEquals(matchRules(calm, rules, true).matched, false);
  assertStrictEquals(matchRules(crit, rules, true).matched, true);
});

Deno.test("recovery needs explicit opt-in", () => {
  const t = { categoryId: 1, statusId: 0, criticalityId: 0, compliant: true };
  assertStrictEquals(matchesRule(t, rule()), false);
  assertStrictEquals(matchesRule(t, rule({ include_recovery: true })), true);
});

Deno.test("specific status narrows the trigger", () => {
  const rules = [rule({ to_status_id: 5 })];
  const hit = {
    categoryId: 1,
    statusId: 5,
    criticalityId: 0,
    compliant: false,
  };
  assertStrictEquals(matchRules(hit, rules, true).matched, true);
  assertStrictEquals(
    matchRules({ ...hit, statusId: 4 }, rules, true).matched,
    false,
  );
});

Deno.test("immediate flag rides the first match", () => {
  const rules = [rule({ notify_immediate: true })];
  const t = { categoryId: 1, statusId: 5, criticalityId: 0, compliant: false };
  assertStrictEquals(matchRules(t, rules, true).immediate, true);
});
