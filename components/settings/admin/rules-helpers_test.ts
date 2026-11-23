// Unit tests for the rules helpers - draft payloads and the dirty check.
// This is why they exist: the alert-rule payload builder and the editor's
// unsaved-changes guard are pure; they must survive refactors of the heavy
// RuleEditorModal (agents.md section 8).
import {
  type AlertRule,
  draftsDiffer,
  draftToPayload,
  EMPTY_DRAFT,
  numCoercionError,
  numOrNull,
  ruleNameError,
  ruleToDraft,
} from "./rules-helpers.tsx";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

function sampleRule(over: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 7,
    name: "Críticas indisponíveis",
    description: "",
    category_id: null,
    to_status_id: null,
    critical_only: false,
    include_recovery: false,
    stale_days: null,
    stale_repeat_days: null,
    notify_immediate: false,
    active: true,
    category_ids: [1, 2],
    from_status_ids: null,
    to_status_ids: [3],
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
    priority: 5,
    valid_from: null,
    valid_to: null,
    last_triggered_at: null,
    ...over,
  };
}

Deno.test("numOrNull keeps 0 and drops blanks and non-integers", () => {
  assertEquals(numOrNull(""), null);
  assertEquals(numOrNull("  "), null);
  assertEquals(numOrNull("0"), 0);
  assertEquals(numOrNull("5"), 5);
  assertEquals(numOrNull("abc"), null);
  assertEquals(numOrNull("1.5"), null);
});

Deno.test("numCoercionError flags only non-integer text", () => {
  assertStrictEquals(numCoercionError(""), null);
  assertStrictEquals(numCoercionError("12"), null);
  assert(numCoercionError("abc")?.includes("não é um número inteiro válido"));
  assert(numCoercionError("1.5")?.includes("não é um número inteiro válido"));
});

Deno.test("draftToPayload maps empty numeric strings to null, not 0", () => {
  const payload = draftToPayload(EMPTY_DRAFT);
  assertEquals(payload.staleDays, null);
  assertEquals(payload.staleRepeatDays, null);
  assertEquals(payload.cooldownMinutes, null);
  assertEquals(payload.maxPerDay, null);
  assertEquals(payload.quietStartHour, null);
  assertEquals(payload.quietEndHour, null);
  assertEquals(payload.validFrom, null);
  assertEquals(payload.validTo, null);
  assertEquals(payload.priority, 0);
  assertEquals(payload.onTransition, true);
  assertEquals(payload.active, true);
});

Deno.test("draftToPayload keeps an explicit 0 distinct from null", () => {
  const payload = draftToPayload({
    ...EMPTY_DRAFT,
    staleDays: "0",
    cooldownMinutes: "0",
    priority: "0",
  });
  assertEquals(payload.staleDays, 0);
  assertEquals(payload.cooldownMinutes, 0);
  assertEquals(payload.priority, 0);
});

Deno.test("ruleToDraft then draftToPayload round-trips wire values", () => {
  const rule = sampleRule({
    stale_days: 0,
    stale_repeat_days: 7,
    cooldown_minutes: null,
    max_per_day: 10,
    quiet_start_hour: 22,
    quiet_end_hour: 7,
    active_days: [1, 5],
    priority: 3,
    valid_from: "2026-01-01",
    valid_to: null,
    urgency: "critical",
    notify_immediate: true,
    critical_only: true,
  });
  const payload = draftToPayload(ruleToDraft(rule));
  assertEquals(payload.staleDays, 0);
  assertEquals(payload.staleRepeatDays, 7);
  assertEquals(payload.cooldownMinutes, null);
  assertEquals(payload.maxPerDay, 10);
  assertEquals(payload.quietStartHour, 22);
  assertEquals(payload.quietEndHour, 7);
  assertEquals(payload.activeDays, [1, 5]);
  assertEquals(payload.priority, 3);
  assertEquals(payload.validFrom, "2026-01-01");
  assertEquals(payload.validTo, null);
  assertEquals(payload.urgency, "critical");
  assertEquals(payload.notifyImmediate, true);
  assertEquals(payload.criticalOnly, true);
  assertEquals(payload.categoryIds, [1, 2]);
  assertEquals(payload.toStatusIds, [3]);
  assertEquals(payload.fromStatusIds, []);
});

Deno.test("draftsDiffer is false for equal drafts and true per change", () => {
  assertEquals(draftsDiffer(EMPTY_DRAFT, EMPTY_DRAFT), false);
  assertEquals(
    draftsDiffer(ruleToDraft(sampleRule()), ruleToDraft(sampleRule())),
    false,
  );
  // Strings
  assertEquals(draftsDiffer({ ...EMPTY_DRAFT, name: "x" }, EMPTY_DRAFT), true);
  assertEquals(
    draftsDiffer({ ...EMPTY_DRAFT, description: "d" }, EMPTY_DRAFT),
    true,
  );
  assertEquals(
    draftsDiffer({ ...EMPTY_DRAFT, staleDays: "5" }, EMPTY_DRAFT),
    true,
  );
  assertEquals(
    draftsDiffer({ ...EMPTY_DRAFT, priority: "2" }, {
      ...EMPTY_DRAFT,
      priority: "0",
    }),
    true,
  );
  // Booleans and enums
  assertEquals(
    draftsDiffer({ ...EMPTY_DRAFT, active: false }, EMPTY_DRAFT),
    true,
  );
  assertEquals(
    draftsDiffer({ ...EMPTY_DRAFT, urgency: "urgent" }, EMPTY_DRAFT),
    true,
  );
  // Id lists by content; order is normalized by SearchMultiSelect
  assertEquals(
    draftsDiffer({ ...EMPTY_DRAFT, locationIds: [1] }, EMPTY_DRAFT),
    true,
  );
  assertEquals(
    draftsDiffer(
      { ...EMPTY_DRAFT, categoryIds: [1, 2] },
      { ...EMPTY_DRAFT, categoryIds: [2, 1] },
    ),
    false,
  );
  assertEquals(
    draftsDiffer(
      { ...EMPTY_DRAFT, activeDays: [1, 5] },
      { ...EMPTY_DRAFT, activeDays: [1, 5] },
    ),
    false,
  );
  // The untouched default draft must never read as dirty.
  assertEquals(draftsDiffer(ruleToDraft(sampleRule()), EMPTY_DRAFT), true);
});

Deno.test("ruleNameError requires a non-empty name", () => {
  assertEquals(ruleNameError(""), "Informe o nome da regra.");
  assertEquals(ruleNameError("   "), "Informe o nome da regra.");
  assertEquals(ruleNameError("Regra"), null);
});
