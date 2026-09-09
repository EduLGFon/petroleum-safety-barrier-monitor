// FilterSelect - controlled faceted select plus shared glass input style.
// Why: FilterBar selects need capped width and accent glow, reused without duplicating style.
import { AURORA } from "../../lib/aurora.ts";

// Shared glass style for search input and selects.
export const GLASS_INPUT = {
  background: AURORA.seg,
  border: `1px solid ${AURORA.segBorder}`,
  borderRadius: 10,
  color: AURORA.pillText,
  outline: "none",
} as const;

// Sel: controlled select with accent styling when a value is set; empty value shows placeholder, max-width caps long vocabularies.
export function Sel(
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
      title={value || placeholder}
      style={{
        padding: "var(--d-sel-pad)",
        fontSize: "var(--d-body)",
        ...GLASS_INPUT,
        border: a ? "1px solid var(--accent)" : `1px solid ${AURORA.segBorder}`,
        color: a ? AURORA.value : AURORA.label,
        cursor: "pointer",
        fontWeight: a ? 700 : 400,
        boxShadow: a ? "0 0 0 3px var(--glow)" : "none",
        transition: "all .2s var(--ease-std)",
        // Long vocabularies (70+ categories) must not stretch the row.
        maxWidth: "min(320px, 100%)",
      }}
    >
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
