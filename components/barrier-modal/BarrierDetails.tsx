// BarrierDetails - Details grid section for the barrier dialog.
// Why: isolates metadata/status/comments/plan rendering so the shell stays small.
import {
  BuildingIcon,
  ClockIcon,
  LayersIcon,
  ShieldCheckIcon,
  UserIcon,
} from "../ui/Icons.tsx";

import {
  daysSince,
  fmtDate,
  humanDuration,
  installationLabel,
} from "../../lib/utils.ts";

import { CONF_COLORS, CRIT_COLORS, DISP_COLORS } from "../../lib/constants.ts";

import { Div, FR, Sec, Txt } from "./primitives.tsx";

import type { Barrier } from "../../lib/types.ts";

import { Badge } from "../ui/Badge.tsx";

// BarrierDetails shows identification, inventory sheet columns, contingency,
// degradation, status duration, comments, and action plan. Fields pair two-up
// (instalação já combina código + nome) and the header badges collapse into a
// single status strip, so the dialog stays dense.
export function BarrierDetails({ b }: { b: Barrier }) {
  const dc = DISP_COLORS[b.availability],
    cc = CONF_COLORS[b.compliance],
    crc = CRIT_COLORS[b.criticality];
  // Unknown vocabularies fall back to a neutral pill instead of broken CSS.
  const neutral = {
    solid: "#94a3b8",
    bg: "transparent",
    border: "var(--border)",
  };
  // Sheet text or a muted fallback so empty admin-fillable columns read as
  // "not provided" instead of blank space.
  const na = (v: string): string => v || "Não informado";
  const missing = (v: string): boolean => !v;
  const durDays = b.statusSince ? daysSince(b.statusSince) : 0;
  const isNC = b.compliance === "Não Conforme";
  return (
    <div style={{ padding: "var(--d-dialog-body)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-details-gap)",
          marginBottom: "var(--d-stack-sm)",
        }}
      >
        <FR
          Icon={BuildingIcon}
          label="Instalação"
          value={installationLabel(b.location, b.locationName)}
          full
        />
        <FR Icon={BuildingIcon} label="Tipologia" value={b.typology} />
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--d-gap-xs)",
          padding: "var(--d-row-pad)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--d-row-radius)",
          marginBottom: "var(--d-block-gap)",
        }}
      >
        <Badge label={b.availability} {...(dc ?? neutral)} size="sm" />
        <Badge label={b.compliance} {...(cc ?? neutral)} size="sm" />
        <Badge label={b.criticality} {...(crc ?? neutral)} size="sm" />
        {b.statusSince && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--d-mini-gap)",
              marginLeft: "auto",
              fontSize: "var(--d-small)",
              fontWeight: 600,
              color: isNC ? "var(--alert-nc-text)" : "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            <ClockIcon
              size={12}
              color={isNC ? "var(--alert-nc-text)" : "var(--text-muted)"}
              strokeWidth={2}
            />
            {isNC
              ? `${humanDuration(durDays)} sem contingenciamento · desde ${
                fmtDate(b.statusSince)
              }`
              : `${humanDuration(durDays)} neste status · desde ${
                fmtDate(b.statusSince)
              }`}
          </span>
        )}
      </div>
      <Div />
      <Sec>Ficha do Inventário</Sec>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-details-gap)",
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
          label="Tipologia Equipamento"
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
      <Div />
      <Sec>Plano de Manutenção</Sec>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-details-gap)",
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
          label="Plano Cumprido?"
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
      <Div />
      <Sec>Contingência</Sec>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-details-gap)",
          marginBottom: "var(--d-details-gap)",
        }}
      >
        <FR
          Icon={ShieldCheckIcon}
          label="Há Contingência?"
          value={na(b.hasContingency)}
          italic={missing(b.hasContingency)}
        />
        <FR
          Icon={BuildingIcon}
          label="Código Evidência"
          value={na(b.evidenceCode)}
          italic={missing(b.evidenceCode)}
        />
      </div>
      <Txt
        value={b.contingencyDesc || "Sem descrição de contingência."}
        muted={!b.contingencyDesc}
      />
      <Div />
      <Sec>Degradação</Sec>
      <Txt
        value={b.degradationDesc || "Sem degradação registrada."}
        muted={!b.degradationDesc}
      />
      <Div />
      <Sec>Comentários</Sec>
      <Txt
        value={b.comments || "Sem comentários registrados."}
        muted={!b.comments}
      />
      <Div />
      <Sec>Comentários 2</Sec>
      <Txt
        value={b.extraComments || "Sem comentários complementares."}
        muted={!b.extraComments}
      />
      <Div />
      <Sec>Plano de Ação</Sec>
      <Txt
        value={b.actionPlan || "Nenhum plano definido."}
        muted={!b.actionPlan}
        accent={b.actionPlan ? "#f59e0b" : undefined}
      />
    </div>
  );
}
