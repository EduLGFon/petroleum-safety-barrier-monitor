// TriCheck - tri-state select-all checkbox.
// This is why it exists: the table header needs one shared tri-state box so checked shows a check and partial shows a dash.
import { AURORA } from "../../lib/aurora.ts";
// Chk: tri-state select-all box (checked check vs indeterminate dash); click delegates to onChange.
// Stops propagation so wrapping toggle affordances (e.g. the table header
// cell, which carries the same toggle on click/keyboard) never fire twice
// for one click - a double toggle is a silent no-op that looks broken.
// Variant carries scope without inventing a fourth checkbox state: "page"
// is the standard accent, "full" (whole filtered set selected) renders an
// emerald fill so page-only vs all-filtered stay visually distinct while
// aria-checked remains a native true/mixed/false.
export function TriCheck(
  { checked, indeterminate, onChange, variant = "page" }: {
    checked: boolean;
    indeterminate: boolean;
    onChange: () => void;
    variant?: "page" | "full";
  },
) {
  const a = checked || indeterminate;
  const full = variant === "full" && checked;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      style={{
        width: "var(--d-chk)",
        height: "var(--d-chk)",
        borderRadius: 4,
        flexShrink: 0,
        border: full
          ? "2px solid #34d399"
          : a
          ? "2px solid var(--accent)"
          : `2px solid ${AURORA.dataBorder}`,
        background: full
          ? "linear-gradient(135deg,#34d399,#059669)"
          : a
          ? AURORA.grad
          : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all .18s var(--ease-std)",
        boxShadow: full
          ? "0 0 12px rgba(52,211,153,.45)"
          : a
          ? AURORA.auroraGlow
          : "none",
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
      {indeterminate && (
        <div
          style={{ width: 8, height: 2, background: "white", borderRadius: 1 }}
        />
      )}
    </div>
  );
}
