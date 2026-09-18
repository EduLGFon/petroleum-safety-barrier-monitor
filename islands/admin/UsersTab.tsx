// UsersTab - admin user list, creation, role and access management.
// This is why it exists: promoting users to admin and deactivating leavers
// is a core admin task; this tab wraps /api/users with PT labels.
import { useEffect, useState } from "preact/hooks";

import { api } from "./api.ts";

interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
}

// UsersTab: admin user CRUD table; surfaces fetch errors inline.
export function UsersTab() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  async function refresh() {
    try {
      setError("");
      setUsers(await api("/api/users") as PublicUser[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    try {
      await api("/api/users", {
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
    }
  }

  async function patch(id: number, body: unknown) {
    try {
      await api(`/api/users/${id}`, {
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
      {error && <div role="alert">{error}</div>}
      <form
        onSubmit={create}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
        <input
          type="text"
          placeholder="Nome"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <input
          type="password"
          required
          placeholder="Senha (12+)"
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.currentTarget.value as "admin" | "user")}
        >
          <option value="user">Usuário</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Criar usuário</button>
      </form>
      <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
        {users.map((u) => (
          <li
            key={u.id}
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <strong>{u.email}</strong>
            <span>{u.name}</span>
            <span>{u.role === "admin" ? "Admin" : "Usuário"}</span>
            <span>{u.active ? "Ativo" : "Inativo"}</span>
            <button
              type="button"
              onClick={() =>
                void patch(u.id, {
                  role: u.role === "admin" ? "user" : "admin",
                })}
            >
              {u.role === "admin" ? "Rebaixar" : "Promover a admin"}
            </button>
            <button
              type="button"
              onClick={() => void patch(u.id, { active: !u.active })}
            >
              {u.active ? "Desativar" : "Ativar"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
