// AdminPanel - admin-only console for users, recipients, and rules.
// This is why it exists: one guarded page gathers every management task so
// admins never need curl; the island checks /api/auth/me because server
// route context does not reach hydrated islands.
import { RecipientsTab } from "./admin/RecipientsTab.tsx";

import { useEffect, useState } from "preact/hooks";

import { UsersTab } from "./admin/UsersTab.tsx";

import { RulesTab } from "./admin/RulesTab.tsx";

type Tab = "users" | "recipients" | "rules";

interface Me {
  role: "admin" | "user";
  email: string;
}

// AdminPanel: guarded tab shell (users/recipients/rules); fail-closed to access-denied on auth error.
export function AdminPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<Tab>("users");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" }).then(async (res) => {
      if (!res.ok) {
        setDenied(true);
        return;
      }
      const data = await res.json() as Me;
      if (data.role !== "admin") setDenied(true);
      else setMe(data);
    }).catch(() => setDenied(true));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    globalThis.location.href = "/login";
  }

  if (denied) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h1>Acesso restrito</h1>
        <p>Esta página é só para administradores.</p>
        <a href="/login">Ir para o acesso</a>
      </div>
    );
  }
  if (!me) return <p>Carregando…</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Administração</h1>
        <span>{me.email}</span>
        <a href="/">Voltar ao monitor</a>
        <button type="button" onClick={() => void logout()}>Sair</button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setTab("users")}>Usuários</button>
        <button type="button" onClick={() => setTab("recipients")}>
          Destinatários
        </button>
        <button type="button" onClick={() => setTab("rules")}>
          Regras de alerta
        </button>
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "recipients" && <RecipientsTab />}
      {tab === "rules" && <RulesTab />}
    </div>
  );
}
