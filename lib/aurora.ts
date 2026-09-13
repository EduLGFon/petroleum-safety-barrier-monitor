// Aurora Executive Dark identity - token map for the monitor.
// This is why it exists: every component reads surfaces, type colors and
// glows from here instead of hardcoding them. Values resolve to --au-*
// theme tokens (dark is the reference; light/amoled = the same
// language on their canvases) and the signature gradient/glow resolve to
// the live accent preset - so theme and color switching re-tints the
// whole interface instead of doing nothing.
// Type: Inter Tight throughout (thin modern premium), JetBrains Mono for
// TAGs - via --font-display/--font-sans/--font-mono. Display and sans
// resolve to the SAME stack on purpose: hero titles, KPI values and band
// numbers render byte-identically across the dashboard.
// AURORA_TYPE below is the single source of truth the dashboard imports, so
// type stays consistent (same family/weight/size/
// tracking by construction, not by copy-paste).
export const AURORA = {
  // Page canvas.
  page: "var(--au-page)",
  pageBase: "var(--au-page-base)",
  // Metric cards (KPI): blur(12px) glass.
  card: "var(--au-card)",
  cardBorder: "var(--au-card-border)",
  cardRadius: 14,
  // Data surfaces (table, chart, toolbars): flatter glass than KPI cards.
  data: "var(--au-data)",
  dataBorder: "var(--au-data-border)",
  dataRadius: 12,
  // Status segments + filter inputs.
  seg: "var(--au-seg)",
  segBorder: "var(--au-seg-border)",
  segRadius: 10,
  pill: "var(--au-pill)",
  pillBorder: "var(--au-pill-border)",
  // Table rows.
  rowDivider: "var(--au-row)",
  rowPad: "12px 16px",
  // Type colors.
  eyebrow: "var(--au-eyebrow)",
  label: "var(--au-label)",
  value: "var(--au-value)",
  sub: "var(--au-sub)",
  loc: "var(--au-loc)",
  pillText: "var(--au-pill-text)",
  // Signature gradient + glows (accent-reactive by design).
  grad: "linear-gradient(90deg,var(--accent),var(--accent-2))",
  track: "var(--au-track)",
  redGlow: "var(--au-red-glow)",
  auroraGlow: "var(--glow)",
  // Pills: neutral + danger.
  neutralBg: "var(--au-pill)",
  neutralFg: "var(--au-pill-text)",
  dangerBg: "var(--au-danger-bg)",
  dangerFg: "var(--au-danger-fg)",
  // Dialogs (solid for readability over the mesh).
  dialog: "var(--au-dialog)",
} as const;

// Single source of truth for Aurora type: the dashboard
// (Header/KpiGrid/StatusBand/table) imports
// these exact objects, so the font is literally the same everywhere.
// Deliberately thin: Inter Tight needs no heavy weights to read premium.
export const AURORA_TYPE = {
  sans: '"Inter Tight","Inter",-apple-system,"Segoe UI",sans-serif',
  display: '"Inter Tight","Inter",-apple-system,"Segoe UI",sans-serif',
  mono: '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace',
  eyebrow: { fontSize: 10, fontWeight: 600, letterSpacing: ".22em" },
  hero: { fontSize: 22, fontWeight: 300, letterSpacing: "-.02em" },
  kpiLabel: { fontSize: 10, fontWeight: 600, letterSpacing: ".14em" },
  kpiValue: { fontSize: 30, fontWeight: 500, letterSpacing: "-.02em" },
  bandLabel: { fontSize: 10, fontWeight: 600 },
  bandValue: { fontSize: 18, fontWeight: 500 },
  tag: { fontSize: 13, fontWeight: 500 },
} as const;

// Connection-dot palette for the hero title. Connected is ALWAYS the
// palette's main color (var(--accent)/var(--glow)), so the dot tracks
// accent switching with no JS. Offline is red - unless the palette
// itself is red, in which case gray keeps the states distinguishable.
export const AURORA_CONN = {
  connected: "var(--accent)",
  connectedGlow: "var(--glow)",
  offline: "#f87171",
  offlineOnRed: "#94a3b8",
} as const;

// Widths of the KPI progress fills: every metric bar runs the signature
// gradient, scaled by its share of the total.
export function progressWidth(sharePct: number): string {
  const p = Math.max(0, Math.min(100, Math.round(sharePct)));
  return `${p}%`;
}
