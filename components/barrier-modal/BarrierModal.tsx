// BarrierModal - detail dialog for a selected barrier with Details / History tabs.
// This is why it exists: surfaces full metadata, status badges, NC alert, and
// chronological statusHistory without leaving the dashboard grid.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { lockBody, unlockBody } from "../../lib/body-lock.ts";
import { HistoryIcon, InfoIcon } from "../ui/Icons.tsx";
import { BarrierDetails } from "./BarrierDetails.tsx";
import { BarrierHistory } from "./BarrierHistory.tsx";
import { BarrierHeader } from "./BarrierHeader.tsx";
import type { Barrier } from "../../lib/types.ts";
interface Props {
  barrier: Barrier | null;
  onClose: () => void;
}
// BarrierModal renders the detail dialog shell; handles ESC close, body scroll-lock, and backdrop dismiss.
export function BarrierModal({ barrier, onClose }: Props) {
  const [tab, setTab] = useState<"details" | "history">("details");
  const key = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);
  useEffect(() => {
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [key]);
  // Shared counter with SettingsPanel: scroll resumes only after the last
  // overlay closes, so closing one dialog cannot unlock scroll under another.
  useEffect(() => {
    if (barrier) {
      lockBody();
      setTab("details");
      return () => unlockBody();
    }
  }, [barrier]);
  const isOpen = !!barrier;
  // Focus management: remember the trigger on open, focus the dialog, restore
  // the trigger on close so keyboard users land back where they started.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const activeEl = () => document.activeElement as HTMLElement | null;
  useEffect(() => {
    if (barrier) {
      restoreFocusRef.current = activeEl();
      dialogRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [barrier]);
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !isOpen) return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && activeEl() === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && activeEl() === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <>
      <div
        inert={!isOpen}
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 990,
          background: "rgba(0,0,0,.55)",
          backdropFilter: "blur(6px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity .28s var(--ease-std)",
        }}
      />
      <div
        inert={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes da barreira${barrier ? ` ${barrier.tag}` : ""}`}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={trapTab}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 991,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: isOpen ? "auto" : "none",
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={isOpen ? "animate-scale-in" : ""}
          style={{
            width: "100%",
            maxWidth: "var(--d-dialog-w)",
            maxHeight: "90dvh",
            background: "var(--bg-surface)",
            borderRadius: "var(--d-dialog-radius)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "var(--shadow-lg)",
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? "scale(1)" : "scale(0.96)",
            transition:
              "opacity .25s var(--ease-out),transform .25s var(--ease-out)",
          }}
        >
          {barrier && (
            <Content b={barrier} onClose={onClose} tab={tab} setTab={setTab} />
          )}
        </div>
      </div>
    </>
  );
}
// Content renders header/badges, NC alert with days-since logic, and Details/History tab switch.
function Content(
  { b, onClose, tab, setTab }: {
    b: Barrier;
    onClose: () => void;
    tab: "details" | "history";
    setTab: (t: "details" | "history") => void;
  },
) {
  return (
    <>
      <BarrierHeader b={b} onClose={onClose} />
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          flexShrink: 0,
        }}
      >
        {(["details", "history"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--d-gap-xs)",
              padding: "var(--d-dialog-tab)",
              fontSize: "var(--d-body)",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: tab === t ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === t
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              transition: "all .2s",
              marginBottom: -1,
            }}
          >
            {t === "details"
              ? (
                <>
                  <InfoIcon
                    size={14}
                    color={tab === t ? "var(--accent)" : "var(--text-muted)"}
                    strokeWidth={2}
                  />{" "}
                  Detalhes
                </>
              )
              : (
                <>
                  <HistoryIcon
                    size={14}
                    color={tab === t ? "var(--accent)" : "var(--text-muted)"}
                    strokeWidth={2}
                  />{" "}
                  Histórico
                </>
              )}
          </button>
        ))}
      </div>
      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {tab === "details"
          ? <BarrierDetails b={b} />
          : <BarrierHistory b={b} />}
      </div>
    </>
  );
}
