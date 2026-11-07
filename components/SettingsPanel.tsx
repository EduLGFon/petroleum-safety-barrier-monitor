// SettingsPanel - centered settings workspace for appearance, filters,
// account, admin pages, and the sync placeholder.
// This is why it exists: centralizes theme / accent / density / font size /
// reduce-motion plus startup filter defaults from SettingsContext, with a
// Conta page for every authenticated user and an admin-only page group for
// administrators. The admin managers stay lazy: non-admin users and
// non-admin pages never parse that chunk.
import {
  type AccentColor,
  type Density,
  type FontSize,
  useSettings,
} from "../context/SettingsContext.tsx";

import type {
  AdminSectionKey,
  SettingsSection,
} from "./settings/PanelChrome.tsx";

import { SettingsContentHeader, SettingsNav } from "./settings/PanelChrome.tsx";

import { AppearanceSection } from "./settings/AppearanceSection.tsx";

export type { SettingsSection } from "./settings/PanelChrome.tsx";

import { AccountSection } from "./settings/AccountSection.tsx";

import { FiltersSection } from "./settings/FiltersSection.tsx";

import { lockBody, unlockBody } from "../lib/body-lock.ts";

import { useEffect, useRef, useState } from "preact/hooks";

import { useFocusTrap } from "../hooks/useFocusTrap.ts";

import type { AuthUser, Theme } from "../lib/types.ts";

import { lazy, Suspense } from "preact/compat";

const AdminSection = lazy(() =>
  import("./settings/AdminSection.tsx").then((m) => ({
    default: m.AdminSection,
  }))
);

interface Props {
  open: boolean;
  onClose: () => void;
  sessionUser?: AuthUser | null;
  // Optional landing page applied whenever `open` flips true. The later sync
  // shortcut uses it without changing the rest of the public props.
  initialSection?: SettingsSection;
  // Live vocabularies for the filters section; absent means "unknown yet"
  // and the section offers only "Todas" instead of stale seeds.
  locations?: { code: string; name: string; type: string }[];
  availabilities?: string[];
  compliances?: string[];
  criticalities?: string[];
  categories?: string[];
  typologies?: string[];
}

interface PageMeta {
  title: string;
  description: string;
}

// PAGE_META: content header copy for every page in the workspace.
const PAGE_META: Record<SettingsSection, PageMeta> = {
  appearance: {
    title: "Aparência",
    description: "Temas, cores e conforto visual do monitor.",
  },
  filters: {
    title: "Filtros",
    description: "Valores iniciais aplicados ao abrir o monitor.",
  },
  account: {
    title: "Conta",
    description: "Seus dados de acesso e a troca de senha.",
  },
  users: {
    title: "Usuários",
    description: "Acessos, perfis e status das contas.",
  },
  groups: {
    title: "Grupos",
    description: "Restrições de acesso por estação.",
  },
  recipients: {
    title: "Destinatários",
    description: "Quem recebe os alertas por e-mail.",
  },
  rules: {
    title: "Regras",
    description: "Quando e como os alertas são disparados.",
  },
  options: {
    title: "Opções",
    description: "Respostas padrão dos campos da ficha.",
  },
  sync: {
    title: "Sincronização",
    description: "Histórico das execuções com o CMMS.",
  },
};

const ADMIN_KEYS: AdminSectionKey[] = [
  "users",
  "groups",
  "recipients",
  "rules",
  "options",
];

function isAdminSection(section: SettingsSection): section is AdminSectionKey {
  return ADMIN_KEYS.includes(section as AdminSectionKey);
}

// allowedSection: hard gate for the shell; AdminSection repeats the role
// check on its own so a future caller cannot bypass it.
function allowedSection(
  section: SettingsSection,
  sessionUser?: AuthUser | null,
): boolean {
  if (isAdminSection(section)) return sessionUser?.role === "admin";
  if (section === "account" || section === "sync") return !!sessionUser;
  return true;
}

// SyncPlaceholder: simple landing card until the sync history unit lands.
function SyncPlaceholder() {
  return (
    <div
      className="animate-settings-in"
      style={{ padding: "var(--d-panel-body)" }}
    >
      <div
        style={{
          display: "grid",
          gap: 6,
          maxWidth: 620,
          padding: "var(--d-row-pad)",
          background: "var(--bg-elevated)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--d-row-radius)",
        }}
      >
        <strong style={{ color: "var(--text-primary)" }}>
          Sincronização
        </strong>
        <span
          style={{
            fontSize: "var(--d-small)",
            color: "var(--text-muted)",
            lineHeight: 1.55,
          }}
        >
          O histórico de sincronização aparece aqui.
        </span>
      </div>
    </div>
  );
}

// AdminLoading: chunk fallback while the admin page group loads.
function AdminLoading() {
  return (
    <div
      className="animate-fade-in"
      style={{
        padding: "var(--d-panel-body)",
        color: "var(--text-muted)",
        fontSize: "var(--d-small)",
      }}
    >
      Carregando administração…
    </div>
  );
}

