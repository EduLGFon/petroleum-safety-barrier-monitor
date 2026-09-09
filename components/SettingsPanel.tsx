// SettingsPanel - slide-over dialog for appearance, default filters, members.
// This is why it exists: centralizes theme / accent / density / reduce-motion
// plus startup filter defaults from SettingsContext; members tab is future-only.
import {
  type AccentColor,
  type Density,
  useSettings,
} from "../context/SettingsContext.tsx";
import { PanelFooter, PanelHeader } from "./settings/PanelChrome.tsx";
import { FilterIcon, SunIcon, UserIcon } from "./ui/Icons.tsx";
import { AppearanceSection } from "./settings/AppearanceSection.tsx";
import { FiltersSection } from "./settings/FiltersSection.tsx";
import { MembersSection } from "./settings/MembersSection.tsx";
import { useEffect, useState } from "preact/hooks";
import type { Theme } from "../lib/types.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  companyName: string;
}

// SettingsPanel: slide-over dialog hosting appearance, filters, and members sections.
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
  const [section, setSection] = useState<"appearance" | "filters" | "members">(
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

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
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

  return (
    <>
      {/* Backdrop */}
      <div
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
        role="dialog"
        aria-label="Configurações"
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
          }, { key: "members", label: "Membros", Icon: UserIcon }].map((
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

        {/* ── MEMBERS ── */}
        {section === "members" && <MembersSection />}

        {/* Footer */}
        <PanelFooter companyName={companyName} />
      </aside>
    </>
  );
}
