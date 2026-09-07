// Filter bar - Aurora glass search plus faceted selects fed by the data.
// This is why it exists: vocabularies are dynamic (new statuses, 70+
// categories), so option lists arrive as props derived from the loaded
// barriers; the seed constants below are fallback only for empty data.
import { CloseIcon, FilterIcon, SearchIcon } from "./ui/Icons.tsx";
import type { FilterState } from "../lib/types.ts";
import { CATEGORIES } from "../lib/constants.ts";
import { useState } from "preact/hooks";
import { AURORA } from "../lib/aurora.ts";

interface Props {
  filters: FilterState;
  filteredTotal: number;
  hasActiveFilters: boolean;
  disponibilidades: string[];
  conformidades: string[];
  categorias: string[];
  onFilter: (p: Partial<FilterState>) => void;
  onReset: () => void;
}

const FALLBACK_DISP = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
  "Degradado",
  "Indisponível",
];
const FALLBACK_CONF = ["Conforme", "Não Conforme"];

const GLASS_INPUT = {
  background: AURORA.seg,
  border: `1px solid ${AURORA.segBorder}`,
  borderRadius: 10,
  color: AURORA.pillText,
  outline: "none",
} as const;

export function FilterBar(
  {
    filters,
    filteredTotal,
    hasActiveFilters,
    disponibilidades,
    conformidades,
    categorias,
    onFilter,
    onReset,
  }: Props,
) {
  const [focused, setFocused] = useState(false);
  // Props carry the live vocabulary; seed lists only fill empty datasets.
  const dispOpts = disponibilidades.length ? disponibilidades : FALLBACK_DISP;
  const confOpts = conformidades.length ? conformidades : FALLBACK_CONF;
  const catOpts = categorias.length ? categorias : [...CATEGORIES];

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--d-opt-gap)",
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: "var(--d-stack-sm)",
      }}
    >
      {/* Search */}
      <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: "var(--d-search-icon)",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            display: "flex",
            transition: "transform .2s var(--ease-out)",
            ...(focused ? { transform: "translateY(-50%) scale(1.1)" } : {}),
          }}
        >
          <SearchIcon
            size={14}
            color={focused || filters.query ? "var(--accent-2)" : AURORA.sub}
          />
        </span>
        <input
          type="search"
          placeholder="TAG, localização, categoria…"
          value={filters.query}
          // NOTE: onInput, not onChange (see BarriersTable goto field).
          onInput={(e) => onFilter({ query: e.currentTarget.value })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding:
              "var(--d-input-y) var(--d-input-x) var(--d-input-y) var(--d-search-l)",
            fontSize: "var(--d-lead)",
            ...GLASS_INPUT,
            border: focused || filters.query
              ? "1px solid var(--accent)"
              : `1px solid ${AURORA.segBorder}`,
            boxSizing: "border-box",
            boxShadow: focused ? "0 0 0 3px var(--glow)" : "none",
            transition: "border .2s, box-shadow .2s",
          }}
        />
      </div>

      <Sel
        value={filters.disponibilidade}
        onChange={(v) => onFilter({ disponibilidade: v })}
        placeholder="Disponibilidade"
        opts={dispOpts}
      />
      <Sel
        value={filters.conformidade}
        onChange={(v) => onFilter({ conformidade: v })}
        placeholder="Conformidade"
        opts={confOpts}
      />
      <Sel
        value={filters.categoria}
        onChange={(v) => onFilter({ categoria: v })}
        placeholder={`Categoria (${catOpts.length})`}
        opts={catOpts}
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="lift animate-filter-on"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--d-mini-gap)",
            padding: "var(--d-input-y) var(--d-input-x)",
            fontSize: "var(--d-body)",
            fontWeight: 700,
            background: AURORA.dangerBg,
            border: "1px solid rgba(239,68,68,.35)",
            borderRadius: 10,
            color: AURORA.dangerFg,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <CloseIcon size={12} color={AURORA.dangerFg} />Limpar filtros
        </button>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-mini-gap)",
          marginLeft: "auto",
        }}
      >
        <FilterIcon
          size={12}
          color={hasActiveFilters ? "var(--accent-2)" : AURORA.sub}
        />
        <span
          className="tnum"
          style={{
            fontSize: "var(--d-body)",
            color: hasActiveFilters ? "var(--accent-2)" : AURORA.sub,
            fontWeight: hasActiveFilters ? 600 : 400,
            whiteSpace: "nowrap",
            transition: "color .2s",
          }}
        >
          {filteredTotal.toLocaleString("pt-BR")}{" "}
          resultado{filteredTotal !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

function Sel(
  { value, onChange, placeholder, opts }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    opts: string[];
  },
) {
  const a = !!value;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={a ? "animate-filter-on" : ""}
      title={value || placeholder}
      style={{
        padding: "var(--d-sel-pad)",
        fontSize: "var(--d-body)",
        ...GLASS_INPUT,
        border: a ? "1px solid var(--accent)" : `1px solid ${AURORA.segBorder}`,
        color: a ? AURORA.value : AURORA.label,
        cursor: "pointer",
        fontWeight: a ? 700 : 400,
        boxShadow: a ? "0 0 0 3px var(--glow)" : "none",
        transition: "all .2s var(--ease-std)",
        // Long vocabularies (70+ categories) must not stretch the row.
        maxWidth: "min(320px, 100%)",
      }}
    >
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
