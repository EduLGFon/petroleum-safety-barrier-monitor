// Compliance chart card - Aurora glass section around the SVG bars.
// This is why it exists: keeps the card frame stable while the inner
// chart stays dependency-free (no dynamic import needed in Fresh).
import {
  CHART_COLUMNS,
  CHART_TOP_N,
  type ChartSort,
  type ChartView,
  prepareChart,
  splitColumns,
} from "../lib/dashboard/chart.ts";

import {
  loadChartPrefs,
  saveChartPrefs,
} from "../hooks/dashboard/persistence.ts";

import type { CategoryCompliance } from "../lib/types.ts";

import { ChartSummary } from "./chart/ChartSummary.tsx";

import { GLASS_INPUT } from "./filter/FilterSelect.tsx";

import { computeMax } from "./chart/geometry.ts";

import Chart from "./ComplianceChartInner.tsx";
import { useEffect, useMemo, useState } from "preact/hooks";
import { AURORA } from "../lib/aurora.ts";

interface Props {
  data: CategoryCompliance[];
  // Click-through: full category name → table filter ("" clears).
  onSelectCategory?: (name: string) => void;
  // Currently filtered category: its row stays lit, shown as a chip.
  activeCategory?: string;
}

// Scroll budget: past this many rows the plot scrolls inside the card
// instead of growing the page into a 70-row tower.
const SCROLL_AFTER_ROWS = 18;

const SORTS: { value: ChartSort; label: string; title: string }[] = [
  { value: "volume", label: "Volume", title: "Maior volume primeiro" },
  {
    value: "ncRate",
    label: "% NC",
    title: "Maior % Não Conforme primeiro (mín. 5 itens)",
  },
  { value: "alpha", label: "A-Z", title: "Ordem alfabética" },
];

const VIEWS: { value: ChartView; label: string; title: string }[] = [
  { value: "bars", label: "Barras", title: "Barras por categoria" },
  {
    value: "summary",
    label: "Resumo",
    title: "Donut geral + Top Não Conforme",
  },
];

