// BarrierDetails - Details grid section for the barrier dialog.
// Why: isolates metadata/status/comments/plan rendering so the shell stays small.
import {
  BuildingIcon,
  ClockIcon,
  LayersIcon,
  ShieldCheckIcon,
  UserIcon,
} from "../ui/Icons.tsx";
import { CONF_COLORS, CRIT_COLORS, DISP_COLORS } from "../../lib/constants.ts";
import { daysSince, fmtDate, humanDuration } from "../../lib/utils.ts";
import { Div, FR, Lbl, Sec, Txt } from "./primitives.tsx";
import type { Barrier } from "../../lib/types.ts";
import { Badge } from "../ui/Badge.tsx";
// BarrierDetails shows metadata grid, inventory sheet columns, current
// status duration, comments, and action plan.
export function BarrierDetails({ b }: { b: Barrier }) {
  const dc = DISP_COLORS[b.availability],
    cc = CONF_COLORS[b.compliance],
    crc = CRIT_COLORS[b.criticality];
  // Sheet text or a muted fallback so empty admin-fillable columns read as
  // "not provided" instead of blank space.
  const na = (v: string): string => v || "Não informado";
  const missing = (v: string): boolean => !v;
  return (
    <div style={{ padding: "var(--d-dialog-body)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-details-gap)",
          marginBottom: "var(--d-block-gap)",
        }}
      >
        <FR Icon={BuildingIcon} label="Instalação" value={b.location} />
        <FR Icon={BuildingIcon} label="Tipologia" value={b.typology} />
        <FR Icon={LayersIcon} label="Categoria" value={b.category} full />
        <FR Icon={LayersIcon} label="Agrupamento" value={b.grouping} full />
        <FR
          Icon={ShieldCheckIcon}
          label="Criticidade"
          value={b.criticality}
          accent={crc?.solid}
        />
        <FR
          Icon={UserIcon}
          label="Dono"
          value={b.owner || "Não informado"}
          accent={!b.owner ? "var(--text-muted)" : undefined}
          italic={!b.owner}
        />
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
          full
          italic={missing(b.origin)}
        />
        <FR
          Icon={BuildingIcon}
          label="Código Fracttal"
          value={na(b.externalCode)}
          italic={missing(b.externalCode)}
        />
        <FR
          Icon={BuildingIcon}
          label="Nome da Instalação"
          value={na(b.locationName)}
          italic={missing(b.locationName)}
        />
        <FR
          Icon={LayersIcon}
          label="Local de Instalação"
          value={na(b.installLocal)}
          full
          italic={missing(b.installLocal)}
        />
        <FR
          Icon={LayersIcon}
          label="Tipologia Equipamento"
          value={na(b.equipTypology)}
          full
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
          marginBottom: "var(--d-block-gap)",
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
      <Sec>Status Atual</Sec>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-status-gap)",
          marginBottom: "var(--d-block-gap)",
        }}
      >
        <div>
          <Lbl>Disponibilidade</Lbl>
          <Badge label={b.availability} {...dc} />
        </div>
        <div>
          <Lbl>Conformidade</Lbl>
          <Badge label={b.compliance} {...cc} />
        </div>
        {b.statusSince && (
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              alignItems: "center",
              gap: "var(--d-opt-gap)",
            }}
          >
            <ClockIcon size={14} color="var(--text-muted)" strokeWidth={2} />
            <div>
              <div
                style={{
                  fontSize: "var(--d-lead)",
                  fontWeight: 700,
                  color: b.compliance === "Não Conforme"
                    ? "var(--alert-nc-text)"
                    : "var(--text-secondary)",
                }}
              >
                {b.compliance === "Não Conforme"
                  ? `${
                    humanDuration(daysSince(b.statusSince))
                  } sem contingenciamento`
                  : `${humanDuration(daysSince(b.statusSince))} neste status`}
              </div>
              <div
                style={{
                  fontSize: "var(--d-small)",
                  color: "var(--text-muted)",
                  marginTop: 1,
                }}
              >
                desde {fmtDate(b.statusSince)}
              </div>
            </div>
          </div>
        )}
      </div>
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
