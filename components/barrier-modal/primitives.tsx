// primitives - FR, Sec, Lbl, Div, Txt micro-UI helpers for BarrierModal.
// Why: shared tiny dialog atoms keep Details/History/Header small and consistent.
import type { ComponentChildren, FunctionComponent } from "preact";
// FR renders a labeled metadata field with optional accent/italic/full-width styling.
export function FR({
  Icon,
  label,
  value,
  accent,
  italic,
  full,
}: {
  Icon: FunctionComponent<
    { size?: number; color?: string; strokeWidth?: number }
  >;
  label: string;
  value: string;
  accent?: string;
  italic?: boolean;
  full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-mini-gap)",
          marginBottom: "var(--d-mini-gap)",
        }}
      >
        <Icon size={10} color="var(--text-muted)" strokeWidth={2} />
        <span
          style={{
            fontSize: "var(--d-micro)",
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--d-lead)",
          color: accent ?? "var(--text-secondary)",
          fontWeight: accent ? 700 : 400,
          fontStyle: italic ? "italic" : "normal",
          lineHeight: 1.45,
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}
// Sec renders an uppercase section heading for dialog body blocks.
export function Sec({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        fontSize: "var(--d-caption)",
        fontWeight: 800,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "var(--d-stack-sm)",
      }}
    >
      {children}
    </div>
  );
}
// Lbl renders a small uppercase field label for status/metadata values.
export function Lbl({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        fontSize: "var(--d-micro)",
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "var(--d-gap-xs)",
      }}
    >
      {children}
    </div>
  );
}
// Div renders a thin horizontal divider between dialog sections.
export function Div() {
  return (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--border)",
        margin: "var(--d-div-gap) 0",
      }}
    />
  );
}
// Txt renders a body paragraph with muted/italic fallback or accent emphasis.
export function Txt(
  { value, muted, accent }: { value: string; muted?: boolean; accent?: string },
) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: "var(--d-lead)",
        color: accent ??
          (muted ? "var(--text-muted)" : "var(--text-secondary)"),
        lineHeight: 1.65,
        fontStyle: muted ? "italic" : "normal",
        fontWeight: accent ? 600 : 400,
      }}
    >
      {value}
    </p>
  );
}
