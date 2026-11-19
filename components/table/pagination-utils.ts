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
  // Paint the gradient across the whole border-box: the default
  // padding-box origin leaves the 1px border ring and the rounded corner
  // slivers of the active chip unpainted, leaking the flat page canvas as
  // a minuscule off-gradient pixel at each corner.
  backgroundOrigin: "border-box",
  color: active ? "#fff" : disabled ? AURORA.sub : AURORA.pillText,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.35 : 1,
  boxShadow: active ? AURORA.auroraGlow : "none",
  transition: "all .2s var(--ease-std)",
});

// buildPages: windowed page list (cur ± 1 plus first/last with "…"); returns
// all pages when tot <= 7. The window widens at the outer edges so the first
// and last sections always keep three consecutive pages (page 3 stays
// reachable from page 1), and an ellipsis that would hide a single page
// renders that page instead - the same cell count, one more reachable page.
export function buildPages(cur: number, tot: number): (number | "…")[] {
  if (tot < 1) return [1];
  if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1);
  const c = Math.min(Math.max(cur, 1), tot);
  // Interior window: cur ± 1 clipped into 2..tot-1, widened so each edge
  // section shows at least three pages before or after its ellipsis.
  const lo = Math.min(Math.max(2, c - 1), Math.max(2, tot - 2));
  const hi = Math.max(Math.min(tot - 1, c + 1), Math.min(3, tot - 1));
  const cells: (number | "…")[] = [1];
  if (lo > 2) cells.push("…");
  for (let p = lo; p <= hi; p++) cells.push(p);
  if (hi < tot - 1) cells.push("…");
  cells.push(tot);
  // An ellipsis over exactly one page is a dead cell: render the page it
  // hides (Pagination replaces only the LAST "…" with the go-to input, so
  // collapsing it keeps the pager layout honest).
  for (let i = 1; i < cells.length - 1; i++) {
    const prev = cells[i - 1];
    const next = cells[i + 1];
    if (
      cells[i] === "…" && typeof prev === "number" &&
      typeof next === "number" && next - prev === 2
    ) {
      cells[i] = prev + 1;
    }
  }
  return cells;
}
