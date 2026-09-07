import type { CSSProperties } from "preact";
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import {
  confColorFor,
  critColorFor,
  dispColorFor,
  PAGE_SIZE_OPTS,
} from "../lib/constants.ts";
import { daysSince, humanDuration } from "../lib/utils.ts";
import { Badge } from "./ui/Badge.tsx";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronUpIcon,
  ClockIcon,
  SortIcon,
} from "./ui/Icons.tsx";

interface Props {
  rows: Barrier[];
  filters: FilterState;
  filteredTotal: number;
  totalPages: number;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSort: (c: SortableColumn) => void;
  onPageChange: (p: number) => void;
  onPageSize: (n: number) => void;
  onSelect: (b: Barrier) => void;
}

const COLS: { col: SortableColumn; label: string; w?: string }[] = [
  { col: "id", label: "#", w: "52px" },
  { col: "tag", label: "TAG / Identificação" },
  { col: "criticidade", label: "Criticidade", w: "140px" },
  { col: "categoria", label: "Categoria" },
  { col: "disponibilidade", label: "Disponibilidade", w: "230px" },
  { col: "conformidade", label: "Conformidade", w: "148px" },
];

const thSt: CSSProperties = {
  padding: "var(--d-cell-pad)",
  textAlign: "left",
  fontSize: "var(--d-caption)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
  userSelect: "none",
  background: "var(--bg-elevated)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
  color: "var(--text-muted)",
};

