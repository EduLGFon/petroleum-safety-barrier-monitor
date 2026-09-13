// SettingsPanel - slide-over dialog for appearance and default filters.
// This is why it exists: centralizes theme / accent / density / reduce-motion
// plus startup filter defaults from SettingsContext.
import {
  type AccentColor,
  type Density,
  useSettings,
} from "../context/SettingsContext.tsx";
import { PanelFooter, PanelHeader } from "./settings/PanelChrome.tsx";
import { AppearanceSection } from "./settings/AppearanceSection.tsx";
import { FiltersSection } from "./settings/FiltersSection.tsx";
import { lockBody, unlockBody } from "../lib/body-lock.ts";
import { FilterIcon, SunIcon } from "./ui/Icons.tsx";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Theme } from "../lib/types.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  companyName: string;
}

// SettingsPanel: slide-over dialog hosting appearance and filters sections.
export function SettingsPanel({ open, onClose, companyName }: Props) {
  const {
    settings,
    setTheme,
    setAccent,
    setDensity,
    setDefaults,
    setDefaultLoc,
    setReduceMotion,
  } = useSettings();
  const [section, setSection] = useState<"appearance" | "filters">(
    "appearance",
  );
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [activeAccent, setActiveAccent] = useState<AccentColor | null>(null);
  const [activeDensity, setActiveDensity] = useState<Density | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Shared counter with BarrierModal: scroll resumes only after the last
  // overlay closes, so closing the panel cannot unlock scroll under the modal.
  useEffect(() => {
    if (open) {
      lockBody();
      return () => unlockBody();
    }
  }, [open]);

  // handleTheme: applies the theme with a brief press animation.
  const handleTheme = (t: Theme) => {
    setActiveTheme(t);
    setTheme(t);
    setTimeout(() => setActiveTheme(null), 350);
  };
  // handleAccent: applies the accent color with a brief press animation.
  const handleAccent = (c: AccentColor) => {
    setActiveAccent(c);
    setAccent(c);
    setTimeout(() => setActiveAccent(null), 350);
  };
  // handleDensity: applies the density with a brief press animation.
  const handleDensity = (d: Density) => {
    setActiveDensity(d);
    setDensity(d);
    setTimeout(() => setActiveDensity(null), 350);
  };

  // Focus management: remember the trigger on open, focus the panel, restore
  // the trigger on close so keyboard users land back where they started.
  const panelRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const activeEl = () => document.activeElement as HTMLElement | null;
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = activeEl();
      panelRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [open]);
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !open) return;
    const root = panelRef.current;
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
      {/* Backdrop */}
      <div
        inert={!open}
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,.5)",
          backdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .28s var(--ease-std)",
        }}
      />

      {/* Panel */}
      <aside
        inert={!open}
        role="dialog"
        aria-label="Configurações"
        aria-hidden={!open}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={trapTab}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: "var(--d-panel-w)",
          maxWidth: "96vw",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .32s var(--ease-out)",
          boxShadow: open ? "var(--shadow-lg)" : "none",
        }}
      >
        {/* Header */}
        <PanelHeader companyName={companyName} onClose={onClose} />

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            flexShrink: 0,
          }}
        >
          {[{ key: "appearance", label: "Aparência", Icon: SunIcon }, {
            key: "filters",
            label: "Filtros",
            Icon: FilterIcon,
          }].map((
            { key, label, Icon },
          ) => (
            <button
              type="button"
              key={key}
              onClick={() => setSection(key as never)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--d-gap-2xs)",
                padding: "var(--d-panel-tab)",
                fontSize: "var(--d-caption)",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                color: section === key ? "var(--accent)" : "var(--text-muted)",
                borderBottom: section === key
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                transition: "all .2s",
                marginBottom: -1,
              }}
            >
              <Icon
                size={14}
                color={section === key ? "var(--accent)" : "var(--text-muted)"}
                strokeWidth={2}
              />
              {label}
            </button>
          ))}
        </div>

        {/* ── APPEARANCE ── */}
        {section === "appearance" && (
          <AppearanceSection
            settings={settings}
            activeTheme={activeTheme}
            activeDensity={activeDensity}
            activeAccent={activeAccent}
            onTheme={handleTheme}
            onDensity={handleDensity}
            onAccent={handleAccent}
            onReduceMotion={setReduceMotion}
          />
        )}

        {/* ── FILTERS ── */}
        {section === "filters" && (
          <FiltersSection
            settings={settings}
            setDefaults={setDefaults}
            setDefaultLoc={setDefaultLoc}
          />
        )}

        {/* Footer */}
        <PanelFooter companyName={companyName} />
      </aside>
    </>
  );
}
