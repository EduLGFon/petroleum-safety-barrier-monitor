// BarrierModal - detail dialog for a selected barrier with Details / History tabs.
// This is why it exists: surfaces full metadata, status badges, NC alert, and
// chronological statusHistory without leaving the dashboard grid.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { HistoryIcon, InfoIcon, PencilIcon } from "../ui/Icons.tsx";

import { BarrierEditor } from "../../islands/BarrierEditor.tsx";

import { lockBody, unlockBody } from "../../lib/body-lock.ts";

import type { AuthUser, Barrier } from "../../lib/types.ts";

import { BarrierDetails } from "./BarrierDetails.tsx";

import { BarrierHistory } from "./BarrierHistory.tsx";

import { BarrierHeader } from "./BarrierHeader.tsx";

type Tab = "details" | "history" | "edit";

interface Props {
  barrier: Barrier | null;
  onClose: () => void;
  sessionUser?: AuthUser | null;
  onSaved?: () => void;
}
// BarrierModal renders the detail dialog shell; handles ESC close, body scroll-lock, and backdrop dismiss.
export function BarrierModal(
  { barrier, onClose, sessionUser, onSaved }: Props,
) {
  const [tab, setTab] = useState<Tab>("details");
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
            <Content
              b={barrier}
              onClose={onClose}
              tab={tab}
              setTab={setTab}
              sessionUser={sessionUser}
              onSaved={onSaved}
            />
          )}
        </div>
      </div>
    </>
  );
}
// Content renders header, NC alert with days-since logic, and tab switch.
// Admins get a third Editar tab hosting the BarrierEditor island.
function Content(
  { b, onClose, tab, setTab, sessionUser, onSaved }: {
    b: Barrier;
    onClose: () => void;
    tab: Tab;
    setTab: (t: Tab) => void;
    sessionUser?: AuthUser | null;
    onSaved?: () => void;
  },
) {
  // Local copy so a save refreshes Details without closing the dialog.
  const [local, setLocal] = useState(b);
  useEffect(() => {
    setLocal(b);
  }, [b]);
  const isAdmin = sessionUser?.role === "admin";
  const tabs: { key: Tab; label: string; Icon: typeof InfoIcon }[] = [
    { key: "details", label: "Detalhes", Icon: InfoIcon },
    { key: "history", label: "Histórico", Icon: HistoryIcon },
    ...(isAdmin
      ? [{ key: "edit" as Tab, label: "Editar", Icon: PencilIcon }]
      : []),
  ];
  return (
    <>
      <BarrierHeader b={local} onClose={onClose} />
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          flexShrink: 0,
        }}
      >
        {tabs.map(({ key, label, Icon }) => (
          <button
            type="button"
            key={key}
            onClick={() => setTab(key)}
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
              color: tab === key ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === key
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              transition: "all .2s",
              marginBottom: -1,
            }}
          >
            <Icon
              size={14}
              color={tab === key ? "var(--accent)" : "var(--text-muted)"}
              strokeWidth={2}
            />{" "}
            {label}
          </button>
        ))}
      </div>
      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {tab === "details" && <BarrierDetails b={local} />}
        {tab === "history" && <BarrierHistory b={local} />}
        {tab === "edit" && isAdmin && (
          <BarrierEditor
            key={local.id}
            barrier={local}
            onSaved={(updated) => {
              if (updated) setLocal(updated);
              setTab("details");
              onSaved?.();
            }}
            onCancel={() => setTab("details")}
          />
        )}
      </div>
    </>
  );
}