// SettingsPanel: floating workspace with vertical page navigation.
export function SettingsPanel(
  {
    open,
    onClose,
    sessionUser = null,
    initialSection,
    locations,
    availabilities,
    compliances,
    criticalities,
    categories,
    typologies,
  }: Props,
) {
  const {
    settings,
    setTheme,
    setAccent,
    setDensity,
    setFontSize,
    setDefaults,
    setDefaultLoc,
    resetFilterDefaults,
    setReduceMotion,
    setDisableBlur,
  } = useSettings();
  const [section, setSection] = useState<SettingsSection>(
    initialSection ?? "appearance",
  );
  const [adminCounts, setAdminCounts] = useState<
    Partial<Record<AdminSectionKey, number | null>>
  >({});
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [activeAccent, setActiveAccent] = useState<AccentColor | null>(null);
  const [activeDensity, setActiveDensity] = useState<Density | null>(null);
  const [activeFontSize, setActiveFontSize] = useState<FontSize | null>(null);

  // initialSection selects the landing page on every false -> true open.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current && initialSection) {
      setSection(initialSection);
    }
    wasOpen.current = open;
  }, [open, initialSection]);

  // Render guard: a role or session change can invalidate the stored page
  // without touching the state itself. The fallback is always public.
  const activeSection = allowedSection(section, sessionUser)
    ? section
    : "appearance";

  // Nested portalled dialogs and menus own Tab while they are open. Disable
  // the shell trap so it cannot pull focus back out of the inner overlay;
  // both primitives mark their portal root with a data attribute.
  const [nestedOverlay, setNestedOverlay] = useState(false);
  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const next = !!document.querySelector(
        "[data-admin-form-dialog],[data-search-multi-panel]",
      );
      setNestedOverlay((current) => current === next ? current : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // Nested dialogs own Escape; this guard also covers portalled menus
      // whose events reach document before the inner handler can stop them.
      if (
        target?.closest?.(
          "[data-admin-form-dialog],[data-search-multi-panel]",
        )
      ) return;
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Shared counter with BarrierModal: scroll resumes only after the last
  // overlay closes, so closing the workspace cannot unlock scroll under it.
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
  // handleFontSize: applies the text-size preset with a brief press animation.
  const handleFontSize = (f: FontSize) => {
    setActiveFontSize(f);
    setFontSize(f);
    setTimeout(() => setActiveFontSize(null), 350);
  };

  const handleAdminCount = (key: AdminSectionKey, count: number) => {
    setAdminCounts((current) =>
      current[key] === count ? current : { ...current, [key]: count }
    );
  };

  // Focus management: remember the trigger on open, focus the dialog, restore
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
  useFocusTrap(panelRef, open && !nestedOverlay);

  const meta = PAGE_META[activeSection];

  return (
    <>
      <div
        className="settings-backdrop"
        data-open={open ? "true" : "false"}
        inert={!open}
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        className="settings-workspace"
        data-open={open ? "true" : "false"}
        inert={!open}
        aria-hidden={!open}
      >
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-page-title"
          tabIndex={-1}
          className="settings-dialog"
        >
          <SettingsNav
            section={activeSection}
            onSelect={(next) => {
              if (allowedSection(next, sessionUser)) setSection(next);
            }}
            sessionUser={sessionUser}
            counts={adminCounts}
          />

          <section className="settings-content">
            <SettingsContentHeader
              title={meta.title}
              description={meta.description}
              onClose={onClose}
            />

            <div className="settings-content-scroll">
              {activeSection === "appearance" && (
                <AppearanceSection
                  settings={settings}
                  activeTheme={activeTheme}
                  activeDensity={activeDensity}
                  activeFontSize={activeFontSize}
                  activeAccent={activeAccent}
                  onTheme={handleTheme}
                  onDensity={handleDensity}
                  onFontSize={handleFontSize}
                  onAccent={handleAccent}
                  onReduceMotion={setReduceMotion}
                  onDisableBlur={setDisableBlur}
                />
              )}

              {activeSection === "filters" && (
                <FiltersSection
                  settings={settings}
                  setDefaults={setDefaults}
                  setDefaultLoc={setDefaultLoc}
                  resetDefaults={resetFilterDefaults}
                  locations={locations}
                  availabilities={availabilities}
                  compliances={compliances}
                  criticalities={criticalities}
                  categories={categories}
                  typologies={typologies}
                />
              )}

              {activeSection === "account" && sessionUser && (
                <AccountSection sessionUser={sessionUser} />
              )}

              {isAdminSection(activeSection) &&
                sessionUser?.role === "admin" && (
                <Suspense fallback={<AdminLoading />}>
                  <AdminSection
                    section={activeSection}
                    sessionUser={sessionUser}
                    onCount={handleAdminCount}
                  />
                </Suspense>
              )}

              {activeSection === "sync" && sessionUser && <SyncPlaceholder />}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
