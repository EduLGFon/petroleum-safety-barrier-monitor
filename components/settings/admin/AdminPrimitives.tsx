// AdminPrimitives - shared cards, badges, and buttons for admin managers.
// This is why it exists: Users, Recipients, and Rules managers render the
// same premium card language (Aurora tokens, density vars) without copies.
import type { ComponentChildren } from "preact";

export type BadgeTone =
  | "active"
  | "inactive"
  | "admin"
  | "neutral"
  | "danger";

// TONE_STYLE: pill background/foreground per badge tone.
const TONE_STYLE: Record<BadgeTone, { bg: string; fg: string }> = {
  active: { bg: "rgba(16,185,129,.14)", fg: "#10b981" },
  inactive: { bg: "var(--au-row)", fg: "var(--text-muted)" },
  admin: { bg: "var(--glow)", fg: "var(--accent)" },
  neutral: { bg: "var(--bg-hover)", fg: "var(--text-secondary)" },
  danger: { bg: "var(--au-danger-bg)", fg: "var(--au-danger-fg)" },
};

// StatusBadge: small pill for role/state/channel labels.
export function StatusBadge(
  { tone, children }: { tone: BadgeTone; children: ComponentChildren },
) {
  const s = TONE_STYLE[tone];
  return (
    <span
      style={{
        fontSize: "var(--d-micro)",
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        background: s.bg,
        color: s.fg,
        borderRadius: 99,
        padding: "2px 9px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

// AdminHero: title + description + count chip heading each manager.
export function AdminHero(
  { title, hint, count }: { title: string; hint: string; count: string },
) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "var(--d-lead)",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </span>
        <span
          className="tnum"
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 700,
            color: "var(--accent)",
            background: "color-mix(in srgb,var(--accent) 10%,transparent)",
            borderRadius: 99,
            padding: "2px 10px",
          }}
        >
          {count}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "var(--d-small)",
          color: "var(--text-muted)",
          lineHeight: 1.55,
        }}
      >
        {hint}
      </p>
    </div>
  );
}

// AdminCard: elevated form/list container shared by all managers.
export function AdminCard({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1.5px solid var(--border)",
        borderRadius: "var(--d-row-radius)",
        padding: "var(--d-row-pad)",
        display: "grid",
        gap: "var(--d-opt-gap)",
      }}
    >
      {children}
    </div>
  );
}

// AdminRow: one list entry (avatar + identity + badges + actions).
export function AdminRow({ children }: { children: ComponentChildren }) {
  return (
    <div
      className="animate-row-in"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        background: "var(--bg-surface)",
        border: "1.5px solid var(--border)",
        borderRadius: "var(--d-row-radius)",
        padding: "10px 12px",
      }}
    >
      {children}
    </div>
  );
}

// Avatar: gradient initial circle for a user/recipient/rule name.
export function Avatar({ name }: { name: string }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 800,
        color: "#fff",
        background: "linear-gradient(135deg,var(--accent),var(--accent-2))",
        boxShadow: "0 2px 8px var(--glow)",
      }}
    >
      {initial}
    </span>
  );
}

// Field: labeled input wrapper for admin create forms.
export function Field(
  { label, children }: { label: string; children: ComponentChildren },
) {
  return (
    <label
      style={{
        display: "grid",
        gap: 5,
        fontSize: "var(--d-caption)",
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: ".08em",
        minWidth: 0,
        flex: "1 1 150px",
      }}
    >
      {label}
      {children}
    </label>
  );
}

// Shared control styles for admin forms (consume density tokens).
export const inputSt = {
  padding: "var(--d-input-y) var(--d-input-x)",
  fontSize: "var(--d-body)",
  fontWeight: 500,
  textTransform: "none",
  letterSpacing: "normal",
  background: "var(--bg-surface)",
  border: "1.5px solid var(--border)",
  borderRadius: "var(--d-input-radius)",
  color: "var(--text-primary)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

export const primaryBtn = {
  border: 0,
  borderRadius: "var(--d-input-radius)",
  background: "linear-gradient(90deg,var(--accent),var(--accent-2))",
  color: "#fff",
  fontSize: "var(--d-body)",
  fontWeight: 700,
  cursor: "pointer",
  padding: "var(--d-input-y) var(--d-input-x)",
  boxShadow: "0 4px 14px var(--glow)",
  whiteSpace: "nowrap",
} as const;

export const ghostBtn = {
  border: "1.5px solid var(--border)",
  borderRadius: "var(--d-chip-radius)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: "var(--d-small)",
  fontWeight: 600,
  cursor: "pointer",
  padding: "5px 11px",
  whiteSpace: "nowrap",
} as const;

export const dangerBtn = {
  border: "1.5px solid rgba(239,68,68,.35)",
  borderRadius: "var(--d-chip-radius)",
  background: "rgba(239,68,68,.07)",
  color: "#ef4444",
  fontSize: "var(--d-small)",
  fontWeight: 600,
  cursor: "pointer",
  padding: "5px 11px",
  whiteSpace: "nowrap",
} as const;

// ErrorBanner: inline fetch error with retry action.
export function ErrorBanner(
  { message, onRetry }: { message: string; onRetry: () => void },
) {
  return (
    <div
      role="alert"
      className="animate-fade-in"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--au-danger-bg)",
        border: "1px solid var(--alert-nc-border)",
        color: "var(--au-danger-fg)",
        borderRadius: "var(--d-row-radius)",
        padding: "10px 12px",
        fontSize: "var(--d-small)",
        lineHeight: 1.5,
      }}
    >
      <span style={{ minWidth: 0 }}>{message}</span>
      <button type="button" onClick={onRetry} style={ghostBtn}>
        Tentar de novo
      </button>
    </div>
  );
}

// EmptyState: centered placeholder when a manager list is empty.
export function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "var(--d-soon-pad)",
        border: "1.5px dashed var(--border)",
        borderRadius: "var(--d-row-radius)",
        color: "var(--text-muted)",
        fontSize: "var(--d-small)",
      }}
    >
      {text}
    </div>
  );
}

// SkeletonRows: shimmer placeholders while a manager loads.
export function SkeletonRows() {
  return (
    <div style={{ display: "grid", gap: 8 }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 54,
            borderRadius: "var(--d-row-radius)",
            border: "1.5px solid var(--border)",
            background:
              "linear-gradient(90deg,var(--bg-elevated) 25%,var(--bg-hover) 50%,var(--bg-elevated) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.4s linear infinite",
          }}
        />
      ))}
    </div>
  );
}
