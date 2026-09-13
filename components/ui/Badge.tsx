// Badge - uppercase status pill with optional glow dot.
// This is why it exists: single shared badge renderer keeps availability /
// conformity / criticality colors consistent across table, modal, and band.
import type { CSSProperties } from "preact";
interface P {
  label: string;
  solid: string;
  bg: string;
  border: string;
  size?: "xs" | "sm" | "md";
  dot?: boolean;
}
export function Badge(
  { label, solid, bg, border, size = "md", dot = true }: P,
) {
  // Type + padding come from density tokens (--d-badge-<size>-*), so
  // badges re-rhythm with the interface density without prop drilling.
  const s: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--d-mini-gap)",
    fontSize: `var(--d-badge-${size}-fs)`,
    fontWeight: 700,
    padding: `var(--d-badge-${size}-pad)`,
    borderRadius: "var(--d-mini-radius)",
    background: bg,
    border: `1px solid ${border}`,
    color: solid,
    whiteSpace: "nowrap",
    letterSpacing: "0.025em",
    textTransform: "uppercase",
  };
  return (
    <span style={s}>
      {dot && (
        <span
          style={{
            width: size === "xs"
              ? "var(--d-badge-dot-xs)"
              : "var(--d-badge-dot)",
            height: size === "xs"
              ? "var(--d-badge-dot-xs)"
              : "var(--d-badge-dot)",
            borderRadius: "50%",
            background: solid,
            flexShrink: 0,
            boxShadow: `0 0 4px ${solid}88`,
          }}
        />
      )}
      {label}
    </span>
  );
}
