// ColumnsMenu - table column visibility + order dialog.
// Why: the ledger columns are switchable (show/hide/reorder) without code
// changes; one dialog owns the toggle list so headers, filter row and rows
// stay driven by the same visibleCols order. The panel portals to
// document.body with an opaque surface, so ancestor transforms, stacking
// contexts and backdrop blurs can never hide or bleach it.
import {
  type ColumnKey,
  defFor,
  MENU_ORDER,
  PINNED_FILTERS,
  type PinnedKey,
} from "./columns.ts";

import { useEffect, useRef, useState } from "preact/hooks";

import { ColumnsIcon } from "../ui/Icons.tsx";

import { createPortal } from "preact/compat";

import { AURORA } from "../../lib/aurora.ts";

interface Props {
  visible: ColumnKey[];
  onToggle: (key: ColumnKey) => void;
  onMove: (key: ColumnKey, dir: -1 | 1) => void;
  onReset: () => void;
  // Pinned filter columns (Plano/Período) hidden by the user.
  hiddenPinned: PinnedKey[];
  onTogglePinned: (key: PinnedKey) => void;
}

// ColumnsMenu: icon-only button opening a centered dialog with a
// checkbox list in canonical order; visible rows carry ←/→ order buttons.
// Backdrop click, Escape, or Concluir closes it. Hiding the last visible
// column is refused by state, so the dialog needs no empty-state guard.
export function ColumnsMenu(
  { visible, onToggle, onMove, onReset, hiddenPinned, onTogglePinned }: Props,
) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  // Escape closes while open; opening moves focus into the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    globalThis.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Escolher colunas da tabela"
        title="Colunas"
        className="lift"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--d-input-y) var(--d-input-x)",
          background: AURORA.seg,
          border: `1px solid ${AURORA.segBorder}`,
          borderRadius: 10,
          color: AURORA.pillText,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <ColumnsIcon size={14} color={AURORA.sub} />
      </button>
      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            role="presentation"
            onMouseDown={close}
            className="animate-fade-in"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 950,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(2,6,23,.6)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Colunas da tabela"
              tabIndex={-1}
              onMouseDown={(e) => e.stopPropagation()}
              className="animate-scale-in"
              style={{
                width: "min(380px, 92vw)",
                maxHeight: "70dvh",
                overflowY: "auto",
                outline: "none",
                background: AURORA.dialog,
                border: `1px solid ${AURORA.segBorder}`,
                borderRadius: 14,
                boxShadow: "0 24px 70px rgba(0,0,0,.55)",
                padding: "var(--d-dialog-body)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "var(--d-opt-gap)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--d-lead)",
                    fontWeight: 700,
                    color: AURORA.pillText,
                  }}
                >
                  Colunas da tabela
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar"
                  style={{
                    padding: "2px 9px",
                    fontSize: "var(--d-body)",
                    background: "transparent",
                    border: `1px solid ${AURORA.segBorder}`,
                    borderRadius: 7,
                    color: AURORA.label,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
              {MENU_ORDER.map((key) => {
                const on = visible.includes(key);
                const at = visible.indexOf(key);
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--d-mini-gap)",
                      padding: "6px 10px",
                      borderRadius: 7,
                      background: on ? "var(--glow)" : "transparent",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--d-mini-gap)",
                        flex: 1,
                        minWidth: 0,
                        fontSize: "var(--d-body)",
                        color: on ? "var(--accent-2)" : AURORA.pillText,
                        fontWeight: on ? 700 : 400,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(key)}
                        aria-label={`Mostrar coluna ${defFor(key).label}`}
                      />
                      {defFor(key).label}
                    </label>
                    <button
                      type="button"
                      disabled={!on || at <= 0}
                      onClick={() => onMove(key, -1)}
                      aria-label={`Mover ${defFor(key).label} para a esquerda`}
                      style={moveBtn(!on || at <= 0)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={!on || at < 0 || at >= visible.length - 1}
                      onClick={() => onMove(key, 1)}
                      aria-label={`Mover ${defFor(key).label} para a direita`}
                      style={moveBtn(!on || at < 0 || at >= visible.length - 1)}
                    >
                      →
                    </button>
                  </div>
                );
              })}
              <div
                style={{
                  marginTop: "var(--d-opt-gap)",
                  paddingTop: "var(--d-opt-gap)",
                  borderTop: `1px solid ${AURORA.segBorder}`,
                }}
              >
                <div
                  style={{
                    padding: "0 10px 4px",
                    fontSize: "var(--d-micro)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: AURORA.sub,
                  }}
                >
                  Filtros
                </div>
                {PINNED_FILTERS.map(({ key, label }) => {
                  const on = !hiddenPinned.includes(key);
                  return (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--d-mini-gap)",
                        padding: "6px 10px",
                        borderRadius: 7,
                        background: on ? "var(--glow)" : "transparent",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--d-mini-gap)",
                          flex: 1,
                          minWidth: 0,
                          fontSize: "var(--d-body)",
                          color: on ? "var(--accent-2)" : AURORA.pillText,
                          fontWeight: on ? 700 : 400,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => onTogglePinned(key)}
                          aria-label={`Mostrar filtro ${label}`}
                        />
                        {label}
                      </label>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--d-opt-gap)",
                  marginTop: "var(--d-opt-gap)",
                }}
              >
                <button
                  type="button"
                  onClick={onReset}
                  style={{
                    flex: 1,
                    padding: "var(--d-input-y) var(--d-input-x)",
                    fontSize: "var(--d-body)",
                    fontWeight: 600,
                    background: "transparent",
                    border: `1px solid ${AURORA.segBorder}`,
                    borderRadius: 8,
                    color: AURORA.label,
                    cursor: "pointer",
                  }}
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    flex: 1,
                    padding: "var(--d-input-y) var(--d-input-x)",
                    fontSize: "var(--d-body)",
                    fontWeight: 700,
                    background: "var(--accent)",
                    border: "1px solid var(--accent)",
                    borderRadius: 8,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// moveBtn: order-arrow style; disabled arrows fade and ignore pointer.
function moveBtn(disabled: boolean): Record<string, string | number> {
  return {
    padding: "2px 7px",
    fontSize: "var(--d-body)",
    background: "transparent",
    border: `1px solid ${AURORA.segBorder}`,
    borderRadius: 6,
    color: disabled ? "var(--text-muted)" : AURORA.pillText,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "default" : "pointer",
  };
}
