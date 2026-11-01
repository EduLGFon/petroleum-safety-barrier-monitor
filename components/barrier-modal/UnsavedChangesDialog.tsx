// UnsavedChangesDialog - confirm discard of barrier edits before close.
// This is why it exists: closing the editor (X, ESC, backdrop, tab switch,
// Cancel) silently drops form state, so a nested alertdialog gives the user
// a safe default (keep editing) and an explicit discard action.
import { useEffect, useRef } from "preact/hooks";

import { createPortal } from "preact/compat";

import { AURORA } from "../../lib/aurora.ts";

interface Props {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
}

// UnsavedChangesDialog renders a small nested confirm above BarrierModal.
// Escape and backdrop dismiss to onStay, so data loss needs an explicit click.
export function UnsavedChangesDialog({ open, onStay, onDiscard }: Props) {
  const stayRef = useRef<HTMLButtonElement | null>(null);
  // Editor focus captured on open so "Continuar editando" can return focus
  // to the form field the user was editing instead of stranding it on the
  // unmounted dialog button.
  const editorFocusRef = useRef<HTMLElement | null>(null);

  // Escape keeps the user in the editor; focus lands on the safe action.
  useEffect(() => {
    if (!open) return;
    editorFocusRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => stayRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onStay();
      }
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      globalThis.removeEventListener("keydown", onKey, true);
      // Return focus to the editor the user was editing (the confirm's
      // safe path is "keep editing", so the form regains keyboard focus).
      // Guarded by isConnected: a discard unmounts the editor, so only a
      // still-mounted editor regains focus.
      const el = editorFocusRef.current;
      editorFocusRef.current = null;
      if (el?.isConnected) el.focus?.();
    };
  }, [open, onStay]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="presentation"
      onMouseDown={onStay}
      className="animate-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1020,
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
        role="alertdialog"
        aria-modal="true"
        aria-label="Descartar alterações?"
        aria-describedby="unsaved-changes-desc"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-scale-in"
        style={{
          width: "min(400px, 92vw)",
          background: AURORA.dialog,
          border: `1px solid ${AURORA.segBorder}`,
          borderRadius: 14,
          boxShadow: "0 24px 70px rgba(0,0,0,.55)",
          padding: "var(--d-dialog-body)",
        }}
      >
        <div
          style={{
            fontSize: "var(--d-lead)",
            fontWeight: 700,
            color: AURORA.pillText,
          }}
        >
          Descartar alterações?
        </div>
        <p
          id="unsaved-changes-desc"
          style={{
            margin: "8px 0 0",
            fontSize: "var(--d-body)",
            color: AURORA.label,
          }}
        >
          Há alterações não salvas. Se fechar agora, os dados serão perdidos.
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--d-opt-gap)",
            marginTop: "var(--d-opt-gap)",
          }}
        >
          <button
            type="button"
            onClick={onDiscard}
            style={{
              flex: 1,
              padding: "var(--d-input-y) var(--d-input-x)",
              fontSize: "var(--d-body)",
              fontWeight: 600,
              background: "transparent",
              border: "1px solid var(--alert-nc-border)",
              borderRadius: 8,
              color: "var(--alert-nc-text)",
              cursor: "pointer",
            }}
          >
            Descartar
          </button>
          <button
            type="button"
            ref={stayRef}
            onClick={onStay}
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
            Continuar editando
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
