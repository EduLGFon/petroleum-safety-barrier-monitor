// Unit tests for urgent transition detection (P5) - fake store slice.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { AlertRule } from "../sql/alert_rules.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import { detectUrgentTransitions } from "./detect.ts";

import type { TransitionCandidate } from "./store.ts";

function wire(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 1,
    tag: "FAL-EQ-001",
    typologyId: 3,
    locationId: 1,
    locDescId: 0,
    criticalityId: 1,
    categoryId: 1,
    groupingId: 0,
    ownerId: -1,
    availabilityId: 5,
    comments: "",
    actionPlan: "",
    statusSince: "2026-09-13",
    statusHistory: [],
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
    ...over,
  };
}

Deno.test("detectUrgentTransitions keeps urgent landings with context", async () => {
  const candidates: TransitionCandidate[] = [
    { barrierId: 1, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const store = {
    recentTransitions: (_since: string | null, _only?: number[]) =>
      Promise.resolve(candidates),
  };
  const out = await detectUrgentTransitions(
    store,
    (ids) => {
      const out = new Map<number, WireBarrier>();
      for (const id of ids) if (id === 1) out.set(id, wire());
      return Promise.resolve(out);
    },
    null,
  );
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.dedupKey, "1:2026-09-13:5");
  assertStrictEquals(out[0]!.urgency, "critical"); // criticalityId 1 = critical
  assertStrictEquals(out[0]!.payload.tag, "FAL-EQ-001");
  assertStrictEquals(out[0]!.payload.delivered.length, 0);
});

Deno.test("detectUrgentTransitions drops calm landings and gone barriers", async () => {
  const candidates: TransitionCandidate[] = [
    { barrierId: 1, transitionDate: "2026-09-13", statusId: 0 },
    { barrierId: 2, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const store = {
    recentTransitions: (_since: string | null, _only?: number[]) =>
      Promise.resolve(candidates),
  };
  const out = await detectUrgentTransitions(
    store,
    (ids) => {
      const out = new Map<number, WireBarrier>();
      for (const id of ids) {
        if (id === 1) out.set(id, wire({ availabilityId: 0 }));
      }
      return Promise.resolve(out);
    },
    "2026-09-01",
  );
  assertStrictEquals(out.length, 0);
});

Deno.test("detectUrgentTransitions sees reverted landings, not current state", async () => {
  // The sync poller reverts manual edits within a minute: the wire barrier
  // is back to Disponível while history holds the Indisponível landing.
  // Detection must judge the landing, or the transition goes invisible.
  const candidates: TransitionCandidate[] = [
    { barrierId: 1, transitionDate: "2026-09-24", statusId: 5 },
  ];
  const store = {
    recentTransitions: (_since: string | null, _only?: number[]) =>
      Promise.resolve(candidates),
  };
  const out = await detectUrgentTransitions(
    store,
    (ids) => {
      const out = new Map<number, WireBarrier>();
      for (const id of ids) {
        if (id === 1) out.set(id, wire({ availabilityId: 0 }));
      }
      return Promise.resolve(out);
    },
    "2026-09-24",
  );
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.payload.availability, "Indisponível");
  assertStrictEquals(out[0]!.urgency, "critical");
});

Deno.test("detectUrgentTransitions tiers critical by criticality", async () => {
  const candidates: TransitionCandidate[] = [
    { barrierId: 9, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const store = {
    recentTransitions: (_since: string | null, _only?: number[]) =>
      Promise.resolve(candidates),
  };
  const out = await detectUrgentTransitions(
    store,
    (ids) => {
      const out = new Map<number, WireBarrier>();
      for (const id of ids) {
        out.set(id, wire({ id, criticalityId: 3 }));
      }
      return Promise.resolve(out);
    },
    null,
  );
  assertStrictEquals(out.length, 1);
  // criticalityId 3 (rank C) is non-critical -> urgent, not critical
  assertStrictEquals(out[0]!.urgency, "urgent");
});

// ---- from -> to derivation (audit F4) ----

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

function historyEntry(
  id: number,
  date: string,
  statusId: number,
): WireBarrier["statusHistory"][number] {
  return { id, date, statusId, authorId: 0, note: "" };
}

function loaderFor(
  history: WireBarrier["statusHistory"],
): (ids: number[]) => Promise<Map<number, WireBarrier>> {
  return (ids) => {
    const out = new Map<number, WireBarrier>();
    for (const id of ids) {
      if (id === 1) out.set(id, wire({ statusHistory: history }));
    }
    return Promise.resolve(out);
  };
}

function storeFor(
  candidates: TransitionCandidate[],
): { recentTransitions: () => Promise<TransitionCandidate[]> } {
  return { recentTransitions: () => Promise.resolve(candidates) };
}

Deno.test("detect resolves fromStatusId from the same-day predecessor", async () => {
  // Same-day chain Disponivel(0) -> Degradado(4) -> Indisponivel(5): the
  // candidate's from is its IMMEDIATE predecessor (the Degradado entry),
  // so a Degradado -> Indisponivel rule fires (audit F4).
  const history = [
    historyEntry(101, "2026-09-13T10:00:00Z", 0),
    historyEntry(102, "2026-09-13T11:00:00Z", 4),
    historyEntry(103, "2026-09-13T12:00:00Z", 5),
  ];
  const candidates: TransitionCandidate[] = [
    { id: 103, barrierId: 1, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const out = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
    undefined,
    [rule({ from_status_ids: [4], to_status_ids: [5] })],
    true,
  );
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.payload.ruleId, 1);
});

Deno.test("detect keeps the same-day predecessor over an older day", async () => {
  // The old backward walk broke on the first entry dated before the
  // candidate and overwrote the same-day predecessor with the older day's
  // status, so a from=[0] rule wrongly matched this landing (audit F4).
  const history = [
    historyEntry(101, "2026-09-12T08:00:00Z", 0),
    historyEntry(102, "2026-09-13T11:00:00Z", 4),
    historyEntry(103, "2026-09-13T12:00:00Z", 5),
  ];
  const candidates: TransitionCandidate[] = [
    { id: 103, barrierId: 1, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const olderDay = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
    undefined,
    [rule({ from_status_ids: [0], to_status_ids: [5] })],
    true,
  );
  assertStrictEquals(olderDay.length, 0);
  const sameDay = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
    undefined,
    [rule({ from_status_ids: [4], to_status_ids: [5] })],
    true,
  );
  assertStrictEquals(sameDay.length, 1);
});

Deno.test("detect leaves fromStatusId null for a first landing", async () => {
  // Candidate id 101 is the barrier's first history entry: no predecessor
  // exists, so from -> to rules never match. The old walk picked up the
  // LATER same-day recovery (id 102, status 0) as the from and let from=[0]
  // rules fire on a first landing (audit F4).
  const history = [
    historyEntry(101, "2026-09-13T10:00:00Z", 5),
    historyEntry(102, "2026-09-13T11:00:00Z", 0),
  ];
  const candidates: TransitionCandidate[] = [
    { id: 101, barrierId: 1, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const narrowed = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
    undefined,
    [rule({ from_status_ids: [0], to_status_ids: [5] })],
    true,
  );
  assertStrictEquals(narrowed.length, 0);
  // Legacy path (no rules configured) still alerts on the non-compliant
  // landing: fromStatusId only narrows configured from -> to rules.
  const legacy = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
  );
  assertStrictEquals(legacy.length, 1);
});

// ---- id-absent candidates (fallback branch, no id in production calls) ----

Deno.test("detect id-absent candidates fall back to the same-day match", async () => {
  // Without a candidate id the fallback resolves the LATEST same-day
  // same-status entry (enrich.ts parity) and takes its predecessor, so
  // from -> to rules still narrow correctly for legacy callers.
  const history = [
    historyEntry(101, "2026-09-13T10:00:00Z", 4),
    historyEntry(102, "2026-09-13T11:00:00Z", 5),
  ];
  const candidates: TransitionCandidate[] = [
    { barrierId: 1, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const out = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
    undefined,
    [rule({ from_status_ids: [4], to_status_ids: [5] })],
    true,
  );
  assertStrictEquals(out.length, 1);
});

Deno.test("detect id-absent candidates fail closed without a same-day match", async () => {
  // No same-day same-status entry to stand in for the candidate: the
  // fallback finds nothing, from stays null, and from -> to rules fail
  // closed instead of borrowing the older day's status.
  const history = [
    historyEntry(101, "2026-09-12T10:00:00Z", 4),
  ];
  const candidates: TransitionCandidate[] = [
    { barrierId: 1, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const out = await detectUrgentTransitions(
    storeFor(candidates),
    loaderFor(history),
    null,
    undefined,
    [rule({ from_status_ids: [4], to_status_ids: [5] })],
    true,
  );
  assertStrictEquals(out.length, 0);
});
