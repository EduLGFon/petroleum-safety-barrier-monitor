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
// BarrierDetails shows metadata grid, current status duration, comments, and action plan.
export function BarrierDetails({ b }: { b: Barrier }) {
  const dc = DISP_COLORS[b.disponibilidade],
    cc = CONF_COLORS[b.conformidade],
    crc = CRIT_COLORS[b.criticidade];
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
        <FR Icon={BuildingIcon} label="Instalação" value={b.instalacao} />
        <FR Icon={BuildingIcon} label="Tipologia" value={b.tipologia} />
        <FR Icon={LayersIcon} label="Categoria" value={b.categoria} full />
        <FR Icon={LayersIcon} label="Agrupamento" value={b.agrupamento} full />
        <FR
          Icon={ShieldCheckIcon}
          label="Criticidade"
          value={b.criticidade}
          accent={crc?.solid}
        />
        <FR
          Icon={UserIcon}
          label="Dono"
          value={b.dono || "Não informado"}
          accent={!b.dono ? "var(--text-muted)" : undefined}
          italic={!b.dono}
        />
      </div>
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
          <Badge label={b.disponibilidade} {...dc} />
        </div>
        <div>
          <Lbl>Conformidade</Lbl>
          <Badge label={b.conformidade} {...cc} />
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
                  color: b.conformidade === "Não Conforme"
                    ? "var(--alert-nc-text)"
                    : "var(--text-secondary)",
                }}
              >
                {b.conformidade === "Não Conforme"
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
        value={b.comentarios || "Sem comentários registrados."}
        muted={!b.comentarios}
      />
      <Div />
      <Sec>Plano de Ação</Sec>
      <Txt
        value={b.planoAcao || "Nenhum plano definido."}
        muted={!b.planoAcao}
        accent={b.planoAcao ? "#f59e0b" : undefined}
      />
    </div>
  );
}
