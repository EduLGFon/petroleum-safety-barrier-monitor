// Conformidade chart inner - stacked horizontal bars as pure SVG.
// This is why it exists: dependency-free replacement for recharts with
// the same data contract (Conforme vs Nao Conforme per category), axis,
// gridlines and hover tooltip. All SVG text styling goes through `style`
// (never textAnchor/fontSize props) so hydration keeps it intact.
// Bars morph via CSS transitions on geometry attributes (staggered per
// row) when the station changes; rows play a staggered entrance on mount.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useSettings } from "../context/SettingsContext.tsx";
import type { CategoryConformidade } from "../lib/types.ts";
import { createPortal } from "preact/compat";
import type { CSSProperties } from "preact";

interface Props {
  data: CategoryConformidade[];
}

const COUNT_W = 56;
const TOP = 6;
const AXIS_H = 26;
const PLOT_W = 440;

/* Floating tooltip geometry — offset from the cursor, margin from edges. */
const TIP_OFFSET = 14;
const TIP_MARGIN = 8;
// Above app overlays (barrier modal 991, settings 1000/1001) so the tip is
// never painted underneath them, below the loading splash (9999).
const TIP_Z = 2000;

/* Bar geometry per density — tighter rows on compact, roomier on spacious. */
const GEO = {
  compact: { ROW_H: 21, BAR_H: 14, LABEL_W: 180 },
  comfortable: { ROW_H: 26, BAR_H: 18, LABEL_W: 200 },
  spacious: { ROW_H: 31, BAR_H: 22, LABEL_W: 220 },
} as const;

