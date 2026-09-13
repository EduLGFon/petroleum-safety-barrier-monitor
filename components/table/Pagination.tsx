// Pagination - controlled pager with page-size select and go-to input.
// Why: isolates paging state/render so BarriersTable keeps only the table shell.
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "../ui/Icons.tsx";
import { PAGE_SIZE_OPTS } from "../../lib/constants.ts";
import { bs, buildPages } from "./pagination-utils.ts";
import { AURORA } from "../../lib/aurora.ts";
import { GotoInput } from "./GotoInput.tsx";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  onPageSize: (n: number) => void;
}

// Pagination: controlled pager over page/totalPages/total/pageSize; shows range label, page-size select, nav buttons, and clamped go-to input.
export function Pagination(
  { page, totalPages, total, pageSize, onChange, onPageSize }: PaginationProps,
) {
  const from = ((page - 1) * pageSize) + 1,
    to = Math.min(page * pageSize, total);
  const pages = buildPages(page, totalPages);
  // The goto chip sits where the trailing ellipsis would be, so mid-list
  // (deep pages) it reads as the right-hand gap instead of a hole between
  // "1" and the current window. When the window hugs the last page and no
  // gap exists, it trails the final page number instead.
  const trailingEllipsis = pages.lastIndexOf("…");
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
      <span style={{ fontSize: "var(--d-body)", color: "var(--text-muted)" }}>
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
              ? i === trailingEllipsis
                ? (
                  <GotoInput
                    key="goto"
                    page={page}
                    totalPages={totalPages}
                    onChange={onChange}
                  />
                )
                : (
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
          {trailingEllipsis === -1 && (
            <GotoInput
              page={page}
              totalPages={totalPages}
              onChange={onChange}
            />
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
    </div>
  );
}
