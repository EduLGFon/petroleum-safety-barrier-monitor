// AdminSection - admin-only tab content inside the settings sidepanel.
// This is why it exists: the old /admin console moves into the drawer so
// admins manage users, recipients, and rules without leaving the monitor.
import { RecipientsManager } from "./admin/RecipientsManager.tsx";

import { BellIcon, MailIcon, UsersIcon } from "../ui/Icons.tsx";

import { RulesManager } from "./admin/RulesManager.tsx";

import { UsersManager } from "./admin/UsersManager.tsx";

import type { AuthUser } from "../../lib/types.ts";

import type { ComponentType } from "preact";

import { useState } from "preact/hooks";

type Sub = "users" | "recipients" | "rules";

interface SubDef {
  key: Sub;
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

// SUBS: admin sub-nav definitions with icons.
const SUBS: SubDef[] = [
  { key: "users", label: "Usuários", Icon: UsersIcon },
  { key: "recipients", label: "Destinatários", Icon: MailIcon },
  { key: "rules", label: "Regras", Icon: BellIcon },
];

// AdminSection: fail-closed sub-nav shell; lazy-mounts one manager at a time.
export function AdminSection(
  { sessionUser }: { sessionUser?: AuthUser | null },
) {
  const [sub, setSub] = useState<Sub>("users");
  const [counts, setCounts] = useState<Record<Sub, number | null>>({
    users: null,
    recipients: null,
    rules: null,
  });

  if (sessionUser?.role !== "admin") {
    return (
      <div
        className="animate-settings-in"
        style={{ padding: "var(--d-panel-body)" }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "var(--d-soon-pad)",
            border: "1.5px dashed var(--border)",
            borderRadius: "var(--d-row-radius)",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: "var(--d-lead)",
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            Acesso restrito
          </div>
          <div
            style={{ fontSize: "var(--d-small)", color: "var(--text-muted)" }}
          >
            Esta área é só para administradores.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="animate-settings-in"
      style={{
        padding: "var(--d-panel-body)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--d-panel-gap)",
      }}
    >
      <div
        role="tablist"
        aria-label="Administração"
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          background: "var(--bg-elevated)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--d-row-radius)",
          overflowX: "auto",
        }}
      >
        {SUBS.map(({ key, label, Icon }) => {
          const active = sub === key;
          const n = counts[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSub(key)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 10px",
                fontSize: "var(--d-small)",
                fontWeight: 700,
                whiteSpace: "nowrap",
                border: "none",
                borderRadius: "var(--d-chip-radius)",
                cursor: "pointer",
                background: active
                  ? "linear-gradient(90deg,var(--accent),var(--accent-2))"
                  : "transparent",
                color: active ? "#fff" : "var(--text-muted)",
                boxShadow: active ? "0 4px 14px var(--glow)" : "none",
                transition: "all .2s var(--ease-std)",
              }}
            >
              <Icon
                size={14}
                color={active ? "#fff" : "var(--text-muted)"}
                strokeWidth={2.2}
              />
              {label}
              {n != null && (
                <span
                  className="tnum"
                  style={{
                    fontSize: "var(--d-micro)",
                    fontWeight: 800,
                    background: active
                      ? "rgba(255,255,255,.22)"
                      : "var(--bg-hover)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    borderRadius: 99,
                    padding: "1px 7px",
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {sub === "users" && (
        <UsersManager onCount={(n) => setCounts((c) => ({ ...c, users: n }))} />
      )}
      {sub === "recipients" && (
        <RecipientsManager
          onCount={(n) => setCounts((c) => ({ ...c, recipients: n }))}
        />
      )}
      {sub === "rules" && (
        <RulesManager onCount={(n) => setCounts((c) => ({ ...c, rules: n }))} />
      )}
    </div>
  );
}