// ConformidadeChartInner: stacked Conforme / Não Conforme SVG bars with hover tip and density geometry.
export default function ConformidadeChartInner({ data }: Props) {
  const [hover, setHover] = useState<
    { i: number; x: number; y: number } | null
  >(
    null,
  );
  const { settings } = useSettings();
  const { ROW_H, BAR_H, LABEL_W } = GEO[settings.density] ?? GEO.comfortable;
  // Dismiss the floating tip when anything scrolls (page or the chart's own
  // scroll container) or the viewport resizes: the stored clientX/clientY
  // anchor would otherwise go stale and the tip would float detached from
  // the cursor/row until the next mousemove.
  useEffect(() => {
    const hide = () => setHover(null);
    globalThis.addEventListener("scroll", hide, true);
    globalThis.addEventListener("resize", hide);
    return () => {
      globalThis.removeEventListener("scroll", hide, true);
      globalThis.removeEventListener("resize", hide);
    };
  }, []);
  const max = Math.max(1, ...data.map((d) => d.Conforme + d["Não Conforme"]));
  const height = TOP + data.length * ROW_H + AXIS_H;
  const width = LABEL_W + PLOT_W + COUNT_W;
  const ticks = [0, Math.round(max / 2), max];
  // w: linear value→pixels scale against the max row total.
  const w = (v: number) => Math.max(0, (v / max) * PLOT_W);
  const hovered = hover !== null ? data[hover.i] : null;
  // Geometry lives in attributes (SSR/fallback) AND in style: only the
  // CSS values go through the transition engine, which is what morphs
  // the bars when the station changes.
  const px = (n: number) => `${n}px`;

  return (
    <div style={{ position: "relative" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Conformidade por categoria"
      >
        {
          /* gridlines + x ticks (keyed by index so the axis glides
            to its new scale instead of remounting on data change) */
        }
        {ticks.map((t, ti) => (
          <g key={ti}>
            <line
              x1={LABEL_W + w(t)}
              y1={TOP - 2}
              x2={LABEL_W + w(t)}
              y2={TOP + data.length * ROW_H}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.6}
              style={{
                x1: px(LABEL_W + w(t)),
                x2: px(LABEL_W + w(t)),
                transition: "x1 .5s var(--ease-out), x2 .5s var(--ease-out)",
              } as CSSProperties}
            />
            <text
              x={LABEL_W + w(t)}
              y={TOP + data.length * ROW_H + 18}
              style={{
                textAnchor: "middle",
                fontSize: "var(--d-small)",
                fill: "var(--text-muted)",
                x: px(LABEL_W + w(t)),
                transition: "x .5s var(--ease-out)",
              } as CSSProperties}
            >
              {t.toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const total = d.Conforme + d["Não Conforme"];
          const y = TOP + i * ROW_H;
          const dim = hover !== null && hover.i !== i;
          // Staggered glide: each row trails the previous one on updates.
          const delay = `${Math.min(i * 45, 360)}ms`;
          const wC = Math.max(w(d.Conforme), d.Conforme > 0 ? 2 : 0);
          // wN: Não Conforme segment width; 2px minimum keeps small values visible.
          const wN = Math.max(
            w(d["Não Conforme"]),
            d["Não Conforme"] > 0 ? 2 : 0,
          );
          const barT =
            `width .55s var(--ease-out) ${delay}, x .55s var(--ease-out) ${delay}, opacity .3s var(--ease-std)`;
          return (
            <g
              key={d.name}
              className="animate-chart-row"
              onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              style={{
                opacity: dim ? 0.35 : 1,
                transition: "opacity .22s var(--ease-std)",
                animationDelay: `${Math.min(i * 45, 360)}ms`,
              }}
            >
              <text
                x={LABEL_W - 8}
                y={y + 14}
                style={{
                  textAnchor: "end",
                  fontSize: "var(--d-small)",
                  fill: "var(--text-secondary)",
                }}
              >
                {d.name}
                <title>{d.name}</title>
              </text>
              <rect
                x={LABEL_W}
                y={y}
                width={wC}
                height={BAR_H}
                rx={d["Não Conforme"] === 0 ? 4 : 0}
                fill="#22c55e"
                style={{
                  x: px(LABEL_W),
                  width: px(wC),
                  transition: barT,
                } as CSSProperties}
              />
              <rect
                x={LABEL_W + w(d.Conforme)}
                y={y}
                width={wN}
                height={BAR_H}
                rx={4}
                fill="#ef4444"
                style={{
                  x: px(LABEL_W + w(d.Conforme)),
                  width: px(wN),
                  transition: barT,
                } as CSSProperties}
              />
              {/* hover target covering the full row width */}
              <rect
                x={LABEL_W}
                y={y - 4}
                width={PLOT_W}
                height={ROW_H}
                fill="transparent"
              />
              {total > 0 && (
                <text
                  key={total}
                  className="animate-num"
                  x={LABEL_W + w(total) + 8}
                  y={y + 14}
                  style={{
                    fontSize: "var(--d-small)",
                    fill: "var(--text-muted)",
                    x: px(LABEL_W + w(total) + 8),
                    transition: "x .55s var(--ease-out)",
                  } as CSSProperties}
                >
                  {total.toLocaleString("pt-BR")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && hover && (
        <ChartTooltip
          x={hover.x}
          y={hover.y}
          title={hovered.name}
          conforme={hovered.Conforme}
          naoConforme={hovered["Não Conforme"]}
        />
      )}
      <div
        style={{
          display: "flex",
          gap: "var(--d-gap-lg)",
          fontSize: "var(--d-small)",
          color: "var(--text-muted)",
          paddingTop: "var(--d-bar-gap)",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#22c55e",
              marginRight: 6,
            }}
          />
          Conforme
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#ef4444",
              marginRight: 6,
            }}
          />
          Não Conforme
        </span>
      </div>
    </div>
  );
}

// Floating chart tooltip — portalled to document.body so no ancestor
// stacking context (animated wrappers, scroll container) can trap it under
// later cards/tables, and clamped to the viewport so it flips to the
// left/above the cursor near the right/bottom edges instead of leaving
// the screen. Hidden until measured to avoid a one-frame flash.
function ChartTooltip(
  { x, y, title, conforme, naoConforme }: {
    x: number;
    y: number;
    title: string;
    conforme: number;
    naoConforme: number;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Runs client-side only, so viewport globals are safe to read here.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth || 260;
    const h = el.offsetHeight || 110;
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    let left = x + TIP_OFFSET;
    if (left + w + TIP_MARGIN > vw) left = x - w - TIP_OFFSET;
    left = Math.min(
      Math.max(TIP_MARGIN, left),
      Math.max(TIP_MARGIN, vw - w - TIP_MARGIN),
    );
    let top = y + TIP_OFFSET;
    if (top + h + TIP_MARGIN > vh) top = y - h - TIP_OFFSET;
    top = Math.min(
      Math.max(TIP_MARGIN, top),
      Math.max(TIP_MARGIN, vh - h - TIP_MARGIN),
    );
    setPos({ left, top });
  }, [x, y, title, conforme, naoConforme]);

  // SSR: no hover exists on the server, but guard the portal anyway.
  if (typeof document === "undefined") return null;

  const tip = (
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
        zIndex: TIP_Z,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--d-input-radius)",
        padding: "var(--d-tip-pad)",
        fontSize: "var(--d-body)",
        boxShadow: "var(--shadow-md)",
        pointerEvents: "none",
        maxWidth: 260,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--d-opt-gap)",
          color: "#22c55e",
          fontWeight: 600,
          marginBottom: 3,
        }}
      >
        <span>Conforme:</span>
        <span>{conforme.toLocaleString("pt-BR")}</span>
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--d-opt-gap)",
          color: "#ef4444",
          fontWeight: 600,
        }}
      >
        <span>Não Conforme:</span>
        <span>{naoConforme.toLocaleString("pt-BR")}</span>
      </div>
    </div>
  );
  return createPortal(tip, document.body);
}
