// Unit tests for urgent transition detection (P5) - fake store slice.
import { assertStrictEquals } from "jsr:@std/assert@^1";
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
        out.set(id, wire({ id, criticalityId: 0 }));
      }
      return Promise.resolve(out);
    },
    null,
  );
  assertStrictEquals(out.length, 1);
  // criticalityId 0 is non-critical -> urgent, not critical
  assertStrictEquals(out[0]!.urgency, "urgent");
});
