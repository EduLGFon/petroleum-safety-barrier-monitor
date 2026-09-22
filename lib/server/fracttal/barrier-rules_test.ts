// Unit tests for the shared Fracttal barrier rules (Phase 0). Both the dump
// import and the live sync mapper call these, so this suite pins the single
// converged behavior: keyword scope, station parse, typology, work-event
// classification, and availability precedence.
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_DEGRADED,
  AVAILABILITY_OUT_OF_SERVICE,
  AVAILABILITY_UNAVAILABLE,
  CATEGORY_FALLBACK,
  categoryFor,
  classifyCorrective,
  classifyRequest,
  CRITICALITY_DEFAULT,
  earliestDate,
  exclusionReason,
  foldText,
  isBarrierCandidate,
  isClosedRequestStatus,
  isoDate,
  locationTypeOf,
  mergeEvent,
  OPEN_WORK_ORDER_STATUSES,
  resolveAvailability,
  stationCodeOf,
  stationNameOf,
  tagFor,
  toDisplayName,
  TYPOLOGY_COMPRESSION,
  TYPOLOGY_MEASUREMENT,
  TYPOLOGY_OPERATIONS_BASE,
  TYPOLOGY_PIPELINE,
  TYPOLOGY_PLANT,
  TYPOLOGY_STATION,
  typologyIdOf,
} from "./barrier-rules.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("foldText lowercases and strips accents", () => {
  assertStrictEquals(foldText("Válvula de GÁS"), "valvula de gas");
  assertStrictEquals(foldText(null), "");
});

Deno.test("isBarrierCandidate matches taxonomy labels only", () => {
  assertStrictEquals(isBarrierCandidate("Válvula"), true);
  assertStrictEquals(isBarrierCandidate("Detector de Gás"), true);
  assertStrictEquals(isBarrierCandidate("Equipamento - Emergência"), true);
  assertStrictEquals(isBarrierCandidate("Bomba"), false);
  assertStrictEquals(isBarrierCandidate("Base"), false);
  assertStrictEquals(isBarrierCandidate(""), false);
  assertStrictEquals(isBarrierCandidate(null), false);
});

Deno.test("stationCodeOf takes the trailing L2 code token", () => {
  assertStrictEquals(
    stationCodeOf("// Seacrest Petróleo/ Área Norte/ SÃO MATEUS - SM/ POÇOS"),
    "SM",
  );
  // Segments whose tail is not a plain [A-Z0-9-] token pass through whole
  // (this is how "CJ DUTOS TERRESTRES - ÁREA SUL" becomes a station code).
  assertStrictEquals(
    stationCodeOf(
      "// Seacrest Petróleo/ Área/ CJ DUTOS TERRESTRES - ÁREA SUL/ X",
    ),
    "CJ DUTOS TERRESTRES - ÁREA SUL",
  );
  assertStrictEquals(stationCodeOf("lone segment"), "LONE SEGMENT");
  assertStrictEquals(stationCodeOf(null), "");
  // The São Mateus base carries a state suffix, not a station code.
  assertStrictEquals(
    stationCodeOf(
      "// Seacrest Petróleo/ Área Norte/ Base Seacrest - São Mateus-ES/ X",
    ),
    "SM",
  );
});

Deno.test("stationNameOf derives the display name from the L2 prefix", () => {
  assertStrictEquals(
    stationNameOf("// Seacrest Petróleo/ Área Norte/ FAZENDA ALEGRE - FAL/ X"),
    "Fazenda Alegre",
  );
  assertStrictEquals(
    stationNameOf("// Seacrest Petróleo/ Área Norte/ SÃO MATEUS - SM/ X"),
    "São Mateus",
  );
  assertStrictEquals(
    stationNameOf("// Seacrest Petróleo/ Área/ CÓRREGO DOURADO - CD/ X"),
    "Córrego Dourado",
  );
  // Override segments borrow the canonical name instead of setting one.
  assertStrictEquals(
    stationNameOf(
      "// Seacrest Petróleo/ Área Norte/ Base Seacrest - São Mateus-ES/ X",
    ),
    null,
  );
  // Segments without a dash-code tail display as their own code.
  assertStrictEquals(
    stationNameOf("// Seacrest/ Área/ CJ DUTOS TERRESTRES - ÁREA SUL/ X"),
    null,
  );
  assertStrictEquals(stationNameOf("lone segment"), null);
  assertStrictEquals(stationNameOf(null), null);
});

