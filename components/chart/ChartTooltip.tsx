// ChartTooltip - floating hover card for conformidade rows, portalled to body.
// Why it exists: keeps viewport-clamped tooltip logic out of the chart frame
// so the SVG shell stays small and the positioning math is isolated here.
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { TIP_MARGIN, TIP_OFFSET, TIP_Z } from "./geometry.ts";
import { createPortal } from "preact/compat";

interface Props {
  x: number;
  y: number;
  title: string;
  conforme: number;
  naoConforme: number;
}

// clampTooltip: flip left/above near viewport edges, then clamp to margins.
export function clampTooltip(
  x: number,
  y: number,
  tipW: number,
  tipH: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  // Start offset from the cursor, flip when overflowing the viewport.
  let left = x + TIP_OFFSET;
  if (left + tipW + TIP_MARGIN > vw) left = x - tipW - TIP_OFFSET;
  left = Math.min(
    Math.max(TIP_MARGIN, left),
    Math.max(TIP_MARGIN, vw - tipW - TIP_MARGIN),
  );
  // Same flip logic for the vertical axis.
  let top = y + TIP_OFFSET;
  if (top + tipH + TIP_MARGIN > vh) top = y - tipH - TIP_OFFSET;
  top = Math.min(
    Math.max(TIP_MARGIN, top),
    Math.max(TIP_MARGIN, vh - tipH - TIP_MARGIN),
  );
  return { left, top };
}

// Floating chart tooltip — portalled to document.body so no ancestor
// stacking context (animated wrappers, scroll container) can trap it under
// later cards/tables, and clamped to the viewport so it flips to the
// left/above the cursor near the right/bottom edges instead of leaving
// the screen. Hidden until measured to avoid a one-frame flash.
export function ChartTooltip(
  { x, y, title, conforme, naoConforme }: Props,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Runs client-side only, so viewport globals are safe to read here.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tipW = el.offsetWidth || 260;
    const tipH = el.offsetHeight || 110;
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    setPos(clampTooltip(x, y, tipW, tipH, vw, vh));
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
        overflowWrap: "break-word",
        minWidth: 120,
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
