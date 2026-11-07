// AdminSection - admin page dispatcher inside the settings workspace.
// This is why it exists: the vertical nav selects one admin page at a time;
// this module keeps the fail-closed role gate and lazy-loads the five
// managers as one chunk while rendering only the active one.
import { FieldOptionsManager } from "./admin/FieldOptionsManager.tsx";

import { RecipientsManager } from "./admin/RecipientsManager.tsx";

import { GroupsManager } from "./admin/GroupsManager.tsx";

import type { AdminSectionKey } from "./PanelChrome.tsx";

import { RulesManager } from "./admin/RulesManager.tsx";

import { UsersManager } from "./admin/UsersManager.tsx";

import type { AuthUser } from "../../lib/types.ts";

interface Props {
  section: AdminSectionKey;
  sessionUser?: AuthUser | null;
  onCount?: (section: AdminSectionKey, count: number) => void;
}

// AdminSection: fail-closed dispatcher; only the active manager is mounted.
export function AdminSection({ section, sessionUser, onCount }: Props) {
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
        display: "grid",
        gap: "var(--d-panel-gap)",
        minWidth: 0,
      }}
    >
      {section === "users" && (
        <UsersManager
          currentUserId={sessionUser.id}
          onCount={(n) => onCount?.("users", n)}
        />
      )}
      {section === "groups" && (
        <GroupsManager onCount={(n) => onCount?.("groups", n)} />
      )}
      {section === "recipients" && (
        <RecipientsManager onCount={(n) => onCount?.("recipients", n)} />
      )}
      {section === "rules" && (
        <RulesManager onCount={(n) => onCount?.("rules", n)} />
      )}
      {section === "options" && (
        <FieldOptionsManager onCount={(n) => onCount?.("options", n)} />
      )}
    </div>
  );
}
