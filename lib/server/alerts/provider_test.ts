// Unit tests for provider mapping + payload (generic, no network).
import {
  buildAlertaId,
  buildAlertPayload,
  buildMensagem,
  buildTitulo,
  mapLanding,
} from "./provider.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";
import { assert } from "jsr:@std/assert@^1";

Deno.test("mapLanding routes uncontained unavailable to immediate messaging", () => {
  const m = mapLanding(5);
  assertStrictEquals(m.situacao, "violada");
  assertStrictEquals(m.despacharAgora, true);
  assertStrictEquals(m.withMessaging, true);
  assertStrictEquals(m.send, true);
});

Deno.test("mapLanding keeps degraded and contained on email queue", () => {
  for (const id of [4, 2, 3]) {
    const m = mapLanding(id);
    assertStrictEquals(m.situacao, "degradada");
    assertStrictEquals(m.despacharAgora, false);
    assertStrictEquals(m.withMessaging, false);
    assertStrictEquals(m.send, true);
  }
});

Deno.test("mapLanding suppresses planned stop, maps available to recovery", () => {
  assertStrictEquals(mapLanding(1).send, false);
  assertStrictEquals(mapLanding(0).situacao, "normalizada");
});

Deno.test("buildTitulo follows [rank] status location name code", () => {
  assertStrictEquals(
    buildTitulo("A", "Indisponivel", "L-01", "TAG-001", "EXT-001"),
    "[A] Indisponivel L-01 TAG-001 EXT-001",
  );
});

Deno.test("buildAlertaId is stable and capped", () => {
  assertStrictEquals(buildAlertaId(42, "2026-10-14", 5), "BAR-42-20261014-5");
});

Deno.test("buildMensagem caps at 1200 chars", () => {
  const long = buildMensagem({
    newStatus: "Indisponivel",
    since: "2026-10-14",
    note: "x".repeat(5000),
  });
  assert(long.length <= 1200);
});

Deno.test("violada attaches messaging only when a phone exists", () => {
  const base = {
    barrierId: 7,
    externalCode: "EXT-7",
    tag: "TAG-007",
    criticality: "A",
    statusLabel: "Indisponivel",
    locationLabel: "L-01",
    transitionDate: "2026-10-14",
    ocorridoEm: "2026-10-14T12:00:00-03:00",
    statusId: 5,
    companyId: 1,
    recipients: [{ email: "a@example.com", phone: "" }],
  };
  const emailOnly = buildAlertPayload(base)!;
  assertStrictEquals(emailOnly.canais.join(","), "email");
  const withPhone = buildAlertPayload({
    ...base,
    recipients: [{ email: "a@example.com", phone: "5527999999999" }],
  })!;
  assert(withPhone.canais.includes("messaging"));
  assertStrictEquals(withPhone.despachar_agora, true);
});

Deno.test("degraded never attaches messaging", () => {
  const p = buildAlertPayload({
    barrierId: 7,
    externalCode: "EXT-7",
    tag: "TAG-007",
    criticality: "B",
    statusLabel: "Degradado",
    locationLabel: "L-01",
    transitionDate: "2026-10-14",
    ocorridoEm: "2026-10-14T12:00:00-03:00",
    statusId: 4,
    companyId: 1,
    recipients: [{ email: "a@example.com", phone: "5527999999999" }],
  })!;
  assertStrictEquals(p.canais.join(","), "email");
  assertStrictEquals(p.despachar_agora, false);
});

Deno.test("planned stop returns null", () => {
  const p = buildAlertPayload({
    barrierId: 7,
    externalCode: "EXT-7",
    tag: "TAG-007",
    criticality: "B",
    statusLabel: "Fora de Operacao",
    locationLabel: "L-01",
    transitionDate: "2026-10-14",
    ocorridoEm: "2026-10-14T12:00:00-03:00",
    statusId: 1,
    companyId: 1,
    recipients: [{ email: "a@example.com" }],
  });
  assertStrictEquals(p, null);
});
