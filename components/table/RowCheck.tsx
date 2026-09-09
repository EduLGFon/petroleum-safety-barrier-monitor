// Row checkbox + divider - tiny presentational table primitives.
// Why: shared by BarrierRow and Pagination so selection and grouping cues stay consistent.
import { AURORA } from "../../lib/aurora.ts";

// RowChk: presentational row checkbox; checked drives gradient fill + check mark, no click handling itself.
export function RowChk({ checked }: { checked: boolean }) {
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

// Slim vertical separator between pagination groups (page size, nav
// buttons, quick jumper) - the standard TablePagination grouping cue.
export function Divider() {
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