Deno.test("toDisplayName keeps pt-BR particles lowercase", () => {
  assertStrictEquals(toDisplayName("LAGOA SURUACA"), "Lagoa Suruaca");
  assertStrictEquals(toDisplayName("RIO SÃO MATEUS"), "Rio São Mateus");
  assertStrictEquals(toDisplayName("CÓRREGO DAS PEDRAS"), "Córrego das Pedras");
});

Deno.test("typologyIdOf follows keyword precedence", () => {
  assertStrictEquals(typologyIdOf("COMPRESSOR A"), TYPOLOGY_COMPRESSION);
  assertStrictEquals(typologyIdOf("MEDIÇÃO DE FLUIDOS"), TYPOLOGY_MEASUREMENT);
  assertStrictEquals(typologyIdOf("DUTO DE TRANSFERÊNCIA"), TYPOLOGY_PIPELINE);
  assertStrictEquals(typologyIdOf("PLANTA DE PROCESSO"), TYPOLOGY_PLANT);
  assertStrictEquals(typologyIdOf("ESTAÇÃO COLETORA"), TYPOLOGY_STATION);
  assertStrictEquals(typologyIdOf("POÇO QUALQUER"), TYPOLOGY_OPERATIONS_BASE);
  assertStrictEquals(typologyIdOf(null), TYPOLOGY_OPERATIONS_BASE);
});

Deno.test("locationTypeOf classifies station codes", () => {
  assertStrictEquals(
    locationTypeOf("CJ DUTOS TERRESTRES - ÁREA SUL"),
    "Duto de Transferência",
  );
  assertStrictEquals(
    locationTypeOf("CJ UNIDADE DE TESTE MÓVEL"),
    "Unidade Móvel",
  );
  assertStrictEquals(locationTypeOf("FAL"), "Instalação");
});

Deno.test("tagFor prefers description over code", () => {
  assertStrictEquals(tagFor("PSV válvula", "123"), "PSV válvula");
  assertStrictEquals(tagFor("  ", "123"), "123");
  assertStrictEquals(tagFor(null, "123"), "123");
});

Deno.test("categoryFor trims and falls back when empty", () => {
  assertStrictEquals(categoryFor("  Válvula "), "Válvula");
  assertStrictEquals(categoryFor(""), CATEGORY_FALLBACK);
  assertStrictEquals(categoryFor(null), CATEGORY_FALLBACK);
});

Deno.test("classifyCorrective sorts work orders into slots", () => {
  assertStrictEquals(
    classifyCorrective("CORR - Corretiva Planejada", null),
    "planned",
  );
  assertStrictEquals(classifyCorrective(null, "Falha Potencial"), "planned");
  assertStrictEquals(
    classifyCorrective("CORR - Corretiva Emergencial", null),
    "urgent",
  );
  assertStrictEquals(classifyCorrective(null, "Falha Funcional"), "urgent");
  assertStrictEquals(classifyCorrective("PREV - Sistemática", null), null);
  assertStrictEquals(classifyCorrective(null, null), null);
});

Deno.test("classifyRequest needs a corrective or failure type", () => {
  assertStrictEquals(classifyRequest("Corretiva Planejada"), "planned");
  assertStrictEquals(classifyRequest("Corretiva Emergencial"), "urgent");
  assertStrictEquals(classifyRequest("PREV - Sistemática"), null);
  // Abbreviated live labels ("CORR - Planejada") carry no corrective stem
  // and stay unmatched: pre-existing import behavior, pinned until Phase 1
  // verifies the live request types.
  assertStrictEquals(classifyRequest("CORR - Planejada"), null);
  assertStrictEquals(classifyRequest(null), null);
});

