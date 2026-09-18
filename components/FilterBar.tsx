// Filter bar - Aurora glass search plus faceted selects fed by the data.
// This is why it exists: vocabularies are dynamic (new statuses, 70+
// categories), so option lists arrive as props derived from the loaded
// barriers; the seed constants below are fallback only for empty data.
import { FALLBACK_CONF, FALLBACK_DISP } from "./filter/filter-fallbacks.ts";
import { CloseIcon, FilterIcon, SearchIcon } from "./ui/Icons.tsx";
import { GLASS_INPUT, Sel } from "./filter/FilterSelect.tsx";
import { useEffect, useState } from "preact/hooks";
import type { FilterState } from "../lib/types.ts";
import { CATEGORIES } from "../lib/constants.ts";
import { AURORA } from "../lib/aurora.ts";
import { fmt } from "../lib/utils.ts";

interface Props {
  filters: FilterState;
  filteredTotal: number;
  hasActiveFilters: boolean;
  availabilities: string[];
  compliances: string[];
  categories: string[];
  onFilter: (p: Partial<FilterState>) => void;
  onReset: () => void;
}

// DateBound: native date input for statusSince bounds; empty clears the bound.
function DateBound(
  { value, onChange, title }: {
    value: string;
    onChange: (v: string) => void;
    title: string;
  },
) {
  return (
    <input
      type="date"
      value={value}
      title={title}
      aria-label={title}
      onInput={(e) => onChange(e.currentTarget.value)}
      style={{
        padding: "var(--d-sel-pad)",
        fontSize: "var(--d-body)",
        ...GLASS_INPUT,
        border: value
          ? "1px solid var(--accent)"
          : `1px solid ${AURORA.segBorder}`,
        color: value ? AURORA.value : AURORA.label,
        fontWeight: value ? 700 : 400,
        maxWidth: "min(200px, 100%)",
        flex: "0 1 auto",
      }}
    />
  );
}

// FilterBar: controlled search + three faceted selects over live vocab props (fallbacks for empty data); onFilter patches state, onReset clears.
export function FilterBar(
  {
    filters,
    filteredTotal,
    hasActiveFilters,
    availabilities,
    compliances,
    categories,
    onFilter,
    onReset,
  }: Props,
) {
  const [focused, setFocused] = useState(false);
  // Local search draft: typing updates the draft instantly but propagates to
  // the dashboard pipeline debounced, so each keystroke no longer triggers a
  // full filter + O(N log N) sort over tens of thousands of rows.
  const [draft, setDraft] = useState(filters.query);
  // External query changes (reset, restored state) overwrite the draft.
  useEffect(() => {
    setDraft(filters.query);
  }, [filters.query]);
  useEffect(() => {
    if (draft === filters.query) return;
    const t = setTimeout(() => onFilter({ query: draft }), 200);
    return () => clearTimeout(t);
  }, [draft, filters.query, onFilter]);
  // Props carry the live vocabulary; seed lists only fill empty datasets.
  const dispOpts = availabilities.length ? availabilities : FALLBACK_DISP;
  const confOpts = compliances.length ? compliances : FALLBACK_CONF;
  const catOpts = categories.length ? categories : [...CATEGORIES];

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
      {/* Search */} {/* Search */}
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
            color={focused || draft ? "var(--accent-2)" : AURORA.sub}
          />
        </span>
        <input
          type="search"
          placeholder="TAG, localização, categoria…"
          value={draft}
          // NOTE: onInput, not onChange (see BarriersTable goto field).
          onInput={(e) => setDraft(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding:
              "var(--d-input-y) var(--d-input-x) var(--d-input-y) var(--d-search-l)",
            fontSize: "var(--d-lead)",
            ...GLASS_INPUT,
            border: focused || draft
              ? "1px solid var(--accent)"
              : `1px solid ${AURORA.segBorder}`,
            boxSizing: "border-box",
            boxShadow: focused ? "0 0 0 3px var(--glow)" : "none",
            transition: "border .2s, box-shadow .2s",
          }}
        />
      </div>

      <Sel
        value={filters.availability}
        onChange={(v) => onFilter({ availability: v })}
        placeholder="Disponibilidade"
        opts={dispOpts}
      />
      <Sel
        value={filters.compliance}
        onChange={(v) => onFilter({ compliance: v })}
        placeholder="Conformidade"
        opts={confOpts}
      />
      <Sel
        value={filters.category}
        onChange={(v) => onFilter({ category: v })}
        placeholder={`Categoria (${catOpts.length})`}
        opts={catOpts}
      />
      <DateBound
        value={filters.since}
        onChange={(v) => onFilter({ since: v })}
        title="Desde (status desde)"
      />
      <DateBound
        value={filters.until}
        onChange={(v) => onFilter({ until: v })}
        title="Até (status desde)"
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
          {fmt(filteredTotal)} resultado{filteredTotal !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
