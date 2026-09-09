// Barriers table - Aurora glass ledger.
// This is why it exists: the tabular inventory itself; rows read as dark
// list items (mono tag, dim location, glass pills) while
// sorting, selection and pagination keep working underneath.
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
import {
  confColorFor,
  critColorFor,
  dispColorFor,
  PAGE_SIZE_OPTS,
} from "../lib/constants.ts";
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import { daysSince, humanDuration } from "../lib/utils.ts";
import { AURORA, AURORA_TYPE } from "../lib/aurora.ts";
import { useRef, useState } from "preact/hooks";
import type { CSSProperties } from "preact";
import { Badge } from "./ui/Badge.tsx";

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
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  cursor: "pointer",
  userSelect: "none",
  background: "transparent",
  borderBottom: `1px solid ${AURORA.rowDivider}`,
  whiteSpace: "nowrap",
  color: AURORA.sub,
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
        className="glass-card"
        style={{
          background: AURORA.data,
          border: `1px solid ${AURORA.dataBorder}`,
          borderRadius: AURORA.dataRadius,
          overflow: "hidden",
          marginBottom: "var(--d-stack-sm)",
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
                  const isNC = b.conformidade === "Não Conforme";
                  const ncDays = isNC && b.statusSince
                    ? daysSince(b.statusSince)
                    : 0;

                  return (
                    <tr
                      key={b.id}
                      style={{
                        borderBottom: `1px solid ${AURORA.rowDivider}`,
                        background: isSel
                          ? "rgba(99,102,241,.12)"
                          : "transparent",
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
                            ? "rgba(99,102,241,.12)"
                            : "transparent";
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
                          color: AURORA.sub,
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
                          className="tnum"
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontWeight: AURORA_TYPE.tag.fontWeight,
                            fontSize: AURORA_TYPE.tag.fontSize,
                            color: AURORA.value,
                          }}
                        >
                          {b.tag}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: AURORA.loc,
                            marginTop: 2,
                          }}
                        >
                          {b.locDesc}
                        </div>
                        {/* "X tempo sem contingenciamento" for NC items */}
                        {isNC && b.statusSince && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "var(--d-mini-gap)",
                              marginTop: "var(--d-gap-xs)",
                              padding: "var(--d-nc-pad)",
                              background: AURORA.dangerBg,
                              borderRadius: 7,
                              fontSize: "var(--d-caption)",
                              fontWeight: 600,
                              color: AURORA.dangerFg,
                            }}
                          >
                            <ClockIcon
                              size={10}
                              color={AURORA.dangerFg}
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
        border: checked
          ? "2px solid var(--accent)"
          : `2px solid ${AURORA.dataBorder}`,
        background: checked ? AURORA.grad : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all .18s var(--ease-std)",
        boxShadow: checked ? AURORA.auroraGlow : "none",
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
    border: active ? "1px solid transparent" : `1px solid ${AURORA.dataBorder}`,
    borderRadius: "var(--d-chip-radius)",
    background: active ? AURORA.grad : AURORA.data,
    color: active ? "#fff" : disabled ? AURORA.sub : AURORA.pillText,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    boxShadow: active ? AURORA.auroraGlow : "none",
    transition: "all .2s var(--ease-std)",
  });
  const pages = buildPages(page, totalPages);
  // Draft for the go-to-page field: null means "follow the current page".
  const [draft, setDraft] = useState<string | null>(null);
  // Escape sets this so the blur it triggers reverts instead of committing
  // (the blur handler still sees the pre-Escape draft - render is async).
  const cancelRef = useRef(false);
  const commitDraft = () => {
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    if (cancelled || draft === null) return;
    const parsed = parseInt(draft, 10);
    // NaN (empty/garbage) keeps the page; out-of-range clamps to 1..total.
    const n = Math.min(
      Math.max(Number.isNaN(parsed) ? page : parsed, 1),
      totalPages,
    );
    setDraft(null);
    if (n !== page) onChange(n);
  };
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-opt-gap)",
          flexWrap: "wrap",
        }}
      >
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
              background: AURORA.seg,
              border: `1px solid ${AURORA.segBorder}`,
              borderRadius: 10,
              color: AURORA.pillText,
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
        <Divider />
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--d-mini-gap)",
            fontSize: "var(--d-body)",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Ir para
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellcheck={false}
            aria-label="Ir para a página"
            title={`Ir para a página (1–${totalPages})`}
            placeholder={String(page)}
            value={draft ?? ""}
            // NOTE: onInput, not onChange. Preact 10 binds onChange to the
            // native `change` event, which text fields only fire on blur -
            // with onChange the draft would lag one Enter behind.
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Commit directly (not via blur) so keyboard users jump
                // immediately even if focus moves elsewhere first.
                commitDraft();
                (e.currentTarget as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                cancelRef.current = true;
                setDraft(null);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="goto-input"
            style={{
              // Fits the widest page number with room to type.
              width: `calc(${String(totalPages).length + 1}ch + 14px)`,
              minWidth: 52,
            }}
          />
          <span style={{ color: "var(--text-muted)" }}>
            de {totalPages.toLocaleString("pt-BR")}
          </span>
        </span>
      </div>
    </div>
  );
}
// Slim vertical separator between pagination groups (page size, nav
// buttons, quick jumper) - the standard TablePagination grouping cue.
function Divider() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 1,
        alignSelf: "stretch",
        minHeight: "var(--d-page-btn)",
        background: "var(--border)",
        opacity: 0.7,
      }}
    />
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
