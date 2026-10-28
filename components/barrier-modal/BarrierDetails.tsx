// BarrierDetails - Details grid section for the barrier dialog.
import {
  BuildingIcon,
  LayersIcon,
  ShieldCheckIcon,
  UserIcon,
} from "../ui/Icons.tsx";

import { fmtDate, installationLabel } from "../../lib/utils.ts";

import { SCOPE_COLORS } from "../../lib/constants.ts";

import type { Barrier } from "../../lib/types.ts";

import { FR, Txt } from "./primitives.tsx";

export function BarrierDetails({ b }: { b: Barrier }) {
  const deleted = (b.deletedAt ?? null) !== null;
  const inactive = !deleted && (b.isActive ?? true) === false;
  const situation = deleted ? "Excluída" : inactive ? "Desativada" : "Ativa";
  const sc = SCOPE_COLORS[situation];
  const situationValue = deleted && b.deletedAt
    ? `Excluída em ${fmtDate(b.deletedAt)}`
    : situation;
  const na = (v: string): string => v || "Não informado";
  const missing = (v: string): boolean => !v;
  const comments = b.comments.trim();
  const showComments = hasDistinctComments(comments, b.degradationDesc);
  const actionPlanText = b.actionPlan || "Nenhum plano definido.";
  const actionPlanMuted = !b.actionPlan;
  const actionPlanAccent = b.actionPlan ? "#f59e0b" : undefined;

  return (
    <div style={{ padding: "var(--d-dialog-body)" }}>
      <details open style={{ marginBottom: "var(--d-block-gap)" }}>
        <summary style={summaryStyle}>Identificação</summary>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--d-details-gap)",
            marginTop: "var(--d-stack-sm)",
          }}
        >
          <FR
            Icon={BuildingIcon}
            label="Instalação"
            value={installationLabel(b.location, b.locationName)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Situação"
            value={situationValue}
            accent={sc?.solid}
          />
          <FR
            Icon={BuildingIcon}
            label="Tipologia da Barreira"
            value={b.typology}
          />
          <FR
            Icon={UserIcon}
            label="Dono"
            value={b.owner || "Não informado"}
            accent={!b.owner ? "var(--text-muted)" : undefined}
            italic={!b.owner}
          />
          <FR Icon={LayersIcon} label="Categoria" value={b.category} />
          <FR Icon={LayersIcon} label="Agrupamento" value={b.grouping} />
        </div>
      </details>

      <details style={{ marginBottom: "var(--d-block-gap)" }}>
        <summary style={summaryStyle}>Ficha do Inventário</summary>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--d-details-gap)",
            marginTop: "var(--d-stack-sm)",
            marginBottom: "var(--d-block-gap)",
          }}
        >
          <FR
            Icon={BuildingIcon}
            label="Origem"
            value={na(b.origin)}
            italic={missing(b.origin)}
          />
          <FR
            Icon={BuildingIcon}
            label="Código Fracttal"
            value={na(b.externalCode)}
            italic={missing(b.externalCode)}
          />
          <FR
            Icon={LayersIcon}
            label="Local de Instalação"
            value={na(b.installLocal)}
            italic={missing(b.installLocal)}
          />
          <FR
            Icon={LayersIcon}
            label="Tipologia do Equipamento"
            value={na(b.equipTypology)}
            italic={missing(b.equipTypology)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Elemento em Campo?"
            value={na(b.fieldInstalled)}
            italic={missing(b.fieldInstalled)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Elemento Operacional?"
            value={na(b.fieldOperational)}
            italic={missing(b.fieldOperational)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Status Operacional"
            value={na(b.opStatus)}
            italic={missing(b.opStatus)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Status Manutenção"
            value={na(b.maintStatus)}
            italic={missing(b.maintStatus)}
          />
        </div>
      </details>

      <details open style={{ marginBottom: "var(--d-block-gap)" }}>
        <summary style={summaryStyle}>Plano de Manutenção</summary>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--d-details-gap)",
            marginTop: "var(--d-stack-sm)",
            marginBottom: "var(--d-block-gap)",
          }}
        >
          <FR
            Icon={ShieldCheckIcon}
            label="Possui Plano?"
            value={na(b.hasMaintPlan)}
            italic={missing(b.hasMaintPlan)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Plano Preventivo Cumprido?"
            value={na(b.planFollowed)}
            italic={missing(b.planFollowed)}
          />
          <FR
            Icon={ShieldCheckIcon}
            label="Sem Falha?"
            value={na(b.failureFree)}
            italic={missing(b.failureFree)}
          />
        </div>
      </details>

      <details open style={{ marginBottom: "var(--d-block-gap)" }}>
        <summary style={summaryStyle}>Degradação</summary>
        <div style={{ marginTop: "var(--d-stack-sm)" }}>
          <Txt
            value={b.degradationDesc || "Sem degradação registrada."}
            muted={!b.degradationDesc}
          />
        </div>
      </details>

      {showComments && (
        <details open style={{ marginBottom: "var(--d-block-gap)" }}>
          <summary style={summaryStyle}>Comentários</summary>
          <div style={{ marginTop: "var(--d-stack-sm)" }}>
            <Txt value={comments} />
          </div>
        </details>
      )}

      <details open style={{ marginBottom: "var(--d-block-gap)" }}>
        <summary style={summaryStyle}>Comentários complementares</summary>
        <div style={{ marginTop: "var(--d-stack-sm)" }}>
          <Txt
            value={b.extraComments || "Sem comentários complementares."}
            muted={!b.extraComments}
          />
        </div>
      </details>

      <details open style={{ marginBottom: "var(--d-block-gap)" }}>
        <summary style={summaryStyle}>Plano de Ação</summary>
        <div style={{ marginTop: "var(--d-stack-sm)" }}>
          <Txt
            value={actionPlanText}
            muted={actionPlanMuted}
            accent={actionPlanAccent}
          />
        </div>
      </details>
    </div>
  );
}

const summaryStyle = {
  cursor: "pointer",
  fontSize: "var(--d-caption)",
  fontWeight: 800,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  listStyle: "none",
  padding: "var(--d-stack-sm) 0",
};

export function hasDistinctComments(
  comments: string,
  degradation: string,
): boolean {
  const value = comments.trim();
  return value !== "" && value !== degradation.trim();
}
