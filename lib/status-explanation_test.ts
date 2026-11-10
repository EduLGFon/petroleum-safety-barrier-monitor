// Unit tests for lib/status-explanation.ts - deterministic cause parsing and
// read-time selection from persisted status history.
import {
  explainStatus,
  parseWorkNote,
  STATUS_RULES,
} from "./status-explanation.ts";
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";
import type { StatusHistoryEntry } from "./types.ts";

const EMERGENCY_NOTE =
  "Ordem de serviço em aberto. Classificação: Corretiva emergencial. Referência: OS-24018: Falha no intertravamento. Detalhe: Substituição do solenoide em andamento.\nCausa: desgaste; Severidade: alta. Sinal de contingência: GM-03 atuando em paralelo";

const PLANNED_NOTE =
  "Solicitação de serviço em aberto. Classificação: Corretiva planejada. Referência: SS-11842: Leitura intermitente. Detalhe: Inspeção agendada";

function entry(
  overrides: Partial<StatusHistoryEntry> = {},
): StatusHistoryEntry {
  return {
    date: "2026-05-01",
    status: "Indisponível",
    author: "Sincronização Fracttal",
    note: "",
    ...overrides,
  };
}

function explain(
  overrides: Partial<Parameters<typeof explainStatus>[0]> = {},
) {
  return explainStatus({
    availability: "Indisponível",
    statusSince: "2026-05-01",
    statusHistory: [],
    comments: "",
    hasContingency: "Não",
    contingencyDesc: "",
    ...overrides,
  });
}

Deno.test("explainStatus exposes the documented rule sentences", () => {
  assertStrictEquals(
    STATUS_RULES["Disponível"],
    "Livre de falhas ou defeitos.",
  );
  assertStrictEquals(
    STATUS_RULES["Fora de Operação"],
    "Equipamento protegido fora de operação, isolado positivamente do processo.",
  );
});

Deno.test("explainStatus reuses the base rule for contingency overlays", () => {
  const degraded = explain({
    availability: "Degradado Contingenciado",
    statusHistory: [],
  });
  assertStrictEquals(degraded.rule, STATUS_RULES["Degradado"]);

  const outage = explain({
    availability: "Indisponível Contingenciado",
    statusHistory: [],
  });
  assertStrictEquals(outage.rule, STATUS_RULES["Indisponível"]);
});

Deno.test("parseWorkNote reads an emergency WO with periods and newlines", () => {
  const parsed = parseWorkNote(EMERGENCY_NOTE);
  assert(parsed);
  assertStrictEquals(parsed.sourceType, "Ordem de serviço");
  assertStrictEquals(parsed.operationState, "em aberto");
  assertStrictEquals(parsed.classification, "Corretiva emergencial");
  assertStrictEquals(parsed.reference, "OS-24018: Falha no intertravamento");
  assertStrictEquals(
    parsed.detail,
    "Substituição do solenoide em andamento.\nCausa: desgaste; Severidade: alta",
  );
  assertStrictEquals(parsed.contingency, "GM-03 atuando em paralelo");
});

Deno.test("explainStatus renders an emergency WO cause", () => {
  const result = explain({ statusHistory: [entry({ note: EMERGENCY_NOTE })] });
  assertStrictEquals(result.cause.kind, "work-order");
  assertStrictEquals(result.cause.sourceType, "Ordem de serviço");
  assertStrictEquals(
    result.cause.reference,
    "OS-24018: Falha no intertravamento",
  );
  assertStrictEquals(result.cause.contingency, "GM-03 atuando em paralelo");
  assertStrictEquals(result.historyEntry?.note, EMERGENCY_NOTE);
});

Deno.test("explainStatus renders a work request cause", () => {
  const result = explain({
    availability: "Degradado",
    statusHistory: [entry({ status: "Degradado", note: PLANNED_NOTE })],
  });
  assertStrictEquals(result.cause.kind, "work-request");
  assertStrictEquals(result.cause.sourceType, "Solicitação de serviço");
  assertStrictEquals(result.cause.reference, "SS-11842: Leitura intermitente");
});

Deno.test("explainStatus detects planned work without urgency", () => {
  const note =
    "Há corretiva planejada aberta sem marcador de urgência; sem gatilho urgente o status permanece Disponível";
  const result = explain({
    availability: "Disponível",
    statusHistory: [entry({ status: "Disponível", note })],
  });
  assertStrictEquals(result.cause.kind, "planned-without-urgency");
});

Deno.test("explainStatus detects out-of-service with a date", () => {
  const note = "Fracttal informa fora de operação desde 2026-02-03";
  const result = explain({
    availability: "Fora de Operação",
    statusHistory: [entry({ status: "Fora de Operação", note })],
  });
  assertStrictEquals(result.cause.kind, "out-of-service");
  assertStrictEquals(result.cause.date, "2026-05-01");
  assertStrictEquals(result.rule, STATUS_RULES["Fora de Operação"]);
});

Deno.test("explainStatus detects a bare unavailable asset", () => {
  const result = explain({
    statusHistory: [
      entry({ note: "Fracttal indica o ativo como indisponível" }),
    ],
  });
  assertStrictEquals(result.cause.kind, "asset-unavailable");
});

