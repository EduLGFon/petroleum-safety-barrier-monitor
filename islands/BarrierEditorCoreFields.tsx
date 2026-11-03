// Barrier editor identity/classification fields. Split out of
// BarrierEditor so the container handles loading/saving and this file owns
// the core field grid.
import type { ComponentChildren, JSX } from "preact";

export interface Lookups {
  availabilities?: { id: number; label: string }[];
  categories?: { id: number; label: string }[];
  locations?: { id: number; code: string; name: string | null }[];
  criticalities?: { id: number; label: string }[];
  typologies?: { id: number; label: string }[];
  groupings?: { id: number; label: string }[];
  owners?: { id: number; label: string }[];
}

export interface CoreValues {
  tag: string;
  locationId?: number;
  typologyId?: number;
  categoryId?: number;
  groupingId?: number;
  ownerId?: number;
  criticalityId?: number;
  availabilityId?: number;
}

export type CoreKey = keyof CoreValues;

interface Props {
  values: CoreValues;
  setValue: (key: CoreKey, value: string | number | undefined) => void;
  lookups: Lookups | null;
  barrierAvailability: string;
  statusNote: string;
  setStatusNote: (value: string) => void;
  inputStyle: JSX.CSSProperties;
  fieldHead: (
    label: string,
    fkey?: string,
    source?: { field: string; hint: string },
  ) => ComponentChildren;
}

const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--d-details-gap)",
};

const field = { display: "grid", gap: "var(--d-mini-gap)" };

export function BarrierEditorCoreFields(
  {
    values,
    setValue,
    lookups,
    barrierAvailability,
    statusNote,
    setStatusNote,
    inputStyle,
    fieldHead,
  }: Props,
) {
  const num = (raw: string): number | undefined =>
    raw === "" ? undefined : Number(raw);
  return (
    <div>
      <div
        style={{
          fontSize: "var(--d-caption)",
          fontWeight: 800,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "var(--d-stack-sm)",
        }}
      >
        Identificação & Classificação
      </div>
      <div style={grid}>
        <div style={field}>
          {fieldHead("TAG", "tag")}
          <input
            type="text"
            value={values.tag}
            onInput={(e) => setValue("tag", e.currentTarget.value)}
            style={inputStyle}
            required
          />
        </div>

        <div style={field}>
          {fieldHead("Instalação", "locationId")}
          <select
            value={values.locationId ?? ""}
            onChange={(e) => setValue("locationId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            {lookups?.locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.name ? `- ${l.name}` : ""}
              </option>
            )) ?? <option value="">Carregando…</option>}
          </select>
        </div>

        <div style={field}>
          {fieldHead("Tipologia", "typologyId")}
          <select
            value={values.typologyId ?? ""}
            onChange={(e) => setValue("typologyId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            {lookups?.typologies?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            )) ?? <option value="">Carregando…</option>}
          </select>
        </div>

        <div style={field}>
          {fieldHead("Categoria", "categoryId")}
          <select
            value={values.categoryId ?? ""}
            onChange={(e) => setValue("categoryId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            {lookups?.categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            )) ?? <option value="">Carregando…</option>}
          </select>
        </div>

        <div style={field}>
          {fieldHead("Agrupamento", "groupingId")}
          <select
            value={values.groupingId ?? ""}
            onChange={(e) => setValue("groupingId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            {lookups?.groupings?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            )) ?? <option value="">Carregando…</option>}
          </select>
        </div>

        <div style={field}>
          {fieldHead("Dono", "ownerId")}
          <select
            value={values.ownerId ?? ""}
            onChange={(e) => setValue("ownerId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            <option value="">Não informado</option>
            {lookups?.owners?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div style={field}>
          {fieldHead("Criticidade", "criticalityId")}
          <select
            value={values.criticalityId ?? ""}
            onChange={(e) =>
              setValue("criticalityId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            {lookups?.criticalities?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            )) ?? <option value="">Carregando…</option>}
          </select>
        </div>

        <div style={field}>
          {fieldHead("Disponibilidade", undefined, {
            field: "OS/SS + flags",
            hint:
              "Fracttal: ordens e solicitações abertas, data fora de operação e flags do ativo (protegido por autoria: status manual não é revertido)",
          })}
          <select
            value={values.availabilityId ?? ""}
            onChange={(e) =>
              setValue("availabilityId", num(e.currentTarget.value))}
            style={inputStyle}
          >
            {lookups?.availabilities?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            )) ?? <option value="">Carregando…</option>}
          </select>
        </div>
      </div>

      {values.availabilityId !== undefined &&
        lookups?.availabilities?.find((a) => a.id === values.availabilityId)
            ?.label !== barrierAvailability &&
        (
          <div style={{ marginTop: 10 }}>
            <label
              style={{
                fontSize: "var(--d-caption)",
                fontWeight: 700,
                color: "var(--accent)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Motivo / Nota da Alteração de Status
            </label>
            <input
              type="text"
              placeholder="Ex: Manutenção preventiva realizada"
              value={statusNote}
              onInput={(e) => setStatusNote(e.currentTarget.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </div>
        )}
    </div>
  );
}
