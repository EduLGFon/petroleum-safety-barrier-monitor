// FiltersSection.tsx - default location, filters, and sort form with reset.
// Why: isolates startup filter defaults so the shell only switches sections.
import type { SettingsState } from "../../context/SettingsContext.tsx";

import { FieldLabel, SectTitle } from "./SectionPrimitives.tsx";

import { selSt, SORT_OPTS } from "./settings-options.ts";

import { MultiCombo } from "../filter/FilterSelect.tsx";

import type { FilterState } from "../../lib/types.ts";
import type { SortableColumn } from "../../lib/types.ts";

interface Props {
  settings: SettingsState;
  setDefaults: (f: Partial<FilterState>) => void;
  setDefaultLoc: (l: string) => void;
  // One atomic write that clears the filters AND the default location, so
  // restoring the defaults never leaves half of them applied.
  resetDefaults: () => void;
  // Live vocabularies from the dashboard (server SSR or client dataset).
  // Empty or absent means "no known values yet": the selects offer only
  // "Todas" instead of a fixed seed list.
  locations?: { code: string; name: string; type: string }[];
  availabilities?: string[];
  compliances?: string[];
  criticalities?: string[];
  categories?: string[];
  typologies?: string[];
}

// FiltersSection: startup filter defaults form with restore-defaults action.
// Every option list is dynamic: only values present in the live data are
// selectable, so new stations/statuses/categories work with no code change.
// Stored defaults not present in the live lists coerce to "Todas"/"ALL" for
// display and are overwritten on the next user change.
export function FiltersSection(
  {
    settings,
    setDefaults,
    setDefaultLoc,
    resetDefaults,
    locations,
    availabilities,
    compliances,
    criticalities,
    categories,
    typologies,
  }: Props,
) {
  const liveLocs = locations ?? [];
  const locOpts = [
    { code: "ALL", name: "Todas", type: "" },
    ...liveLocs.filter((l) => l.code !== "ALL"),
  ];
  const locKnown = new Set(locOpts.map((l) => l.code));
  const effLoc = locKnown.has(settings.defaultLocation)
    ? settings.defaultLocation
    : "ALL";
  const dispOpts = availabilities ?? [];
  const confOpts = compliances ?? [];
  const critOpts = criticalities ?? [];
  const catOpts = categories ?? [];
  const typoOpts = typologies ?? [];
  const effPlan = ["Com plano", "Sem plano"].includes(
      (settings.defaultFilters as Record<string, string>).plan ?? "",
    )
    ? (settings.defaultFilters as Record<string, string>).plan as string
    : "";
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
      {/* Default location - ITEM 7 */}
      <div>
        <FieldLabel>Instalação (localização)</FieldLabel>
        <select
          value={effLoc}
          onChange={(e) => setDefaultLoc(e.currentTarget.value)}
          style={selSt}
        >
          {locOpts.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
              {l.code !== "ALL" && l.type ? ` - ${l.type}` : ""}
            </option>
          ))}
        </select>
      </div>
      {[
        { label: "Disponibilidade", key: "availability", opts: dispOpts },
        { label: "Conformidade", key: "compliance", opts: confOpts },
        { label: "Categoria", key: "category", opts: catOpts },
        { label: "Tipologia", key: "typology", opts: typoOpts },
        { label: "Criticidade", key: "criticality", opts: critOpts },
      ].map(({ label, key, opts }) => {
        const cur = (settings.defaultFilters as Record<string, unknown>)[key];
        const vals = Array.isArray(cur)
          ? cur.filter((x): x is string => typeof x === "string")
          : typeof cur === "string" && cur
          ? [cur]
          : [];
        return (
          <div key={key}>
            <FieldLabel>{label}</FieldLabel>
            <MultiCombo
              values={vals}
              onChange={(v) => setDefaults({ [key]: v })}
              placeholder={label}
              opts={opts}
            />
          </div>
        );
      })}
      <div>
        <FieldLabel>Plano de ação</FieldLabel>
        <select
          value={effPlan}
          onChange={(e) =>
            setDefaults({
              ...settings.defaultFilters,
              plan: e.currentTarget.value,
            })}
          style={selSt}
        >
          <option value="">Todas</option>
          {["Com plano", "Sem plano"].map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
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
                sortCol: e.currentTarget.value as SortableColumn,
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
                sortDir: e.currentTarget.value as "asc" | "desc",
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
        onClick={resetDefaults}
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