Deno.test("explainStatus detects an available asset note", () => {
  const note =
    "O ativo consta como disponível e não houve sinal de corretiva aberta ou equipamento parado nos dados consultados neste ciclo";
  const result = explain({
    availability: "Disponível",
    statusHistory: [entry({ status: "Disponível", note })],
  });
  assertStrictEquals(result.cause.kind, "available");
});

Deno.test("explainStatus detects an import note", () => {
  const result = explain({
    statusHistory: [entry({ note: "Importado do Fracttal" })],
  });
  assertStrictEquals(result.cause.kind, "import");
});

Deno.test("explainStatus detects manual edits and custom notes", () => {
  const explicit = explain({
    statusHistory: [entry({ note: "Edição de barreira", author: "Maria" })],
  });
  assertStrictEquals(explicit.cause.kind, "manual");
  assertStrictEquals(explicit.cause.rawNote, "Edição de barreira");

  const custom = explain({
    statusHistory: [entry({ note: "Ajuste após inspeção", author: "Maria" })],
  });
  assertStrictEquals(custom.cause.kind, "manual");
});

Deno.test("explainStatus reads a contingency suffix outside work notes", () => {
  const note =
    "Fracttal informa fora de operação desde 2026-02-03. Sinal de contingência: GM-04";
  const result = explain({
    availability: "Fora de Operação",
    statusHistory: [entry({ status: "Fora de Operação", note })],
  });
  assertStrictEquals(result.cause.kind, "out-of-service");
  assertStrictEquals(result.cause.contingency, "GM-04");
});

Deno.test("explainStatus reads the colon-less contingency suffix", () => {
  const note =
    "Ordem de serviço em aberto. Classificação: Corretiva emergencial. Referência: OS-1: Falha. Detalhe: Reparo em andamento. Sinal de contingência identificado nos dados Fracttal";
  const parsed = parseWorkNote(note);
  assert(parsed);
  assertStrictEquals(parsed.detail, "Reparo em andamento");
  assertStrictEquals(parsed.contingency, "identificado nos dados Fracttal");

  const result = explain({ statusHistory: [entry({ note })] });
  assertStrictEquals(
    result.cause.contingency,
    "identificado nos dados Fracttal",
  );
});

Deno.test("explainStatus keeps a Detalhe mention outside the trailing suffix", () => {
  const note =
    "Ordem de serviço em aberto. Classificação: Corretiva emergencial. Referência: OS-1: Falha. Detalhe: Registro inicial. Sinal de contingência avaliado pela equipe sem confirmação. Acompanhamento segue";
  const parsed = parseWorkNote(note);
  assert(parsed);
  assertStrictEquals(
    parsed.detail,
    "Registro inicial. Sinal de contingência avaliado pela equipe sem confirmação. Acompanhamento segue",
  );
  assertStrictEquals(parsed.contingency, "");

  const result = explain({ statusHistory: [entry({ note })] });
  assertStrictEquals(result.cause.kind, "work-order");
  assertStrictEquals(
    result.cause.detail,
    "Registro inicial. Sinal de contingência avaliado pela equipe sem confirmação. Acompanhamento segue",
  );
  assertStrictEquals(result.cause.contingency, undefined);
});

Deno.test("explainStatus falls back to comments when history is blank", () => {
  const result = explain({
    comments: "OS-99: falha na vedação",
    statusHistory: [],
  });
  assertStrictEquals(result.cause.kind, "unknown");
  assertStrictEquals(result.cause.reference, "OS-99: falha na vedação");
  assertStrictEquals(result.historyEntry, null);
});

Deno.test("explainStatus matches the base status behind the contingency overlay", () => {
  const degraded = explain({
    availability: "Degradado Contingenciado",
    hasContingency: "Sim",
    contingencyDesc: "GM-01 em paralelo",
    statusHistory: [
      entry({ date: "2026-01-01", status: "Disponível", note: "" }),
      entry({ date: "2026-02-01", status: "Degradado", note: PLANNED_NOTE }),
    ],
  });
  assertStrictEquals(degraded.cause.kind, "work-request");
  assertStrictEquals(degraded.historyEntry?.status, "Degradado");
  assertStrictEquals(degraded.cause.contingency, "GM-01 em paralelo");

  const outage = explain({
    availability: "Indisponível Contingenciado",
    hasContingency: "Sim",
    statusHistory: [
      entry({
        date: "2026-03-01",
        status: "Indisponível",
        note: EMERGENCY_NOTE,
      }),
    ],
  });
  assertStrictEquals(outage.cause.kind, "work-order");
  assertStrictEquals(outage.historyEntry?.status, "Indisponível");
});

Deno.test("explainStatus handles missing history without failing", () => {
  const result = explain({
    availability: "Fora de Operação",
    statusSince: "2026-04-01",
    statusHistory: [],
  });
  assertStrictEquals(result.cause.kind, "unknown");
  assertStrictEquals(result.historyEntry, null);
  assertStrictEquals(result.since, "2026-04-01");
});

Deno.test("explainStatus keeps a deterministic rule for unknown statuses", () => {
  const result = explain({ availability: "Em Inspeção", statusHistory: [] });
  assertStrictEquals(result.rule, "Sem regra documentada para este status.");
  assertStrictEquals(result.cause.kind, "unknown");
});
