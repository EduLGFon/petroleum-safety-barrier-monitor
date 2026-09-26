// UsersManager - admin user list, creation, and role/access actions.
// This is why it exists: promoting users and deactivating leavers is a core
// admin task; this manager wraps /api/users with PT labels and premium rows.
import {
  AdminCard,
  AdminHero,
  AdminRow,
  Avatar,
  dangerBtn,
  EmptyState,
  ErrorBanner,
  Field,
  ghostBtn,
  inputSt,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useEffect, useState } from "preact/hooks";

interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
}

// UsersManager: user CRUD card; reports counts up for the sub-nav badge.
export function UsersManager({ onCount }: { onCount?: (n: number) => void }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setError("");
      setLoading(true);
      const list = await adminApi("/api/users") as PublicUser[];
      setUsers(list);
      onCount?.(list.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Refresh once per mount; the count reporter is stable for the session.
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      setEmail("");
      setName("");
      setPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: unknown) {
    try {
      await adminApi(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Usuários"
        hint="Crie acessos, promova administradores e desative quem saiu."
        count={`${users.length} no total`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <AdminCard>
        <form
          onSubmit={create}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <Field label="E-mail">
            <input
              type="email"
              required
              placeholder="nome@operadora.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Nome">
            <input
              type="text"
              placeholder="Nome completo"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Senha (12+)">
            <input
              type="password"
              required
              minLength={12}
              placeholder="••••••••••••"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Perfil">
            <select
              value={role}
              onChange={(e) =>
                setRole(e.currentTarget.value as "admin" | "user")}
              style={inputSt}
            >
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "end", flex: "1 1 100%" }}>
            <button
              type="submit"
              disabled={busy}
              className="lift"
              style={{ ...primaryBtn, opacity: busy ? 0.7 : 1, width: "100%" }}
            >
              {busy ? "Criando…" : "Criar usuário"}
            </button>
          </div>
        </form>
      </AdminCard>
      {loading
        ? <SkeletonRows />
        : users.length === 0
        ? <EmptyState text="Nenhum usuário ainda. Crie o primeiro acima." />
        : (
          <div style={{ display: "grid", gap: 8 }}>
            {users.map((u) => (
              <AdminRow key={u.id}>
                <Avatar name={u.name || u.email} />
                <span style={{ minWidth: 0, flex: "1 1 160px" }}>
                  <div
                    style={{
                      fontSize: "var(--d-body)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {u.email}
                  </div>
                  {u.name && (
                    <div
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {u.name}
                    </div>
                  )}
                </span>
                <StatusBadge tone={u.role === "admin" ? "admin" : "neutral"}>
                  {u.role === "admin" ? "Administrador" : "Usuário"}
                </StatusBadge>
                <StatusBadge tone={u.active ? "active" : "inactive"}>
                  {u.active ? "Ativo" : "Inativo"}
                </StatusBadge>
                <span
                  style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      void patch(u.id, {
                        role: u.role === "admin" ? "user" : "admin",
                      })}
                    style={ghostBtn}
                  >
                    {u.role === "admin" ? "Rebaixar" : "Promover"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void patch(u.id, { active: !u.active })}
                    style={u.active ? dangerBtn : ghostBtn}
                  >
                    {u.active ? "Desativar" : "Ativar"}
                  </button>
                </span>
              </AdminRow>
            ))}
          </div>
        )}
    </div>
  );
}
