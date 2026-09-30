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
    description: "",
    category_ids: null,
    from_status_ids: null,
    to_status_ids: null,
    location_ids: null,
    criticality_ids: null,
    typology_ids: null,
    grouping_ids: null,
    owner_ids: null,
    urgency: "any",
    only_no_action_plan: false,
    on_transition: true,
    cooldown_minutes: null,
    max_per_day: null,
    quiet_start_hour: null,
    quiet_end_hour: null,
    active_days: null,
    priority: 0,
    valid_from: null,
    valid_to: null,
    stale_repeat_days: null,
    last_triggered_at: null,
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
    criticalityId: 2,
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

Deno.test("multi-category array narrows the trigger", () => {
  const rules = [rule({ category_ids: [3, 7] })];
  const hit = {
    categoryId: 7,
    statusId: 5,
    criticalityId: 0,
    compliant: false,
  };
  assertStrictEquals(matchRules(hit, rules, true).matched, true);
  assertStrictEquals(
    matchRules({ ...hit, categoryId: 9 }, rules, true).matched,
    false,
  );
});

Deno.test("from -> to transition narrows the trigger", () => {
  const rules = [rule({ from_status_ids: [4], to_status_ids: [5] })];
  const hit = {
    categoryId: 1,
    statusId: 5,
    fromStatusId: 4,
    criticalityId: 0,
    compliant: false,
  };
  assertStrictEquals(matchRules(hit, rules, true).matched, true);
  assertStrictEquals(
    matchRules({ ...hit, fromStatusId: 0 }, rules, true).matched,
    false,
  );
});

Deno.test("location and criticality arrays narrow the trigger", () => {
  const rules = [rule({ location_ids: [2], criticality_ids: [0, 1] })];
  const base = {
    categoryId: 1,
    statusId: 5,
    criticalityId: 1,
    locationId: 2,
    compliant: false,
  };
  assertStrictEquals(matchRules(base, rules, true).matched, true);
  assertStrictEquals(
    matchRules({ ...base, locationId: 9 }, rules, true).matched,
    false,
  );
  assertStrictEquals(
    matchRules({ ...base, criticalityId: 3 }, rules, true).matched,
    false,
  );
});

Deno.test("urgency gate keeps non-critical out of critical rules", () => {
  const rules = [rule({ urgency: "critical" })];
  const calm = {
    categoryId: 1,
    statusId: 5,
    criticalityId: 3,
    compliant: false,
    urgency: "urgent" as const,
  };
  assertStrictEquals(matchRules(calm, rules, true).matched, false);
  assertStrictEquals(
    matchRules(
      { ...calm, criticalityId: 0, urgency: "critical" as const },
      rules,
      true,
    )
      .matched,
    true,
  );
});

Deno.test("quiet hours suppress matching inside the window", () => {
  const rules = [rule({ quiet_start_hour: 22, quiet_end_hour: 6 })];
  const t = { categoryId: 1, statusId: 5, criticalityId: 0, compliant: false };
  const night = new Date("2026-09-30T23:00:00Z");
  const noon = new Date("2026-09-30T12:00:00Z");
  assertStrictEquals(matchRules(t, rules, true, night).matched, false);
  assertStrictEquals(matchRules(t, rules, true, noon).matched, true);
});

Deno.test("priority decides first-match wins", () => {
  const low = rule({ id: 1, priority: 0, notify_immediate: false });
  const high = rule({ id: 2, priority: 10, notify_immediate: true });
  const t = { categoryId: 1, statusId: 5, criticalityId: 0, compliant: false };
  const m = matchRules(t, [low, high], true);
  assertStrictEquals(m.matched, true);
  assertStrictEquals(m.ruleId, 2);
  assertStrictEquals(m.immediate, true);
});

Deno.test("stale-only rules never match transitions", () => {
  const t = { categoryId: 1, statusId: 5, criticalityId: 0, compliant: false };
  assertStrictEquals(
    matchesRule(t, rule({ on_transition: false, stale_days: 7 })),
    false,
  );
});

Deno.test("only_no_action_plan skips barriers with a plan", () => {
  const rules = [rule({ only_no_action_plan: true })];
  const base = {
    categoryId: 1,
    statusId: 5,
    criticalityId: 0,
    compliant: false,
  };
  assertStrictEquals(
    matchRules({ ...base, hasActionPlan: true }, rules, true).matched,
    false,
  );
  assertStrictEquals(
    matchRules({ ...base, hasActionPlan: false }, rules, true).matched,
    true,
  );
});
