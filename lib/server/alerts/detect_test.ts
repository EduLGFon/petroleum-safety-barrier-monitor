// Unit tests for urgent transition detection (P5) - fake store slice.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import type { WireBarrier } from "../../wireTypes.ts";
import { detectUrgentTransitions } from "./detect.ts";
import type { TransitionCandidate } from "./store.ts";

function wire(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 1,
    tag: "FAL-EQ-001",
    tipologiaId: 3,
    locationId: 1,
    locDescId: 0,
    criticidadeId: 1,
    categoriaId: 1,
    agrupamentoId: 0,
    donoId: -1,
    disponibilidadeId: 5,
    comentarios: "",
    planoAcao: "",
    statusSince: "2026-09-13",
    statusHistory: [],
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
    (id) => Promise.resolve(id === 1 ? wire() : null),
    null,
  );
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.dedupKey, "1:2026-09-13:5");
  assertStrictEquals(out[0]!.urgency, "critical"); // criticidadeId 1 = Crítica
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
    (id) =>
      Promise.resolve(
        id === 1 ? wire({ disponibilidadeId: 0 }) : null,
      ),
    "2026-09-01",
  );
  assertStrictEquals(out.length, 0);
});

Deno.test("detectUrgentTransitions tiers critical by criticidade", async () => {
  const candidates: TransitionCandidate[] = [
    { barrierId: 9, transitionDate: "2026-09-13", statusId: 5 },
  ];
  const store = {
    recentTransitions: (_since: string | null, _only?: number[]) =>
      Promise.resolve(candidates),
  };
  const out = await detectUrgentTransitions(
    store,
    () => Promise.resolve(wire({ id: 9, criticidadeId: 0 })),
    null,
  );
  assertStrictEquals(out.length, 1);
  // criticidadeId 0 is 'Não Crítica' -> urgent, not critical
  assertStrictEquals(out[0]!.urgency, "urgent");
});
