// BarrierStatusExplanation - opens the details modal with the cause of the
// current availability. Why: the sync already persists the decisive WO/WR in
// the status-history note, so a read-only card explains the status without
// duplicating the whole timeline or adding schema/API fields.
// See DECISIONS.md#D36.

import {
  explainStatus,
  type StatusCause,
} from "../../lib/status-explanation.ts";

import { daysSince, fmtDate, humanDuration } from "../../lib/utils.ts";

import { DISP_COLORS } from "../../lib/constants.ts";

import { ChevronRightIcon } from "../ui/Icons.tsx";

import type { Barrier } from "../../lib/types.ts";

import { Badge } from "../ui/Badge.tsx";

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function causeSentence(cause: StatusCause, statusSince: string): string {
  switch (cause.kind) {
    case "stopped-asset":
      return "A disponibilidade foi alterada porque uma ordem de serviço indica equipamento parado.";
    case "out-of-service":
      return `O ativo está fora de operação desde ${
        fmtDate(cause.date || statusSince)
      }.`;
    case "asset-unavailable":
      return "O ativo foi indicado como indisponível nos dados do Fracttal.";
    case "planned-without-urgency":
      return "Há corretiva planejada aberta sem marcador de urgência, então o status permanece Disponível.";
    case "available":
      return "O ativo consta como disponível e não há sinal de corretiva aberta ou equipamento parado neste ciclo.";
    case "import":
      return "O status foi importado do Fracttal sem um evento de ordem de serviço associado.";
    case "manual":
      return "O status foi alterado manualmente por um usuário.";
    default:
      return "Não foi possível identificar a causa a partir do histórico persistido.";
  }
}

export function BarrierStatusExplanation({ b }: { b: Barrier }) {
  const explanation = explainStatus(b);
  const cause = explanation.cause;
  const isWork = cause.kind === "work-order" ||
    cause.kind === "work-request";
  const colors = DISP_COLORS[b.availability] ?? {
    solid: "#94a3b8",
    bg: "transparent",
    border: "var(--border)",
  };
  const rawNote = cause.rawNote?.trim() ?? "";
  const showRaw = rawNote !== "" && rawNote !== "Edição de barreira" &&
    (cause.kind === "manual" || cause.kind === "unknown");
  const participants = cause.participants ?? [];

  return (
    <details open style={{ marginBottom: "var(--d-stack-sm)" }}>
      <summary style={summaryStyle}>
        <span>Causa da Disponibilidade</span>
        <span className="collapsible-chevron">
          <ChevronRightIcon
            size={12}
            color="var(--text-muted)"
            strokeWidth={2}
          />
        </span>
      </summary>
      <div style={{ marginTop: "var(--d-stack-sm)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--d-mini-gap)",
            flexWrap: "wrap",
            marginBottom: "var(--d-field-gap)",
          }}
        >
          <Badge label={b.availability} {...colors} size="sm" />
          {b.statusSince && (
            <>
              <span style={metaStyle}>desde {fmtDate(b.statusSince)}</span>
              <span style={metaStyle}>
                há {humanDuration(daysSince(b.statusSince))}
              </span>
            </>
          )}
        </div>
        <p style={ruleStyle}>{explanation.rule}</p>

        <div style={cardStyle}>
          {isWork
            ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--d-mini-gap)",
                    flexWrap: "wrap",
                    marginBottom: "var(--d-field-gap)",
                  }}
                >
                  <Badge
                    label={cause.sourceType ?? ""}
                    solid="#38bdf8"
                    bg="rgba(56,189,248,.1)"
                    border="rgba(56,189,248,.28)"
                    size="xs"
                    dot={false}
                  />
                  {cause.operationState && (
                    <span style={metaStyle}>
                      {capitalize(cause.operationState)}
                    </span>
                  )}
                  {cause.date && (
                    <span style={metaStyle}>Data: {fmtDate(cause.date)}</span>
                  )}
                </div>
                {cause.reference && (
                  <div style={referenceStyle}>{cause.reference}</div>
                )}
                {cause.classification && (
                  <div style={metaStyle}>
                    Classificação: {cause.classification}
                  </div>
                )}
                {cause.detail && <p style={detailStyle}>{cause.detail}</p>}
                {cause.contingency && (
                  <div style={metaStyle}>
                    Sinal de contingência: {cause.contingency}
                  </div>
                )}
                <div style={{ ...metaStyle, marginTop: "var(--d-field-gap)" }}>
                  Registrado por: {cause.author || "Não informado"}
                </div>
                {participants.length > 0 && (
                  <div style={{ ...metaStyle, marginTop: "var(--d-gap-2xs)" }}>
                    {participants.map((person) =>
                      `${person.role}: ${person.name}`
                    ).join(" · ")}
                  </div>
                )}
              </>
            )
            : (
              <>
                <p style={causeStyle}>
                  {causeSentence(cause, b.statusSince)}
                </p>
                {cause.reference && (
                  <div
                    style={{ ...metaStyle, marginTop: "var(--d-field-gap)" }}
                  >
                    Referência: {cause.reference}
                  </div>
                )}
                {cause.contingency && (
                  <div style={{ ...metaStyle, marginTop: "var(--d-gap-2xs)" }}>
                    Sinal de contingência: {cause.contingency}
                  </div>
                )}
                {showRaw && <p style={detailStyle}>{rawNote}</p>}
              </>
            )}
        </div>
      </div>
    </details>
  );
}

const summaryStyle = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "var(--d-mini-gap)",
  fontSize: "var(--d-caption)",
  fontWeight: 800,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  listStyle: "none",
  padding: "var(--d-stack-sm) 0",
};

const metaStyle = {
  margin: 0,
  fontSize: "var(--d-small)",
  color: "var(--text-muted)",
  lineHeight: 1.5,
};

const ruleStyle = {
  margin: "0 0 var(--d-field-gap)",
  fontSize: "var(--d-body)",
  color: "var(--text-muted)",
  lineHeight: 1.6,
};

const cardStyle = {
  padding: "var(--d-row-pad)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "var(--d-row-radius)",
};

const causeStyle = {
  margin: 0,
  fontSize: "var(--d-body)",
  color: "var(--text-secondary)",
  lineHeight: 1.65,
};

const referenceStyle = {
  marginBottom: "var(--d-gap-2xs)",
  fontSize: "var(--d-body)",
  color: "var(--text-secondary)",
  fontWeight: 700,
  lineHeight: 1.5,
};

const detailStyle = {
  margin: "var(--d-gap-2xs) 0 0",
  fontSize: "var(--d-small)",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap" as const,
};
