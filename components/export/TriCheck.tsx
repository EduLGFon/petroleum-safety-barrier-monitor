// TriCheck - tri-state select-all checkbox.
// This is why it exists: the toolbar shell needs one shared tri-state box so checked shows a check and partial shows a dash.
import { AURORA } from "../../lib/aurora.ts";
// Chk: tri-state select-all box (checked check vs indeterminate dash); click delegates to onChange.
export function TriCheck(
  { checked, indeterminate, onChange }: {
    checked: boolean;
    indeterminate: boolean;
    onChange: () => void;
  },
) {
  const a = checked || indeterminate;
  return (
    <div
      onClick={onChange}
      style={{
        width: "var(--d-chk)",
        height: "var(--d-chk)",
        borderRadius: 4,
        flexShrink: 0,
        border: a
          ? "2px solid var(--accent)"
          : `2px solid ${AURORA.dataBorder}`,
        background: a ? AURORA.grad : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all .18s var(--ease-std)",
        boxShadow: a ? AURORA.auroraGlow : "none",
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