// ComplianceChart: glass card frame with view tabs; bars view carries the
// search + sort toolbar over side-by-side Top-N (+Outras) columns sharing
// one x-scale (expanded mode scrolls the full list as before), summary view
// shows the executive donut.
export function ComplianceChart(
  { data, onSelectCategory, activeCategory = "" }: Props,
) {
  const [sort, setSort] = useState<ChartSort>(() => loadChartPrefs().sort);
  const [expanded, setExpanded] = useState(() => loadChartPrefs().expanded);
  const [view, setView] = useState<ChartView>(() => loadChartPrefs().view);
  const [query, setQuery] = useState("");
  // Remember-last-choice: view + sort + expanded survive reloads.
  useEffect(() => {
    saveChartPrefs({ sort, expanded, view });
  }, [sort, expanded, view]);

  const searching = query.trim() !== "";
  const prepared = useMemo(
    () =>
      prepareChart(data, {
        limit: expanded || searching ? 0 : CHART_TOP_N,
        query,
        sort,
      }),
    [data, expanded, searching, query, sort],
  );
  const scroll = Math.ceil(prepared.rows.length / CHART_COLUMNS) >
    SCROLL_AFTER_ROWS;
  const isOutrosRow = (i: number) =>
    prepared.hidden > 0 && i === prepared.rows.length - 1;
  // Side-by-side columns share one x-scale (global max) so bar lengths stay
  // comparable across columns; the grid collapses to 1 column on narrow
  // screens. Legend renders once, under the last column.
  const columns = useMemo(
    () => splitColumns(prepared.rows, CHART_COLUMNS),
    [prepared.rows],
  );
  const sharedMax = useMemo(() => computeMax(prepared.rows), [prepared.rows]);
  // Global row offset per column, so the Outras-row predicate (which works
  // on overall indexes) resolves correctly inside each column slice.
  const columned = useMemo(() => {
    let off = 0;
    return columns.map((rows) => {
      const start = off;
      off += rows.length;
      return { rows, start };
    });
  }, [columns]);
  return (
    <div
      className="glass-card"
      style={{
        background: AURORA.data,
        border: `1px solid ${AURORA.dataBorder}`,
        borderRadius: AURORA.dataRadius,
        padding: "var(--d-chart-pad)",
        marginBottom: "var(--d-section)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: "var(--d-sect-title-gap)",
        }}
      >
        <div
          className="tnum"
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: AURORA.label,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          Conformidade por Categoria ·{" "}
          {searching
            ? `${prepared.rows.length} de ${data.length}`
            : data.length}
        </div>
        {activeCategory !== "" && (
          <button
            type="button"
            onClick={() => onSelectCategory?.("")}
            title={`Limpar filtro: ${activeCategory}`}
            aria-label={`Limpar filtro: ${activeCategory}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 4px 2px 10px",
              borderRadius: 99,
              border: "1px solid transparent",
              background: AURORA.grad,
              color: "#fff",
              cursor: "pointer",
              maxWidth: 220,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeCategory}
            </span>
            <span aria-hidden="true">×</span>
          </button>
        )}
        <div
          role="tablist"
          aria-label="Modo de visualização"
          style={{
            display: "flex",
            gap: 4,
            marginLeft: "auto",
            flexWrap: "wrap",
          }}
        >
          {VIEWS.map((v) => {
            const on = view === v.value;
            return (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(v.value)}
                title={v.title}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  borderRadius: 99,
                  border: on
                    ? "1px solid transparent"
                    : `1px solid ${AURORA.segBorder}`,
                  background: on ? AURORA.grad : "transparent",
                  color: on ? "#fff" : AURORA.pillText,
                  cursor: "pointer",
                  boxShadow: on ? AURORA.auroraGlow : "none",
                  transition: "all .2s var(--ease-std)",
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>
      {view === "summary"
        ? (
          <ChartSummary
            data={data}
            onSelectCategory={onSelectCategory}
            activeCategory={activeCategory}
          />
        )
        : (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "var(--d-stack-sm)",
              }}
            >
              <input
                type="search"
                placeholder="Buscar categoria…"
                value={query}
                aria-label="Buscar categoria"
                // NOTE: onInput, not onChange (see BarriersTable goto field).
                onInput={(e) => setQuery(e.currentTarget.value)}
                style={{
                  flex: "1 1 160px",
                  maxWidth: 260,
                  padding: "6px 12px",
                  fontSize: 12,
                  ...GLASS_INPUT,
                  boxSizing: "border-box",
                }}
              />
              <div
                role="group"
                aria-label="Ordenação do gráfico"
                style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
              >
                {SORTS.map((s) => {
                  const on = sort === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSort(s.value)}
                      aria-pressed={on}
                      title={s.title}
                      style={{
                        padding: "5px 11px",
                        fontSize: 12,
                        fontWeight: on ? 700 : 500,
                        borderRadius: 8,
                        border: on
                          ? "1px solid transparent"
                          : `1px solid ${AURORA.segBorder}`,
                        background: on ? AURORA.grad : AURORA.seg,
                        color: on ? "#fff" : AURORA.pillText,
                        cursor: "pointer",
                        boxShadow: on ? AURORA.auroraGlow : "none",
                        transition: "all .2s var(--ease-std)",
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {prepared.rows.length === 0
              ? (
                <div
                  style={{ fontSize: 13, color: AURORA.sub, padding: "8px 0" }}
                >
                  Nenhuma categoria encontrada para “{query.trim()}”.
                </div>
              )
              : (
                <div
                  style={scroll
                    ? {
                      maxHeight: "min(60vh, 520px)",
                      overflowY: "auto",
                      paddingRight: 4,
                    }
                    : undefined}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(400px, 100%), 1fr))",
                      gap: "0 24px",
                      alignItems: "start",
                    }}
                  >
                    {columned.map(({ rows, start }, ci) => (
                      <Chart
                        key={ci}
                        data={rows}
                        onSelectCategory={onSelectCategory}
                        activeCategory={activeCategory}
                        isOutrosRow={(i) => isOutrosRow(i + start)}
                        onExpandOutros={() => setExpanded(true)}
                        maxOverride={sharedMax}
                        showLegend={ci === columned.length - 1}
                      />
                    ))}
                  </div>
                </div>
              )}
            {!searching && view === "bars" && data.length > CHART_TOP_N && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  paddingTop: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  aria-expanded={expanded}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "5px 14px",
                    borderRadius: 99,
                    border: `1px solid ${AURORA.segBorder}`,
                    background: AURORA.seg,
                    color: AURORA.pillText,
                    cursor: "pointer",
                  }}
                >
                  {expanded ? "Recolher" : `Ver todas (${data.length})`}
                </button>
              </div>
            )}
          </>
        )}
    </div>
  );
}
