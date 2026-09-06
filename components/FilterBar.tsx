import { useState } from "preact/hooks";
import type { FilterState } from "../lib/types.ts";
import { CATEGORIES } from "../lib/constants.ts";
import { CloseIcon, FilterIcon, SearchIcon } from "./ui/Icons.tsx";

interface Props {
  filters: FilterState;
  filteredTotal: number;
  hasActiveFilters: boolean;
  onFilter: (p: Partial<FilterState>) => void;
  onReset: () => void;
}

const DISP_OPTS = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
  "Degradado",
  "Indisponível",
];
const CONF_OPTS = ["Conforme", "Não Conforme"];

export function FilterBar(
  { filters, filteredTotal, hasActiveFilters, onFilter, onReset }: Props,
) {
  const [focused, setFocused] = useState(false);

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
            color={focused || filters.query
              ? "var(--accent)"
              : "var(--text-muted)"}
          />
        </span>
        <input
          type="search"
          placeholder="TAG, localização, categoria…"
          value={filters.query}
          onChange={(e) => onFilter({ query: e.currentTarget.value })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding:
              "var(--d-input-y) var(--d-input-x) var(--d-input-y) var(--d-search-l)",
            fontSize: "var(--d-lead)",
            background: "var(--bg-surface)",
            border: focused || filters.query
              ? "1.5px solid var(--accent)"
              : "1.5px solid var(--border)",
            borderRadius: "var(--d-input-radius)",
            color: "var(--text-primary)",
            outline: "none",
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
        opts={DISP_OPTS}
      />
      <Sel
        value={filters.conformidade}
        onChange={(v) => onFilter({ conformidade: v })}
        placeholder="Conformidade"
        opts={CONF_OPTS}
      />
      <Sel
        value={filters.categoria}
        onChange={(v) => onFilter({ categoria: v })}
        placeholder="Categoria"
        opts={[...CATEGORIES]}
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
            fontWeight: 600,
            background: "rgba(239,68,68,.07)",
            border: "1.5px solid rgba(239,68,68,.22)",
            borderRadius: "var(--d-input-radius)",
            color: "#ef4444",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <CloseIcon size={12} color="#ef4444" />Limpar filtros
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
          color={hasActiveFilters ? "var(--accent)" : "var(--text-muted)"}
        />
        <span
          style={{
            fontSize: "var(--d-body)",
            color: hasActiveFilters ? "var(--accent)" : "var(--text-muted)",
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
      style={{
        padding: "var(--d-sel-pad)",
        fontSize: "var(--d-body)",
        background: a
          ? "color-mix(in srgb,var(--accent) 7%,var(--bg-surface))"
          : "var(--bg-surface)",
        border: a ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
        borderRadius: "var(--d-input-radius)",
        color: a ? "var(--accent)" : "var(--text-muted)",
        outline: "none",
        cursor: "pointer",
        fontWeight: a ? 700 : 400,
        boxShadow: a ? "0 0 0 3px var(--glow)" : "none",
        transition: "all .2s var(--ease-std)",
      }}
    >
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
