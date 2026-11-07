// SearchMultiSelect - searchable multi-selection field for settings pages.
// This is why it exists: station, user, recipient, and rule-scope pickers all
// need the same premium chips, search, select-all, and keyboard behaviour.
// The menu portals to document.body with z-index 1300, above the settings
// workspace (1001) and the rule editor (1200), so no dialog stacking context
// can paint over it.
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";

import { ChevronDownIcon, CloseIcon, SearchIcon } from "../ui/Icons.tsx";

import { createPortal } from "preact/compat";

import { AURORA } from "../../lib/aurora.ts";

export type SearchKey = number | string;

export interface SearchOption<K extends SearchKey = SearchKey> {
  id: K;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface SearchMultiSelectProps<K extends SearchKey = SearchKey> {
  label: string;
  options: SearchOption<K>[];
  selected: K[];
  onChange: (selected: K[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  maxPanelHeight?: number;
  showSelectAll?: boolean;
  helpText?: string;
}

interface Anchor {
  left: number;
  width: number;
  maxHeight: number;
  top: number | null;
  bottom: number | null;
}

const fieldSt = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  padding: "5px 8px",
  background: AURORA.seg,
  border: `1px solid ${AURORA.segBorder}`,
  borderRadius: 10,
  transition: "border-color .18s var(--ease-std), box-shadow .18s",
} as const;

const chipSt = {
  maxWidth: 150,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "1px 7px",
  borderRadius: 6,
  background: "color-mix(in srgb,var(--accent) 14%,transparent)",
  color: "var(--accent)",
  fontSize: "var(--d-caption)",
  fontWeight: 700,
} as const;

const actionSt = {
  border: "none",
  background: "transparent",
  color: "var(--accent)",
  fontSize: "var(--d-small)",
  fontWeight: 600,
  cursor: "pointer",
  padding: "3px 5px",
  borderRadius: 6,
} as const;

// placePanel: viewport-clamped fixed geometry with a flip above the trigger
// when the space below is too small. Mirrors FilterSelect's rAF anchoring.
function placePanel(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  maxPanelHeight: number,
): Anchor {
  const width = Math.min(
    Math.max(Math.round(rect.width), 300),
    Math.min(460, viewportWidth - 16),
  );
  const left = Math.min(
    Math.max(8, Math.round(rect.left)),
    Math.max(8, viewportWidth - width - 8),
  );
  const roomBelow = viewportHeight - rect.bottom - 10;
  const roomAbove = rect.top - 10;
  const cap = Math.max(180, Math.min(maxPanelHeight, viewportHeight - 24));
  const openUp = roomBelow < Math.min(cap, 240) && roomAbove > roomBelow;
  const maxHeight = Math.max(
    160,
    Math.min(cap, Math.round(openUp ? roomAbove : roomBelow)),
  );
  return openUp
    ? {
      left,
      width,
      maxHeight,
      top: null,
      bottom: Math.round(viewportHeight - rect.top + 6),
    }
    : {
      left,
      width,
      maxHeight,
      top: Math.round(rect.bottom + 6),
      bottom: null,
    };
}

function sameAnchor(a: Anchor, b: Anchor): boolean {
  return a.left === b.left && a.width === b.width &&
    a.maxHeight === b.maxHeight && a.top === b.top && a.bottom === b.bottom;
}

// SearchMultiSelect: controlled multi-select with searchable portalled menu.
export function SearchMultiSelect<K extends SearchKey = SearchKey>(
  {
    label,
    options,
    selected,
    onChange,
    placeholder = "Selecionar...",
    searchPlaceholder = "Buscar opções...",
    emptyText = "Nenhuma opção encontrada.",
    disabled = false,
    maxPanelHeight = 340,
    showSelectAll = true,
    helpText,
  }: SearchMultiSelectProps<K>,
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  // Off-screen until the first measurement so the portal never flashes at
  // the top-left corner before the rAF anchor lands.
  const [anchor, setAnchor] = useState<Anchor>({
    left: -10000,
    width: 320,
    maxHeight: 320,
    top: -10000,
    bottom: null,
  });
  const uid = useId();
  const labelId = `sms-label-${uid}`;
  const listId = `sms-list-${uid}`;
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.id)),
    [options, selectedSet],
  );
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (query === "") return options;
    return options.filter((option) =>
      `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(query)
    );
  }, [options, query]);
  const visibleEnabled = useMemo(
    () => filtered.filter((option) => !option.disabled),
    [filtered],
  );

  // Focus the search field as soon as the portalled menu exists.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setActiveIndex(-1);
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Follow the trigger while the page or viewport moves.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const place = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const next = placePanel(
          trigger.getBoundingClientRect(),
          globalThis.innerWidth,
          globalThis.innerHeight,
          maxPanelHeight,
        );
        setAnchor((current) => sameAnchor(current, next) ? current : next);
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
  }, [open, maxPanelHeight]);

  // Click-outside closes; clicks inside the trigger or the portal do not.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const closePanel = () => {
    setOpen(false);
    mainRef.current?.focus();
  };

  const toggleOption = (option: SearchOption<K>) => {
    if (option.disabled) return;
    const next = new Set(selectedSet);
    if (next.has(option.id)) next.delete(option.id);
    else next.add(option.id);
    // Keep chips in option order instead of click order.
    onChange(
      options.filter((item) => next.has(item.id)).map((item) => item.id),
    );
  };

  const selectVisible = () => {
    if (visibleEnabled.length === 0) return;
    const next = new Set(selectedSet);
    for (const option of visibleEnabled) next.add(option.id);
    onChange(
      options.filter((item) => next.has(item.id)).map((item) => item.id),
    );
  };

  const focusRow = (index: number) => {
    if (index < 0 || index >= filtered.length) return;
    const row = optionRefs.current[index];
    if (!row) return;
    setActiveIndex(index);
    row.focus();
  };

  const moveRow = (index: number, delta: number) => {
    let next = index + delta;
    while (next >= 0 && next < filtered.length) {
      if (!filtered[next]?.disabled) {
        focusRow(next);
        return;
      }
      next += delta;
    }
  };

  const firstEnabled = (): number => {
    for (let i = 0; i < filtered.length; i++) {
      if (!filtered[i]?.disabled) return i;
    }
    return -1;
  };

  const onSearchKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const index = firstEnabled();
      if (index >= 0) focusRow(index);
      return;
    }
    if (event.key === "Enter") {
      const only = filtered.length === 1 ? filtered[0] : undefined;
      const active = activeIndex >= 0 ? filtered[activeIndex] : undefined;
      const target = active ?? only;
      if (target && !target.disabled) {
        event.preventDefault();
        toggleOption(target);
      }
    }
  };

  const onRowKey = (event: KeyboardEvent, index: number) => {
    const option = filtered[index];
    if (!option) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleOption(option);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveRow(index, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveRow(index, -1);
    }
  };

  const onPanelKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  };

  const showClear = selectedOptions.length > 0;
  const activeOption = activeIndex >= 0 ? filtered[activeIndex] : undefined;

  return (
    <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <div
        id={labelId}
        style={{
          fontSize: "var(--d-caption)",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: ".08em",
        }}
      >
        {label}
      </div>

      <div
        ref={triggerRef}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest?.("[data-sms-action]")) {
            return;
          }
          if (!disabled) setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
          }
        }}
        style={{
          ...fieldSt,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          borderColor: open ? "var(--accent)" : AURORA.segBorder,
          boxShadow: open ? "0 0 0 3px var(--glow)" : "none",
        }}
      >
        <button
          ref={mainRef}
          type="button"
          disabled={disabled}
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "wrap",
            border: "none",
            background: "transparent",
            padding: "2px 0",
            textAlign: "left",
            color: AURORA.pillText,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {selectedOptions.length === 0
            ? (
              <span
                style={{
                  fontSize: "var(--d-body)",
                  color: AURORA.label,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {placeholder}
              </span>
            )
            : (
              <>
                {selectedOptions.slice(0, 3).map((option) => (
                  <span key={String(option.id)} style={chipSt}>
                    {option.label}
                  </span>
                ))}
                {selectedOptions.length > 3 && (
                  <span style={chipSt}>+{selectedOptions.length - 3}</span>
                )}
                <span
                  className="tnum"
                  style={{
                    fontSize: "var(--d-caption)",
                    color: AURORA.label,
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedOptions.length}{" "}
                  {selectedOptions.length === 1
                    ? "selecionado"
                    : "selecionados"}
                </span>
              </>
            )}
          <span
            aria-hidden="true"
            style={{
              marginLeft: "auto",
              display: "flex",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform .18s var(--ease-std)",
            }}
          >
            <ChevronDownIcon size={14} color={AURORA.label} />
          </span>
        </button>

        {showClear && (
          <button
            type="button"
            data-sms-action="clear"
            aria-label={`Limpar ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
            style={{
              border: "none",
              background: "transparent",
              padding: 2,
              display: "flex",
              cursor: "pointer",
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            <CloseIcon size={12} color="var(--text-muted)" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {helpText && (
        <div
          style={{
            fontSize: "var(--d-caption)",
            color: "var(--text-muted)",
            lineHeight: 1.45,
          }}
        >
          {helpText}
        </div>
      )}

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            data-search-multi-panel="true"
            role="presentation"
            onKeyDown={onPanelKey}
            style={{
              position: "fixed",
              left: anchor.left,
              top: anchor.top ?? undefined,
              bottom: anchor.bottom ?? undefined,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
              zIndex: 1300,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: AURORA.dialog,
              border: `1px solid ${AURORA.segBorder}`,
              borderRadius: 12,
              boxShadow: "0 18px 48px rgba(0,0,0,.42)",
              contain: "paint",
            }}
          >
            <div
              style={{
                padding: 8,
                borderBottom: `1px solid ${AURORA.segBorder}`,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 10,
                    display: "flex",
                    pointerEvents: "none",
                  }}
                >
                  <SearchIcon size={13} color={AURORA.label} />
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-label={`Buscar ${label}`}
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={activeOption
                    ? `sms-option-${uid}-${activeIndex}`
                    : undefined}
                  autoComplete="off"
                  spellcheck={false}
                  placeholder={searchPlaceholder}
                  value={search}
                  onInput={(event) => {
                    setSearch(event.currentTarget.value);
                    setActiveIndex(-1);
                  }}
                  onKeyDown={onSearchKey}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 10px 8px 31px",
                    fontSize: "var(--d-body)",
                    background: AURORA.seg,
                    border: `1px solid ${AURORA.segBorder}`,
                    borderRadius: 8,
                    color: AURORA.pillText,
                    outline: "none",
                  }}
                />
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "4px 8px",
                borderBottom: `1px solid ${AURORA.segBorder}`,
                flexShrink: 0,
              }}
            >
              {showSelectAll
                ? (
                  <button
                    type="button"
                    onClick={selectVisible}
                    disabled={visibleEnabled.length === 0}
                    style={{
                      ...actionSt,
                      opacity: visibleEnabled.length === 0 ? 0.45 : 1,
                    }}
                  >
                    Selecionar todos ({visibleEnabled.length})
                  </button>
                )
                : <span />}
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={!showClear}
                style={{ ...actionSt, opacity: showClear ? 1 : 0.45 }}
              >
                Limpar
              </button>
            </div>

            <ul
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              aria-label={label}
              style={{
                margin: 0,
                padding: 4,
                listStyle: "none",
                overflowY: "auto",
                overflowX: "hidden",
                flex: "1 1 auto",
                minHeight: 0,
                maxHeight: Math.max(120, anchor.maxHeight - 92),
              }}
            >
              {filtered.map((option, index) => {
                const checked = selectedSet.has(option.id);
                return (
                  <li
                    key={String(option.id)}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    id={`sms-option-${uid}-${index}`}
                    role="option"
                    aria-selected={checked}
                    aria-disabled={option.disabled || undefined}
                    tabIndex={activeIndex === index ? 0 : -1}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => toggleOption(option)}
                    onKeyDown={(event) => onRowKey(event, index)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      borderRadius: 7,
                      cursor: option.disabled ? "not-allowed" : "pointer",
                      opacity: option.disabled ? 0.5 : 1,
                      background: checked
                        ? "color-mix(in srgb,var(--accent) 13%,transparent)"
                        : "transparent",
                      color: checked ? "var(--accent)" : AURORA.pillText,
                      fontSize: "var(--d-body)",
                      fontWeight: checked ? 700 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={option.disabled}
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      style={{
                        accentColor: "var(--accent)",
                        width: 15,
                        height: 15,
                        flexShrink: 0,
                        cursor: "inherit",
                      }}
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {option.label}
                      </span>
                      {option.hint && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "var(--d-caption)",
                            color: "var(--text-muted)",
                            fontWeight: 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {option.hint}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li
                  style={{
                    padding: "10px 9px",
                    fontSize: "var(--d-body)",
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  {emptyText}
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