Deno.test("isClosedRequestStatus matches the terminal set", () => {
  assertStrictEquals(isClosedRequestStatus(4), true);
  assertStrictEquals(isClosedRequestStatus(5), true);
  assertStrictEquals(isClosedRequestStatus(6), true);
  // 11 removed from pending tasks (reference: Query status changes from
  // requests) is terminal; 9 (WO cancelled) stays open on purpose.
  assertStrictEquals(isClosedRequestStatus(11), true);
  assertStrictEquals(isClosedRequestStatus(12), true);
  assertStrictEquals(isClosedRequestStatus(9), false);
  assertStrictEquals(isClosedRequestStatus(1), false);
  assertStrictEquals(isClosedRequestStatus(null), false);
});

Deno.test("OPEN_WORK_ORDER_STATUSES covers in-process and review", () => {
  assertStrictEquals(OPEN_WORK_ORDER_STATUSES.join(","), "1,2");
});

Deno.test("mergeEvent keeps the earliest date and first source", () => {
  const merged = mergeEvent(
    { date: "2026-09-11", source: "OS - 1: first" },
    { date: "2026-09-10", source: "OS - 2: second" },
  );
  assertStrictEquals(merged.date, "2026-09-11");
  assertStrictEquals(merged.source, "OS - 1: first");
  assertStrictEquals(
    mergeEvent(null, { date: null, source: "x" }).source,
    "x",
  );
});

Deno.test("isoDate and earliestDate handle edge input", () => {
  assertStrictEquals(isoDate("2026-09-11T10:00:00"), "2026-09-11");
  assertStrictEquals(isoDate("nope"), null);
  assertStrictEquals(isoDate(null), null);
  assertStrictEquals(earliestDate("2026-09-11", "2026-09-10"), "2026-09-10");
  assertStrictEquals(earliestDate(null, "2026-09-10"), "2026-09-10");
});

const idle = {
  urgent: null,
  planned: null,
  stopAssets: false,
  outOfServiceDate: null,
  assetAvailable: true as boolean | null,
};

Deno.test("resolveAvailability follows urgent, planned, stopped, flag, open", () => {
  const urgent = resolveAvailability(
    { ...idle, urgent: { date: "2026-09-11", source: "OS - 1" } },
    "2026-09-15",
  );
  assertStrictEquals(urgent.availabilityId, AVAILABILITY_UNAVAILABLE);
  assertStrictEquals(urgent.statusSince, "2026-09-11");
  assertStrictEquals(urgent.note, "OS - 1");
  const planned = resolveAvailability(
    {
      ...idle,
      urgent: { date: null, source: "u" },
      planned: { date: null, source: "p" },
    },
    "2026-09-15",
  );
  assertStrictEquals(planned.availabilityId, AVAILABILITY_UNAVAILABLE);
  const degraded = resolveAvailability(
    { ...idle, planned: { date: "2026-09-12", source: "p" } },
    "2026-09-15",
  );
  assertStrictEquals(degraded.availabilityId, AVAILABILITY_DEGRADED);
  assertStrictEquals(degraded.statusSince, "2026-09-12");
  const stopped = resolveAvailability(
    { ...idle, stopAssets: true },
    "2026-09-15",
  );
  assertStrictEquals(stopped.availabilityId, AVAILABILITY_OUT_OF_SERVICE);
  assertStrictEquals(stopped.statusSince, "2026-09-15");
  const dated = resolveAvailability(
    { ...idle, outOfServiceDate: "2026-08-01" },
    "2026-09-15",
  );
  assertStrictEquals(dated.statusSince, "2026-08-01");
  assertStrictEquals(dated.note.length > 0, true);
  const flagged = resolveAvailability(
    { ...idle, assetAvailable: false },
    "2026-09-15",
  );
  assertStrictEquals(flagged.availabilityId, AVAILABILITY_UNAVAILABLE);
  const open = resolveAvailability(idle, "2026-09-15");
  assertStrictEquals(open.availabilityId, AVAILABILITY_AVAILABLE);
  assertStrictEquals(open.statusSince, "2026-09-15");
  assertStrictEquals(open.note, "");
});

Deno.test("exclusion list documents the known mislabeled row", () => {
  assertStrictEquals(exclusionReason("1013971") !== null, true);
  assertStrictEquals(exclusionReason("1013959"), null);
  assertStrictEquals(CRITICALITY_DEFAULT, 0);
});
