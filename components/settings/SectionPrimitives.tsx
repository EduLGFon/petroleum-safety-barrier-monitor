// SectionPrimitives.tsx - SectTitle, FieldLabel, Toggle, DensityGlyph presentational helpers.
// Why: shared stateless primitives keep every settings section visually consistent.
import type { Density } from "../../context/SettingsContext.tsx";
import type { ComponentChildren } from "preact";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
// SectTitle: uppercase section heading for settings groups.
export function SectTitle({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        fontSize: "var(--d-small)",
        fontWeight: 800,
        color: "var(--text-primary)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "var(--d-sect-title-gap)",
      }}
    >
      {children}
    </div>
  );
}
// FieldLabel: small uppercase label for filter/default fields.
export function FieldLabel({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        fontSize: "var(--d-caption)",
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "var(--d-field-gap)",
      }}
    >
      {children}
    </div>
  );
}

/* Miniature content-rows preview: bar height/gap mirror the density mode. */
// DensityGlyph: tiny rows preview mirroring the density bar height and gap.
export function DensityGlyph(
  { value, active }: { value: Density; active: boolean },
) {
  const dims = value === "compact"
    ? { bar: 3, gap: 2 }
    : value === "spacious"
    ? { bar: 5, gap: 4 }
    : { bar: 4, gap: 3 };
  return (
    <div
      aria-hidden="true"
      style={{
        width: 46,
        height: 30,
        borderRadius: "var(--d-chip-radius)",
        background: "var(--bg-surface)",
        border: "1.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "center",
        gap: dims.gap,
        padding: "5px 6px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: dims.bar,
            borderRadius: 2,
            width: i === 2 ? "62%" : "100%",
            background: active
              ? "linear-gradient(90deg,var(--accent),var(--accent-2))"
              : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}

// Toggle: accessible switch for booleans like reduce-motion.
export function Toggle(
  { checked, onChange }: { checked: boolean; onChange: (v: boolean) => void },
) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: "var(--d-toggle-w)",
        height: "var(--d-toggle-h)",
        borderRadius: "var(--d-toggle-h)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        background: checked ? "var(--accent)" : "var(--border)",
        transition: "background .25s var(--ease-std)",
        boxShadow: checked ? "0 0 8px var(--glow)" : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: checked
            ? "calc(var(--d-toggle-w) - var(--d-toggle-knob) - 4px)"
            : "3px",
          width: "var(--d-toggle-knob)",
          height: "var(--d-toggle-knob)",
          borderRadius: "50%",
          background: "#fff",
          transition: "left .25s var(--ease-out)",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
        }}
      />
    </button>
  );
}
