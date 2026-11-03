// Barrier editor sheet fields - inventory, maintenance, contingency and
// degradation sections. Split out of BarrierEditor so the form container
// stays focused on loading/saving and core identity fields.
import type { ComponentChildren, JSX } from "preact";

import type { FieldKey } from "../lib/field-options.ts";

export interface SheetValues {
  origin: string;
  installLocal: string;
  equipTypology: string;
  fieldInstalled: string;
  fieldOperational: string;
  opStatus: string;
  maintStatus: string;
  hasMaintPlan: string;
  planFollowed: string;
  failureFree: string;
  hasContingency: string;
  contingencyDesc: string;
  evidenceCode: string;
  degradationDesc: string;
  comments: string;
  extraComments: string;
  actionPlan: string;
}

export type SheetKey = keyof SheetValues;

interface Props {
  values: SheetValues;
  setValue: (key: SheetKey, value: string) => void;
  inputStyle: JSX.CSSProperties;
  fieldHead: (
    label: string,
    fkey?: string,
    source?: { field: string; hint: string },
  ) => ComponentChildren;
  renderSelectOrCombo: (
    label: string,
    fieldKey: FieldKey,
    value: string,
    setValue: (v: string) => void,
  ) => ComponentChildren;
  busy: boolean;
  onCancel: () => void;
}

const sectionTitle = {
  fontSize: "var(--d-caption)",
  fontWeight: 800,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
};

const divider = {
  border: "none",
  borderTop: "1px solid var(--border)",
  margin: 0,
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--d-details-gap)",
};

type SheetFieldKey = Extract<FieldKey, keyof SheetValues>;

const INVENTORY: Array<[string, SheetFieldKey]> = [
  ["Origem", "origin"],
  ["Local de Instalação", "installLocal"],
  ["Tipologia Equipamento", "equipTypology"],
  ["Elemento em Campo?", "fieldInstalled"],
  ["Elemento Operacional?", "fieldOperational"],
  ["Status Operacional", "opStatus"],
  ["Status Manutenção", "maintStatus"],
];

const MAINTENANCE: Array<[string, SheetFieldKey]> = [
  ["Possui Plano?", "hasMaintPlan"],
  ["Plano Cumprido?", "planFollowed"],
  ["Sem Falha?", "failureFree"],
];

export function BarrierEditorSheetFields(
  {
    values,
    setValue,
    inputStyle,
    fieldHead,
    renderSelectOrCombo,
    busy,
    onCancel,
  }: Props,
) {
  const text = (
    label: string,
    key: SheetKey,
    placeholder?: string,
    rows = 2,
  ) => (
    <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
      {fieldHead(label, key)}
      <textarea
        rows={rows}
        placeholder={placeholder}
        value={values[key]}
        onInput={(e) => setValue(key, e.currentTarget.value)}
        style={{ ...inputStyle, resize: "vertical" }}
      />
    </div>
  );

  return (
    <>
      <div>
        <div style={{ ...sectionTitle, marginBottom: "var(--d-stack-sm)" }}>
          Ficha do Inventário
        </div>
        <div style={grid2}>
          {INVENTORY.map(([label, key]) => (
            <div key={key}>
              {renderSelectOrCombo(
                label,
                key,
                values[key],
                (v) => setValue(key, v),
              )}
            </div>
          ))}
        </div>
      </div>

      <hr style={divider} />

      <div>
        <div style={{ ...sectionTitle, marginBottom: "var(--d-stack-sm)" }}>
          Plano de Manutenção
        </div>
        <div style={grid2}>
          {MAINTENANCE.map(([label, key]) => (
            <div key={key}>
              {renderSelectOrCombo(
                label,
                key,
                values[key],
                (v) => setValue(key, v),
              )}
            </div>
          ))}
        </div>
      </div>

      <hr style={divider} />

      <div>
        <div style={{ ...sectionTitle, marginBottom: "var(--d-stack-sm)" }}>
          Contingência
        </div>
        <div style={{ ...grid2, marginBottom: "var(--d-stack-sm)" }}>
          {renderSelectOrCombo(
            "Há Contingência?",
            "hasContingency",
            values.hasContingency,
            (v) => setValue("hasContingency", v),
          )}
          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            {fieldHead("Código da Evidência", "evidenceCode")}
            <input
              type="text"
              placeholder="Ex: GM-3655.01-2024-T-005"
              value={values.evidenceCode}
              onInput={(e) => setValue("evidenceCode", e.currentTarget.value)}
              style={inputStyle}
            />
          </div>
        </div>
        {text(
          "Descrição da Contingência",
          "contingencyDesc",
          "Detalhes do contingenciamento aplicado...",
        )}
      </div>

      <hr style={divider} />

      <div style={{ display: "grid", gap: "var(--d-stack-sm)" }}>
        <div style={sectionTitle}>Degradação & Observações</div>
        {text(
          "Descrição da Degradação",
          "degradationDesc",
          "Descreva eventuais falhas ou degradação...",
        )}
        {text("Comentários", "comments")}
        {text("Comentários 2 (Complementares)", "extraComments")}
        {text(
          "Plano de Ação",
          "actionPlan",
          "Ações previstas para restabelecimento...",
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--d-gap)",
          marginTop: 10,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          style={{
            padding: "9px 16px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--d-input-radius)",
            color: "var(--text-secondary)",
            fontSize: "var(--d-body)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "9px 20px",
            background: "linear-gradient(90deg,var(--accent),var(--accent-2))",
            border: "none",
            borderRadius: "var(--d-input-radius)",
            color: "#ffffff",
            fontSize: "var(--d-body)",
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            boxShadow: "0 4px 14px var(--glow)",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </>
  );
}
