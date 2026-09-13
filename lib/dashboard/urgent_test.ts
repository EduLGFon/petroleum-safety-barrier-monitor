// Unit tests for the urgent predicate (P5).
import {
  compareUrgency,
  isUrgent,
  urgencyOf,
  urgentBarriers,
} from "./urgent.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { Barrier } from "../types.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "T-1",
    typology: "Estação Coletora",
    location: "FAL",
    locDesc: "Rig",
    criticality: "Não Crítica",
    category: "Cat",
    grouping: "Ag",
    owner: "",
    availability: "Disponível",
    compliance: "Conforme",
    comments: "",
    actionPlan: "",
    statusSince: "2026-01-01",
    statusHistory: [],
    ...over,
  };
}

Deno.test("urgencyOf tiers critical / urgent / none", () => {
  assertStrictEquals(urgencyOf(barrier()), "none");
  assertStrictEquals(
    urgencyOf(barrier({ compliance: "Não Conforme" })),
    "urgent",
  );
  assertStrictEquals(
    urgencyOf(
      barrier({ compliance: "Não Conforme", criticality: "Crítica" }),
    ),
    "critical",
  );
});

Deno.test("urgencyOf is fail-closed on novel values", () => {
  assertStrictEquals(
    urgencyOf(barrier({ compliance: "Em Auditoria" })),
    "urgent",
  );
  assertStrictEquals(
    urgencyOf(
      barrier({ compliance: "Em Auditoria", criticality: "Crítica" }),
    ),
    "critical",
  );
});

Deno.test("isUrgent matches the NcAlert card population exactly", () => {
  const list = [
    barrier({ compliance: "Conforme" }),
    barrier({ compliance: "Não Conforme" }),
    barrier({ compliance: "Em Auditoria" }),
  ];
  assertStrictEquals(list.filter(isUrgent).length, 2);
});

Deno.test("compareUrgency orders critical, then oldest, then id", () => {
  const criticalNew = barrier({
    id: 3,
    compliance: "Não Conforme",
    criticality: "Crítica",
    statusSince: "2026-06-01",
  });
  const urgentOld = barrier({
    id: 1,
    compliance: "Não Conforme",
    statusSince: "2026-01-01",
  });
  const urgentNew = barrier({
    id: 2,
    compliance: "Não Conforme",
    statusSince: "2026-05-01",
  });
  const calm = barrier({ id: 4 });
  const sorted = [urgentNew, calm, urgentOld, criticalNew].sort(compareUrgency);
  assertStrictEquals(sorted.map((b) => b.id).join(","), "3,1,2,4");
});

Deno.test("compareUrgency pushes missing statusSince last", () => {
  const noDate = barrier({
    id: 1,
    compliance: "Não Conforme",
    statusSince: "",
  });
  const dated = barrier({
    id: 2,
    compliance: "Não Conforme",
    statusSince: "2026-01-01",
  });
  assertStrictEquals([noDate, dated].sort(compareUrgency)[0]!.id, 2);
});

Deno.test("urgentBarriers filters and orders in one pass", () => {
  const out = urgentBarriers([
    barrier({ id: 1 }),
    barrier({ id: 2, compliance: "Não Conforme", statusSince: "2026-03-01" }),
    barrier({
      id: 3,
      compliance: "Não Conforme",
      criticality: "Crítica",
      statusSince: "2026-04-01",
    }),
  ]);
  assertStrictEquals(out.map((b) => b.id).join(","), "3,2");
});