export function BarriersTable(
  {
    rows,
    filters,
    filteredTotal,
    totalPages,
    selectedIds,
    onToggleSelect,
    onSort,
    onPageChange,
    onPageSize,
    onSelect,
  }: Props,
) {
  return (
    <div>
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--d-card-radius)",
          overflow: "hidden",
          marginBottom: "var(--d-stack-sm)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}
          >
            <thead>
              <tr>
                <th style={{ ...thSt, width: 44, cursor: "default" }} />
                {COLS.map((c) => (
                  <th
                    key={c.col}
                    onClick={() => onSort(c.col)}
                    style={{
                      ...thSt,
                      width: c.w,
                      color: filters.sortCol === c.col
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  >
                    {c.label}
                    {filters.sortCol === c.col
                      ? filters.sortDir === "asc"
                        ? (
                          <ChevronUpIcon
                            size={12}
                            color="var(--accent)"
                            strokeWidth={2.5}
                          />
                        )
                        : (
                          <ChevronDownIcon
                            size={12}
                            color="var(--accent)"
                            strokeWidth={2.5}
                          />
                        )
                      : (
                        <SortIcon
                          size={11}
                          color="var(--border)"
                          strokeWidth={2}
                        />
                      )}
                  </th>
                ))}
                <th style={{ ...thSt, width: 40, cursor: "default" }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? (
                  <tr>
                    <td
                      colSpan={COLS.length + 2}
                      style={{
                        padding: "var(--d-empty-pad)",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: "var(--d-lead)",
                      }}
                    >
                      Nenhuma barreira encontrada.
                    </td>
                  </tr>
                )
                : rows.map((b, i) => {
                  const isSel = selectedIds.has(b.id);
                  // Hashed fallback keeps unseen statuses visible, never gray.
                  const dc = dispColorFor(b.disponibilidade).solid;
                  const isNC = b.conformidade === "Não Conforme";
                  const ncDays = isNC && b.statusSince
                    ? daysSince(b.statusSince)
                    : 0;

                  return (
                    <tr
                      key={b.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        // FIX: boxShadow on <tr> for the left color stripe — appears on ALL rows regardless of bg
                        boxShadow: `inset 3px 0 0 ${dc}`,
                        background: isSel
                          ? "rgba(59,130,246,.06)"
                          : i % 2 === 0
                          ? "transparent"
                          : "var(--bg-stripe)",
                        cursor: "pointer",
                        transition: "background .15s var(--ease-std)",
                        animation: `rowAppear .22s ${
                          Math.min(i * 18, 280)
                        }ms var(--ease-out) both`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSel) {
                          (e.currentTarget as HTMLTableRowElement).style
                            .background = "var(--bg-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style
                          .background = isSel
                            ? "rgba(59,130,246,.06)"
                            : i % 2 === 0
                            ? "transparent"
                            : "var(--bg-stripe)";
                      }}
                    >
                      {/* Checkbox */}
                      <td
                        style={{ padding: "var(--d-cell-pad)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(b.id);
                        }}
                      >
                        <RowChk checked={isSel} />
                      </td>

                      {/* # */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{
                          padding: "var(--d-cell-pad)",
                          fontSize: "var(--d-body)",
                          color: "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {b.id}
                      </td>

                      {/* TAG + NC badge */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{ padding: "var(--d-cell-pad)" }}
                      >
                        <div
                          style={{
                            fontFamily:
                              'ui-monospace,"Cascadia Code",Menlo,monospace',
                            fontWeight: 700,
                            fontSize: "var(--d-body)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {b.tag}
                        </div>
                        <div
                          style={{
                            fontSize: "var(--d-small)",
                            color: "var(--text-muted)",
                            marginTop: 2,
                          }}
                        >
                          {b.locDesc}
                        </div>
                        {/* FIX 13: "X tempo sem contingenciamento" for NC items */}
                        {isNC && b.statusSince && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "var(--d-mini-gap)",
                              marginTop: "var(--d-gap-xs)",
                              padding: "var(--d-nc-pad)",
                              background: "rgba(239,68,68,.09)",
                              border: "1px solid rgba(239,68,68,.22)",
                              borderRadius: "var(--d-pill-sm-radius)",
                              fontSize: "var(--d-caption)",
                              fontWeight: 600,
                              color: "#ef4444",
                            }}
                          >
                            <ClockIcon
                              size={10}
                              color="#ef4444"
                              strokeWidth={2.5}
                            />
                            {humanDuration(ncDays)} sem contingenciamento
                          </div>
                        )}
                      </td>

                      {/* Criticidade */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{ padding: "var(--d-cell-pad)" }}
                      >
                        <Badge
                          label={b.criticidade}
                          {...critColorFor(b.criticidade)}
                          size="sm"
                        />
                      </td>

                      {/* Categoria */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{
                          padding: "var(--d-cell-pad)",
                          fontSize: "var(--d-body)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {b.categoria}
                      </td>

                      {/* Disponibilidade */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{ padding: "var(--d-cell-pad)" }}
                      >
                        <Badge
                          label={b.disponibilidade}
                          {...dispColorFor(b.disponibilidade)}
                        />
                      </td>

                      {/* Conformidade */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{ padding: "var(--d-cell-pad)" }}
                      >
                        <Badge
                          label={b.conformidade}
                          {...confColorFor(b.conformidade)}
                        />
                      </td>

                      {/* Arrow */}
                      <td
                        onClick={() => onSelect(b)}
                        style={{
                          padding: "var(--d-arrow-pad)",
                          textAlign: "center",
                          fontSize: "var(--d-arrow)",
                          color: "var(--text-muted)",
                          transition: "color .15s,transform .15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableCellElement).style
                            .color = "var(--accent)";
                          (e.currentTarget as HTMLTableCellElement).style
                            .transform = "translateX(2px)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableCellElement).style
                            .color = "var(--text-muted)";
                          (e.currentTarget as HTMLTableCellElement).style
                            .transform = "none";
                        }}
                      >
                        ›
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          total={filteredTotal}
          pageSize={filters.pageSize}
          onChange={onPageChange}
          onPageSize={onPageSize}
        />
      )}
    </div>
  );
}

function RowChk({ checked }: { checked: boolean }) {
  return (
    <div
      className={checked ? "animate-check" : ""}
      style={{
        width: "var(--d-rowchk)",
        height: "var(--d-rowchk)",
        borderRadius: 4,
        flexShrink: 0,
        border: checked ? "2px solid var(--accent)" : "2px solid var(--border)",
        background: checked ? "var(--accent)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all .18s var(--ease-std)",
        boxShadow: checked ? "0 0 8px var(--glow)" : "none",
      }}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path
            d="M1 3L3 5L7 1"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

function Pagination(
  { page, totalPages, total, pageSize, onChange, onPageSize }: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    onChange: (p: number) => void;
    onPageSize: (n: number) => void;
  },
) {
  const from = ((page - 1) * pageSize) + 1,
    to = Math.min(page * pageSize, total);
  const bs = (active: boolean, disabled: boolean): CSSProperties => ({
    minWidth: "var(--d-page-btn)",
    height: "var(--d-page-btn)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 var(--d-opt-gap)",
    fontSize: "var(--d-body)",
    fontWeight: active ? 700 : 500,
    border: active ? "1px solid transparent" : "1px solid var(--border)",
    borderRadius: "var(--d-chip-radius)",
    background: active
      ? "linear-gradient(135deg,var(--accent),var(--accent-2))"
      : "var(--bg-surface)",
    color: active
      ? "#fff"
      : disabled
      ? "var(--border)"
      : "var(--text-secondary)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    boxShadow: active ? "0 2px 8px var(--glow)" : "none",
    transition: "all .2s var(--ease-std)",
  });
  const pages = buildPages(page, totalPages);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--d-opt-gap)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{ fontSize: "var(--d-body)", color: "var(--text-muted)" }}
      >
        {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")} de{" "}
        {total.toLocaleString("pt-BR")}
      </span>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-mini-gap)",
          fontSize: "var(--d-body)",
          color: "var(--text-muted)",
        }}
      >
        Por página
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.currentTarget.value))}
          style={{
            padding: "var(--d-sel-pad)",
            fontSize: "var(--d-body)",
            background: "var(--bg-surface)",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--d-input-radius)",
            color: "var(--text-secondary)",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {PAGE_SIZE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div style={{ display: "flex", gap: "var(--d-gap-2xs)" }}>
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={page === 1}
          style={bs(false, page === 1)}
        >
          <ChevronsLeftIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={bs(false, page === 1)}
        >
          <ChevronLeftIcon size={14} />
        </button>
        {pages.map((p, i) =>
          p === "…"
            ? (
              <span
                key={`e${i}`}
                style={{ ...bs(false, true), cursor: "default" }}
              >
                …
              </span>
            )
            : (
              <button
                type="button"
                key={p}
                onClick={() => onChange(p as number)}
                style={bs(page === p, false)}
              >
                {p}
              </button>
            )
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={bs(false, page === totalPages)}
        >
          <ChevronRightIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => onChange(totalPages)}
          disabled={page === totalPages}
          style={bs(false, page === totalPages)}
        >
          <ChevronsRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}
function buildPages(cur: number, tot: number): (number | "…")[] {
  if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1);
  const r: (number | "…")[] = [1];
  if (cur > 3) r.push("…");
  for (let p = Math.max(2, cur - 1); p <= Math.min(tot - 1, cur + 1); p++) {
    r.push(p);
  }
  if (cur < tot - 2) r.push("…");
  r.push(tot);
  return r;
}
