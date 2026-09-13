// FiltersSection.tsx - default location, filters, and sort form with reset.
// Why: isolates startup filter defaults so the shell only switches sections.
import { CONF_OPTS, DISP_OPTS, selSt, SORT_OPTS } from "./settings-options.ts";
import type { SettingsState } from "../../context/SettingsContext.tsx";
import { FieldLabel, SectTitle } from "./SectionPrimitives.tsx";
import { CATEGORIES, LOCATIONS } from "../../lib/constants.ts";
import type { FilterState } from "../../lib/types.ts";

interface Props {
  settings: SettingsState;
  setDefaults: (f: Partial<FilterState>) => void;
  setDefaultLoc: (l: string) => void;
}

// FiltersSection: startup filter defaults form with restore-defaults action.
export function FiltersSection(
  { settings, setDefaults, setDefaultLoc }: Props,
) {
  return (
    <div
      className="animate-settings-in"
      style={{
        padding: "var(--d-panel-body)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--d-panel-gap)",
      }}
    >
      <SectTitle>Filtros Padrão ao Carregar</SectTitle>
      <p
        style={{
          margin: 0,
          fontSize: "var(--d-body)",
          color: "var(--text-muted)",
          lineHeight: 1.6,
        }}
      >
        Aplicados automaticamente ao iniciar o sistema.
      </p>
      {/* Default location — ITEM 7 */}
      <div>
        <FieldLabel>Instalação (localização)</FieldLabel>
        <select
          value={settings.defaultLocation}
          onChange={(e) => setDefaultLoc(e.currentTarget.value)}
          style={selSt}
        >
          {LOCATIONS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
              {l.code !== "ALL" ? ` — ${l.tipo}` : ""}
            </option>
          ))}
        </select>
      </div>
      {[
        {
          label: "Disponibilidade",
          key: "disponibilidade",
          opts: DISP_OPTS,
        },
        { label: "Conformidade", key: "conformidade", opts: CONF_OPTS },
        { label: "Categoria", key: "categoria", opts: [...CATEGORIES] },
      ].map(({ label, key, opts }) => (
        <div key={key}>
          <FieldLabel>{label}</FieldLabel>
          <select
            value={(settings.defaultFilters as Record<string, string>)[
              key
            ] ?? ""}
            onChange={(e) =>
              setDefaults({
                ...settings.defaultFilters,
                [key]: e.currentTarget.value,
              })}
            style={selSt}
          >
            <option value="">Todas</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div>
        <FieldLabel>Ordenação</FieldLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--d-opt-gap)",
          }}
        >
          <select
            value={(settings.defaultFilters as Record<string, string>)
              .sortCol ?? "id"}
            onChange={(e) =>
              setDefaults({
                ...settings.defaultFilters,
                sortCol: e.currentTarget.value as never,
              })}
            style={selSt}
          >
            {SORT_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={(settings.defaultFilters as Record<string, string>)
              .sortDir ?? "asc"}
            onChange={(e) =>
              setDefaults({
                ...settings.defaultFilters,
                sortDir: e.currentTarget.value as never,
              })}
            style={selSt}
          >
            <option value="asc">Crescente ↑</option>
            <option value="desc">Decrescente ↓</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setDefaults({});
          setDefaultLoc("ALL");
        }}
        style={{
          padding: "var(--d-reset-pad)",
          background: "rgba(239,68,68,.07)",
          border: "1.5px solid rgba(239,68,68,.22)",
          borderRadius: "var(--d-input-radius)",
          color: "#ef4444",
          fontSize: "var(--d-body)",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all .2s",
        }}
      >
        Restaurar padrões
      </button>
    </div>
  );
}
