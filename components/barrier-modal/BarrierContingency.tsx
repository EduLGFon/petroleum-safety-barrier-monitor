// BarrierContingency - Contingency section for the barrier dialog.
import { BuildingIcon, ShieldCheckIcon } from "../ui/Icons.tsx";

import { FR, Sec, Txt } from "./primitives.tsx";

import type { Barrier } from "../../lib/types.ts";

export function BarrierContingency({ b }: { b: Barrier }) {
  const na = (v: string): string => v || "Não informado";
  const missing = (v: string): boolean => !v;
  return (
    <div style={{ padding: "var(--d-dialog-body)" }}>
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
    </div>
  );
}
