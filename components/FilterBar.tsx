// Filter bar - Aurora glass search plus faceted selects fed by the data.
// This is why it exists: vocabularies are dynamic (new statuses, 70+
// categories, typologies), so option lists arrive as props derived from
// live data. Empty props mean still loading or truly empty data: selects
// show only the placeholder instead of a fixed seed list. Station filtering
// stays on the location tabs; plan and date boxes hide via the Colunas
// dialog Filtros toggles.
import { Combo, GLASS_INPUT } from "./filter/FilterSelect.tsx";

import type { ColumnKey, PinnedKey } from "./table/columns.ts";

import { ColumnsMenu } from "./table/ColumnsMenu.tsx";

import type { FilterState } from "../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

import type { ComponentChildren } from "preact";

import { SearchIcon } from "./ui/Icons.tsx";

import { AURORA } from "../lib/aurora.ts";

export interface FilterVocabs {
  typologies: string[];
  categories: string[];
  availabilities: string[];
  compliances: string[];
  criticalities: string[];
}

interface Props {
  filters: FilterState;
  vocabs: FilterVocabs;
  // Pinned filter boxes hidden by the user (Plano/Período toggles).
  hiddenPinned: PinnedKey[];
  // True while a background refetch is in flight (server mode). Drives the
  // search-field busy pulse; never blocks typing.
  isRefreshing?: boolean;
  onFilter: (p: Partial<FilterState>) => void;
  // End-of-bar cluster: column switcher only (count, selection summary
  // and filter reset live in the TableStatusRow below the filters).
  visible: ColumnKey[];
  onToggleCol: (key: ColumnKey) => void;
  onMoveCol: (key: ColumnKey, dir: -1 | 1) => void;
  onResetCols: () => void;
  onTogglePinned: (key: PinnedKey) => void;
  // Icon-button cluster at the end of the bar: the caller passes the
  // export menu node so it sits directly beside the columns button.
  exportMenu?: ComponentChildren;
}

// DateBound: native date input for statusSince bounds; empty clears the bound.
function DateBound(
  { value, onChange, title }: {
    value: string;
    onChange: (v: string) => void;
    title: string;
  },
) {
  const commit = (v: string) => {
    // Slice to YYYY-MM-DD so datetime payloads still match the date-only
    // SQL/client compare; malformed input clears instead of wedging.
    const d = v ? v.slice(0, 10) : "";
    onChange(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : v === "" ? "" : d);
  };
  return (
    <input
      type="date"
      value={value}
      title={title}
      aria-label={title}
      onInput={(e) => commit(e.currentTarget.value)}
      onChange={(e) => commit(e.currentTarget.value)}
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

// FilterBar: controlled search + faceted selects in table-column order
// (TAG search, Tipologia, Categoria, Criticidade, Disponibilidade,
// Conformidade) plus Plano and Desde/Até bounds, ending with the Colunas
// dialog; onFilter patches state.
export function FilterBar(
  {
    filters,
    vocabs,
    hiddenPinned,
    isRefreshing = false,
    onFilter,
    visible,
    onToggleCol,
    onMoveCol,
    onResetCols,
    onTogglePinned,
    exportMenu,
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
      {/* Search - compact until focused, then grows */}
      <div
        style={{
          flex: "0 1 auto",
          width: focused || draft ? 300 : 150,
          minWidth: 0,
          maxWidth: "100%",
          position: "relative",
          transition: "width .2s var(--ease-out)",
        }}
      >
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
            ...(isRefreshing
              ? { animation: "pulse 1.1s var(--ease-std) infinite" }
              : {}),
          }}
        >
          <SearchIcon
            size={14}
            color={focused || draft || isRefreshing
              ? "var(--accent-2)"
              : AURORA.sub}
          />
        </span>
        <input
          type="search"
          placeholder="Pesquisa"
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

      <Combo
        value={filters.typology}
        onChange={(v) => onFilter({ typology: v })}
        placeholder={`Tipologia (${vocabs.typologies.length})`}
        opts={vocabs.typologies}
      />
      <Combo
        value={filters.category}
        onChange={(v) => onFilter({ category: v })}
        placeholder={`Categoria (${vocabs.categories.length})`}
        opts={vocabs.categories}
      />
      <Combo
        value={filters.criticality}
        onChange={(v) => onFilter({ criticality: v })}
        placeholder="Criticidade"
        opts={vocabs.criticalities}
      />
      <Combo
        value={filters.availability}
        onChange={(v) => onFilter({ availability: v })}
        placeholder="Disponibilidade"
        opts={vocabs.availabilities}
      />
      <Combo
        value={filters.compliance}
        onChange={(v) => onFilter({ compliance: v })}
        placeholder="Conformidade"
        opts={vocabs.compliances}
      />
      {!hiddenPinned.includes("plan") && (
        <Combo
          value={filters.plan}
          onChange={(v) => onFilter({ plan: v })}
          placeholder="Plano de ação"
          opts={["Com plano", "Sem plano"]}
        />
      )}
      {!hiddenPinned.includes("dates") && (
        <>
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
        </>
      )}
      {/* End cluster: Colunas dialog + export menu icon buttons. */}
      <div
        style={{
          display: "flex",
          gap: "var(--d-opt-gap)",
          flexWrap: "wrap",
          alignItems: "center",
          marginLeft: "auto",
        }}
      >
        <ColumnsMenu
          visible={visible}
          onToggle={onToggleCol}
          onMove={onMoveCol}
          onReset={onResetCols}
          hiddenPinned={hiddenPinned}
          onTogglePinned={onTogglePinned}
        />
        {exportMenu}
      </div>
    </div>
  );
}
