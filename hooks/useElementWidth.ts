// useElementWidth - measures an element's rendered width, live.
// Why it exists: the compliance chart draws an SVG whose viewBox has to match
// the real pixel width of its grid column, otherwise the browser scales and
// letterboxes the drawing (dead space above and below it, or margins at the
// sides). A ResizeObserver reports that width; SSR and environments without
// the observer fall back to a default plus window resize events, so the hook
// never blocks the first paint.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

// Width used before the first measurement (SSR and the first client render),
// close enough to the real column that the swap is not visible.
const FALLBACK_WIDTH = 640;

export interface ElementWidth {
  ref: (el: HTMLElement | null) => void;
  width: number;
}

// useElementWidth: returns a stable ref callback plus the measured content
// width, rounded to whole pixels so sub-pixel jitter never re-renders. Zero
// means "not measurable yet" (detached or hidden), which callers treat as
// unknown. The callbacks are stable, so a re-render (a hover, a filter change)
// never forces a fresh layout read - only a real resize does.
export function useElementWidth(fallback = FALLBACK_WIDTH): ElementWidth {
  const [width, setWidth] = useState(fallback);
  const node = useRef<HTMLElement | null>(null);
  // Reads the box and publishes it only when it actually changed.
  const measure = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const next = Math.round(el.getBoundingClientRect().width);
    if (next > 0) setWidth((prev) => (prev === next ? prev : next));
  }, []);
  const ref = useCallback((el: HTMLElement | null) => {
    node.current = el;
    if (el) measure();
  }, [measure]);
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") {
      // No observer (older engines, non-DOM test shims): window resize is the
      // only signal available, which is enough because the column only
      // changes with the viewport or a density switch.
      globalThis.addEventListener("resize", measure);
      return () => globalThis.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  return { ref, width };
}
