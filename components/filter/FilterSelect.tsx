// FilterSelect - controlled faceted combobox plus shared glass input style.
// Why: filter selects stay tiny (title width) until focused, then grow to fit
// the longest option while the user types to narrow the option menu. The menu
// portals to document.body so animated sections and backdrop-blur cards (both
// trap stacking contexts) can never paint over the options.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { AURORA } from "../../lib/aurora.ts";

// Shared glass style for search input and selects.
export const GLASS_INPUT = {
  background: AURORA.seg,
  border: `1px solid ${AURORA.segBorder}`,
  borderRadius: 10,
  color: AURORA.pillText,
  outline: "none",
} as const;

// Longest option length, so the open box fits the biggest value.
function widest(opts: string[]): number {
  let n = 0;
  for (const o of opts) n = Math.max(n, o.length);
  return n;
}

// MenuPortal: fixed-position menu portalled to document.body on open.
// Declarative createPortal keeps the menu in the same Preact tree (no manual
// render() root to tear down), so repositioning on scroll/resize never
// destroys the menu node mid-scroll and can never throw into the boundary.
// The wrapper div carries the fixed geometry; the opaque blurred <ul> inside
// paints over rows/cards on every theme.
function MenuPortal({ left, top, width, children }: {
  left: number;
  top: number;
  width: string;
  children: ComponentChildren;
}) {
  // SSR: no document to portal into; the caller gates on anchor.min > 0,
  // which only happens client-side after measuring the input rect.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        width,
        zIndex: 900,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// Combo: controlled combobox bound to an exact option value. Collapsed it is
// only as wide as its title; focused it grows to the longest option and
// offers the matching options as a menu while the user types. Typing an
// exact (case-insensitive) option and pressing Enter commits it; Escape or
// blurring with no match reverts to the current value.
export function Combo(
  { value, onChange, placeholder, opts }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    opts: string[];
  },
) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [anchor, setAnchor] = useState({ left: 0, top: 0, min: 0 });
  const input = useRef<HTMLInputElement>(null);
  const active = !!value;
  // External value changes (reset, restored state) win while closed.
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);
  // Track the input rect while open so the menu follows page scroll/resize.
  // No capture: window scroll (bubble) fires for document scrolls only, so
  // scrolling the option list itself never re-renders the menu mid-gesture.
  // rAF-throttled plus an equality guard, so flinging the page issues at
  // most one state update per frame and identical rects skip render storms.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const place = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = input.current?.getBoundingClientRect();
        if (!r) return;
        const next = {
          left: Math.round(r.left),
          top: Math.round(r.bottom + 4),
          min: Math.round(r.width),
        };
        setAnchor((prev) =>
          prev.left === next.left && prev.top === next.top &&
            prev.min === next.min
            ? prev
            : next
        );
      });
    };
    place();
    globalThis.addEventListener("scroll", place, { passive: true });
    globalThis.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      globalThis.removeEventListener("scroll", place);
      globalThis.removeEventListener("resize", place);
    };
  }, [open]);
  const q = draft.trim().toLowerCase();
  const shown = q === ""
    ? opts
    : opts.filter((o) => o.toLowerCase().includes(q));
  const match = opts.find((o) => o.toLowerCase() === q);
  const commit = (v: string) => {
    setDraft(v);
    setOpen(false);
    if (v !== value) onChange(v);
  };
  const narrow = `${placeholder.length + 4}ch`;
  const wide = `${
    Math.min(Math.max(placeholder.length, widest(opts), value.length) + 4, 42)
  }ch`;
  return (
    <div
      style={{
        position: "relative",
        flex: "0 1 auto",
        minWidth: 0,
        width: open ? wide : narrow,
        transition: "width .2s var(--ease-out)",
      }}
    >
      <input
        ref={input}
        type="text"
        value={open ? draft : value}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded={open}
        role="combobox"
        autoComplete="off"
        spellcheck={false}
        title={value || placeholder}
        onFocus={() => {
          setDraft(value);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          if (match && match !== value) onChange(match);
          else setDraft(value);
        }}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (match) commit(match);
            else if (shown.length === 1) commit(shown[0]!);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setOpen(false);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={active ? "animate-filter-on" : ""}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "var(--d-sel-pad)",
          fontSize: "var(--d-body)",
          ...GLASS_INPUT,
          border: active || open
            ? "1px solid var(--accent)"
            : `1px solid ${AURORA.segBorder}`,
          color: active || open ? AURORA.value : AURORA.label,
          fontWeight: active ? 700 : 400,
          boxShadow: active || open ? "0 0 0 3px var(--glow)" : "none",
          transition: "border .2s var(--ease-std), box-shadow .2s",
          textOverflow: "ellipsis",
        }}
      />
      {open && anchor.min > 0 && (
        <MenuPortal
          left={anchor.left}
          top={anchor.top}
          width={`max(${wide}, ${anchor.min}px)`}
        >
          <ul
            role="listbox"
            style={{
              margin: 0,
              padding: 4,
              listStyle: "none",
              maxHeight: 240,
              overflowY: "auto",
              // Opaque + blurred: solid dialog surface blurs whatever scrolls
              // underneath instead of the near-transparent elevated wash that
              // let rows bleed through the text.
              background: AURORA.dialog,
              backdropFilter: "blur(16px) saturate(1.25)",
              WebkitBackdropFilter: "blur(16px) saturate(1.25)",
              border: `1px solid ${AURORA.segBorder}`,
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,.35)",
            }}
          >
            <li
              role="option"
              aria-selected={value === ""}
              onMouseDown={(e) => {
                e.preventDefault();
                commit("");
              }}
              style={{
                padding: "6px 10px",
                fontSize: "var(--d-body)",
                borderRadius: 7,
                cursor: "pointer",
                color: value === "" ? "var(--accent-2)" : AURORA.label,
                fontWeight: value === "" ? 700 : 400,
                background: value === "" ? "var(--glow)" : "transparent",
              }}
            >
              {placeholder} (todas)
            </li>
            {shown.map((o) => (
              <li
                key={o}
                role="option"
                aria-selected={o === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                style={{
                  padding: "6px 10px",
                  fontSize: "var(--d-body)",
                  borderRadius: 7,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: o === value ? "var(--accent-2)" : AURORA.pillText,
                  fontWeight: o === value ? 700 : 400,
                  background: o === value ? "var(--glow)" : "transparent",
                }}
              >
                {o}
              </li>
            ))}
            {shown.length === 0 && (
              <li
                style={{
                  padding: "6px 10px",
                  fontSize: "var(--d-body)",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                Sem opções
              </li>
            )}
          </ul>
        </MenuPortal>
      )}
    </div>
  );
}
