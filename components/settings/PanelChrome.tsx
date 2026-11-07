// PanelChrome - settings workspace navigation and content header.
// Why: keeps SettingsPanel focused on section state and content composition
// while the vertical page list and content chrome stay presentational.
import {
  BellIcon,
  FilterIcon,
  HistoryIcon,
  MailIcon,
  SlidersIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "../ui/Icons.tsx";

import type { AuthUser } from "../../lib/types.ts";

import type { ComponentType } from "preact";

import { CloseIcon } from "../ui/Icons.tsx";

export type SettingsSection =
  | "appearance"
  | "filters"
  | "account"
  | "users"
  | "groups"
  | "recipients"
  | "rules"
  | "options"
  | "sync";

export type AdminSectionKey =
  | "users"
  | "groups"
  | "recipients"
  | "rules"
  | "options";

type Icon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type Access = "public" | "auth" | "admin";

interface NavEntry {
  key: SettingsSection;
  label: string;
  Icon: Icon;
  access: Access;
}

interface NavGroup {
  title: string;
  entries: NavEntry[];
}

// GROUPS: the vertical page list, grouped like a desktop settings workspace.
const GROUPS: NavGroup[] = [
  {
    title: "Preferências",
    entries: [
      {
        key: "appearance",
        label: "Aparência",
        Icon: SunIcon,
        access: "public",
      },
      { key: "filters", label: "Filtros", Icon: FilterIcon, access: "public" },
    ],
  },
  {
    title: "Conta",
    entries: [
      { key: "account", label: "Conta", Icon: UserIcon, access: "auth" },
    ],
  },
  {
    title: "Administração",
    entries: [
      { key: "users", label: "Usuários", Icon: UsersIcon, access: "admin" },
      { key: "groups", label: "Grupos", Icon: UsersIcon, access: "admin" },
      {
        key: "recipients",
        label: "Destinatários",
        Icon: MailIcon,
        access: "admin",
      },
      { key: "rules", label: "Regras", Icon: BellIcon, access: "admin" },
      { key: "options", label: "Opções", Icon: SlidersIcon, access: "admin" },
    ],
  },
  {
    title: "Sistema",
    entries: [
      {
        key: "sync",
        label: "Sincronização",
        Icon: HistoryIcon,
        access: "auth",
      },
    ],
  },
];

// canSee: fail-closed visibility, mirrored by SettingsPanel's render guards.
function canSee(access: Access, sessionUser?: AuthUser | null): boolean {
  if (access === "public") return true;
  if (!sessionUser) return false;
  return access === "auth" || sessionUser.role === "admin";
}

interface NavProps {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  sessionUser?: AuthUser | null;
  counts?: Partial<Record<AdminSectionKey, number | null>>;
}

// SettingsNav: grouped vertical page buttons with active accent and counts.
export function SettingsNav(
  { section, onSelect, sessionUser, counts }: NavProps,
) {
  return (
    <nav className="settings-nav" aria-label="Páginas de configurações">
      {GROUPS.map((group) => {
        const entries = group.entries.filter((entry) =>
          canSee(entry.access, sessionUser)
        );
        if (entries.length === 0) return null;
        return (
          <div key={group.title} className="settings-nav-group">
            <div className="settings-nav-heading">{group.title}</div>
            <div className="settings-nav-list">
              {entries.map(({ key, label, Icon }) => {
                const active = section === key;
                const count = counts?.[key as AdminSectionKey];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelect(key)}
                    className="settings-nav-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 11px",
                      border: "none",
                      borderRadius: 9,
                      cursor: "pointer",
                      textAlign: "left",
                      background: active
                        ? "color-mix(in srgb,var(--accent) 14%,transparent)"
                        : undefined,
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                      boxShadow: active
                        ? "inset 3px 0 0 var(--accent)"
                        : "none",
                      transition: "background .18s var(--ease-std)",
                    }}
                  >
                    <Icon
                      size={15}
                      color={active ? "var(--accent)" : "var(--text-muted)"}
                      strokeWidth={2}
                    />
                    <span className="settings-nav-label" style={{ flex: 1 }}>
                      {label}
                    </span>
                    {typeof count === "number" && (
                      <span
                        className="tnum"
                        style={{
                          fontSize: "var(--d-caption)",
                          fontWeight: 800,
                          lineHeight: 1,
                          borderRadius: 99,
                          padding: "2px 7px",
                          background: active
                            ? "color-mix(in srgb,var(--accent) 18%,transparent)"
                            : "var(--bg-hover)",
                          color: active ? "var(--accent)" : "var(--text-muted)",
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

interface HeaderProps {
  title: string;
  description: string;
  onClose: () => void;
}

// SettingsContentHeader: page heading, short description, and close button.
export function SettingsContentHeader(
  { title, description, onClose }: HeaderProps,
) {
  return (
    <header
      className="settings-content-head"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        padding: "18px 22px 14px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "color-mix(in srgb,var(--bg-elevated) 62%,transparent)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2
          id="settings-page-title"
          style={{
            margin: 0,
            fontSize: "var(--d-dialog-title)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "var(--d-small)",
            lineHeight: 1.5,
            color: "var(--text-muted)",
          }}
        >
          {description}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar configurações"
        className="lift"
        style={{
          width: "var(--d-close-btn)",
          height: "var(--d-close-btn)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-surface)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--d-input-radius)",
          cursor: "pointer",
        }}
      >
        <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5} />
      </button>
    </header>
  );
}
