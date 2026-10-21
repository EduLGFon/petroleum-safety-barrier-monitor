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

// ResetPasswordForm: admin-issued reset for one user. The target's current
// password is never required (this is the recovery path), but every session
// for that user is revoked by the API after the new hash is stored.
function ResetPasswordForm(
  { user, onCancel, onDone }: {
    user: PublicUser;
    onCancel: () => void;
    onDone: (email: string) => void;
  },
) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: Event) {
    e.preventDefault();
    if (next !== confirm) {
      setError("A nova senha e a confirmação não coincidem");
      return;
    }
    if (next.length < 12) {
      setError("A nova senha deve ter pelo menos 12 caracteres");
      return;
    }
    setBusy(true);
    try {
      setError("");
      await adminApi(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: next }),
      });
      setNext("");
      setConfirm("");
      onDone(user.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const passwordField = (
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ) => (
    <Field label={label}>
      <span style={{ position: "relative", display: "block" }}>
        <input
          type={show ? "text" : "password"}
          required
          minLength={12}
          autoComplete="new-password"
          placeholder={placeholder}
          value={value}
          onInput={(e) => set(e.currentTarget.value)}
          style={{ ...inputSt, paddingRight: 70 }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar senhas" : "Mostrar senhas"}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            border: 0,
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "var(--d-small)",
            fontWeight: 600,
            cursor: "pointer",
            padding: "6px 8px",
            textTransform: "none",
            letterSpacing: "normal",
          }}
        >
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </span>
    </Field>
  );

  return (
    <AdminCard>
      <div
        style={{
          fontSize: "var(--d-body)",
          fontWeight: 700,
          color: "var(--text-primary)",
        }}
      >
        Redefinir senha de {user.email}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "var(--d-small)",
          color: "var(--text-muted)",
          lineHeight: 1.55,
        }}
      >
        Ao salvar, todas as sessões desse usuário serão encerradas. Ele deverá
        entrar novamente com a nova senha.
      </p>
      {error && (
        <div
          role="alert"
          className="animate-fade-in"
          style={{
            background: "var(--au-danger-bg)",
            border: "1px solid var(--alert-nc-border)",
            color: "var(--au-danger-fg)",
            borderRadius: "var(--d-row-radius)",
            padding: "10px 12px",
            fontSize: "var(--d-small)",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        {passwordField(
          "Nova senha (12+)",
          next,
          setNext,
          "Mínimo 12 caracteres",
        )}
        {passwordField(
          "Confirmar nova senha",
          confirm,
          setConfirm,
          "Repita a nova senha",
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={busy}
            className="lift"
            style={{
              ...primaryBtn,
              opacity: busy ? 0.7 : 1,
              flex: "1 1 160px",
            }}
          >
            {busy ? "Salvando…" : "Salvar nova senha"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtn}
          >
            Cancelar
          </button>
        </div>
      </form>
    </AdminCard>
  );
}

// UsersManager: user CRUD card; reports counts up for the sub-nav badge.
export function UsersManager(
  { onCount, currentUserId }: {
    onCount?: (n: number) => void;
    currentUserId?: number;
  },
) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

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
              <option value="admin">Admin</option>
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
      {notice && (
        <div
          role="status"
          className="animate-fade-in"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(16,185,129,.14)",
            border: "1px solid rgba(16,185,129,.3)",
            color: "#10b981",
            borderRadius: "var(--d-row-radius)",
            padding: "10px 12px",
            fontSize: "var(--d-small)",
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          <span style={{ minWidth: 0 }}>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            style={ghostBtn}
          >
            Fechar
          </button>
        </div>
      )}
      {loading
        ? <SkeletonRows />
        : users.length === 0
        ? <EmptyState text="Nenhum usuário ainda. Crie o primeiro acima." />
        : (
          <div style={{ display: "grid", gap: 8 }}>
            {users.map((u) => (
              <div key={u.id} style={{ display: "grid", gap: 8 }}>
                <AdminRow>
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
                    {u.role === "admin" ? "Admin" : "Usuário"}
                  </StatusBadge>
                  <StatusBadge tone={u.active ? "active" : "inactive"}>
                    {u.active ? "Ativo" : "Inativo"}
                  </StatusBadge>
                  <span
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
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
                      onClick={() =>
                        void patch(u.id, { active: !u.active })}
                      style={u.active ? dangerBtn : ghostBtn}
                    >
                      {u.active ? "Desativar" : "Ativar"}
                    </button>
                    {currentUserId === u.id
                      ? (
                        <span
                          style={{
                            fontSize: "var(--d-small)",
                            color: "var(--text-muted)",
                          }}
                        >
                          Sua senha: aba Conta
                        </span>
                      )
                      : (
                        <button
                          type="button"
                          onClick={() => {
                            setResetFor(u.id);
                            setNotice("");
                          }}
                          style={ghostBtn}
                        >
                          Redefinir senha
                        </button>
                      )}
                  </span>
                </AdminRow>
                {resetFor === u.id && (
                  <ResetPasswordForm
                    user={u}
                    onCancel={() => setResetFor(null)}
                    onDone={(email) => {
                      setResetFor(null);
                      setNotice(
                        `Senha de ${email} alterada. Todas as sessões desse usuário foram encerradas.`,
                      );
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
