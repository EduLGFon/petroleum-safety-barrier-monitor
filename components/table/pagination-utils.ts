// Pagination helpers - pure page-window math plus pager button style.
// Why: keeps the Pagination component focused on state/render while math stays testable.
import { AURORA } from "../../lib/aurora.ts";
import type { CSSProperties } from "preact";

// bs: button style for pager cells; active gets gradient + glow, disabled dims and blocks pointer.
export const bs = (active: boolean, disabled: boolean): CSSProperties => ({
  minWidth: "var(--d-page-btn)",
  height: "var(--d-page-btn)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 var(--d-opt-gap)",
  fontSize: "var(--d-body)",
  fontWeight: active ? 700 : 500,
  border: active ? "1px solid transparent" : `1px solid ${AURORA.dataBorder}`,
  borderRadius: "var(--d-chip-radius)",
  background: active ? AURORA.grad : AURORA.data,
  color: active ? "#fff" : disabled ? AURORA.sub : AURORA.pillText,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.35 : 1,
  boxShadow: active ? AURORA.auroraGlow : "none",
  transition: "all .2s var(--ease-std)",
});

// buildPages: windowed page list (cur ± 1 plus first/last with "…"); returns all pages when tot <= 7.
export function buildPages(cur: number, tot: number): (number | "…")[] {
  if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1);
  const r: (number | "…")[] = [1];
  if (cur > 3) r.push("…");
  for (let p = Math.max(2, cur - 1); p <= Math.min(tot - 1, cur + 1); p++) {
    r.push(p);
  }
  if (cur < tot - 2) r.push("…");
  r.push(tot);
  return r;
}
