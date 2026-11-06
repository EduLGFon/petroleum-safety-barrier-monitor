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

import { useAdminResource } from "../../../hooks/useAdminResource.ts";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useState } from "preact/hooks";

interface PublicUser {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: "admin" | "user";
  active: boolean;
  auth_source?: "local" | "entra";
  entra_oid?: string | null;
  must_change_password: boolean;
}

// AvisoEntrega: outcome of the best-effort account notice sent through
// MSGFLOW when a temporary password is drawn. Shown so the admin knows
// whether the message left; only sent/reason reach the screen, never the
// raw provider body (it could carry the password).
interface AvisoEntrega {
  sent: boolean;
  reason?: string;
}

// Create/reset responses: the backend returns the drawn password exactly
// once, in the mutation response, plus the notice outcome.
interface CriacaoResposta extends PublicUser {
  temporaryPassword?: string;
  aviso?: AvisoEntrega | null;
}

interface RedefinicaoResposta extends PublicUser {
  temporaryPassword: string;
  aviso: AvisoEntrega;
}

// mensagemAviso: one line telling the admin whether the MSGFLOW notice left.
// Returns null when there is no outcome to report. Keeps the exact lowercase
// markers "aviso enviado" and "aviso não enviado" the admin scans for.
export function mensagemAviso(
  aviso: AvisoEntrega | null | undefined,
): string | null {
  if (!aviso) return null;
  if (aviso.sent) return "aviso enviado por MSGFLOW.";
  const motivo = aviso.reason ? `: ${aviso.reason}` : ".";
  return `aviso não enviado${motivo}`;
}

// EditUserForm: admin edit of all user fields (name, email, password, phone).
function EditUserForm(
  { user, onCancel, onDone }: {
    user: PublicUser;
    onCancel: () => void;
    onDone: (email: string) => void;
  },
) {
  const [email, setEmail] = useState(user.email);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: Event) {
    e.preventDefault();
    if (password !== "" && password !== confirm) {
      setError("A nova senha e a confirmação não coincidem");
      return;
    }
    if (password !== "" && password.length < 12) {
      setError("A nova senha deve ter pelo menos 12 caracteres");
      return;
    }
    setBusy(true);
    try {
      setError("");
      const body: Record<string, unknown> = {
        email,
        name,
        phone,
      };
      if (password !== "") body.password = password;
      await adminApi(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPassword("");
      setConfirm("");
      onDone(email);
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
          minLength={password ? 12 : undefined}
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
        Editar usuário {user.email}
      </div>
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
        <Field label="E-mail">
          <input
            type="email"
            required
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
            style={inputSt}
          />
        </Field>
        <Field label="Nome">
          <input
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            style={inputSt}
          />
        </Field>
        <Field label="Telefone">
          <input
            type="tel"
            value={phone}
            onInput={(e) => setPhone(e.currentTarget.value)}
            style={inputSt}
          />
        </Field>
        {passwordField(
          "Nova senha (12+, opcional)",
          password,
          setPassword,
          "Deixe em branco para manter",
        )}
        {password !== "" && passwordField(
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
            {busy ? "Salvando…" : "Salvar alterações"}
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
  const resource = useAdminResource<PublicUser>(async () => {
    const list = await adminApi("/api/users") as PublicUser[];
    onCount?.(list.length);
    return list;
  });
  const { items: users, loading, error, setError, reload: reloadUsers } =
    resource;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [authSource, setAuthSource] = useState<"local" | "entra">("local");
  const [entraObjectId, setEntraObjectId] = useState("");
  // Shown once, right after creation or reset: the server returns the
  // generated password in the mutation response and never again. Losing it
  // means an admin reset, not a lookup. The notice outcome rides along so
  // the admin knows whether MSGFLOW delivered it. Cleared on dismiss and
  // whenever another flow starts, never persisted anywhere.
  const [senhaTemporaria, setSenhaTemporaria] = useState<
    {
      email: string;
      senha: string;
      aviso: AvisoEntrega | null;
      origem: "criacao" | "redefinicao";
    } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [editFor, setEditFor] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  // Per-row guard so rapid Promover/Ativar clicks on the same row never
  // fire concurrent PATCHes; different rows stay independent.
  const [patchBusy, setPatchBusy] = useState<number | null>(null);

  async function refresh() {
    await reloadUsers();
  }

  async function revokeSessions(id: number) {
    if (!confirm("Revogar todas as sessões deste usuário?")) return;
    try {
      await adminApi(`/api/users/${id}/sessions`, { method: "DELETE" });
      setNotice("Sessões revogadas.");
      if (id === currentUserId) globalThis.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function convertToEntra(user: PublicUser) {
    // No GUID is asked for, and no native dialog is opened. The account is
    // switched to Microsoft sign-in and stays pending until the person signs
    // in for the first time with this same address; that sign-in binds the
    // identity. The trade this makes explicit: from here on the password no
    // longer works for this account.
    try {
      await adminApi(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authSource: "entra" }),
      });
      setNotice(
        user.email +
          " passa a entrar pela Microsoft. A senha deixa de valer para esta conta.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resetPassword(user: PublicUser) {
    if (user.auth_source === "entra") return;
    if (
      !confirm(
        `Redefinir a senha de ${user.email}? A senha atual deixa de valer e uma temporária é gerada.`,
      )
    ) return;
    if (patchBusy !== null) return;
    // A new flow replaces any shown password instead of stacking secrets.
    setSenhaTemporaria(null);
    setPatchBusy(user.id);
    try {
      const resposta = await adminApi(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      }) as RedefinicaoResposta;
      setSenhaTemporaria({
        email: resposta.email,
        senha: resposta.temporaryPassword,
        aviso: resposta.aviso ?? null,
        origem: "redefinicao",
      });
      setNotice(`Senha de ${resposta.email} redefinida.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(null);
    }
  }

  // Initial load handled by useAdminResource.

  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    // A new flow replaces any shown password instead of stacking secrets.
    setSenhaTemporaria(null);
    try {
      const criado = await adminApi("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          phone,
          role,
          authSource,
          // An empty password field is not an empty password: it is the
          // admin saying "let the system draw one". Sending "" would be a
          // validation error instead.
          ...(authSource === "local"
            ? (password === "" ? {} : { password })
            : entraObjectId.trim() === ""
            ? {}
            : { entraObjectId: entraObjectId.trim() }),
        }),
      }) as CriacaoResposta;
      const devolvida = criado.temporaryPassword;
      if (devolvida) {
        setSenhaTemporaria({
          email: criado.email,
          senha: devolvida,
          aviso: criado.aviso ?? null,
          origem: "criacao",
        });
      }
      setEmail("");
      setName("");
      setPhone("");
      setPassword("");
      setEntraObjectId("");
      setAuthSource("local");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: unknown) {
    if (patchBusy !== null) return;
    setPatchBusy(id);
    try {
      await adminApi(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(null);
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
      {senhaTemporaria && (
        <div
          style={{
            border: "1px solid var(--warn, #b45309)",
            borderRadius: 8,
            padding: "12px 14px",
            display: "grid",
            gap: 6,
          }}
        >
          <strong>Senha temporária de {senhaTemporaria.email}</strong>
          <code
            style={{ fontSize: 18, letterSpacing: 1, userSelect: "all" }}
          >
            {senhaTemporaria.senha}
          </code>
          <span style={{ opacity: 0.8 }}>
            {senhaTemporaria.origem === "redefinicao"
              ? "Anote e entregue à pessoa agora: a senha antiga deixou de valer e esta não aparece de novo. No primeiro acesso ela é obrigada a trocar."
              : "Anote e entregue à pessoa agora: esta senha não é guardada e não aparece de novo. No primeiro acesso ela é obrigada a trocar."}
          </span>
          {mensagemAviso(senhaTemporaria.aviso) && (
            <span style={{ opacity: 0.8 }}>
              {mensagemAviso(senhaTemporaria.aviso)}
              {senhaTemporaria.aviso && !senhaTemporaria.aviso.sent
                ? " Entregue a senha por outro canal."
                : ""}
            </span>
          )}
          <div>
            <button
              type="button"
              onClick={() => setSenhaTemporaria(null)}
              style={ghostBtn}
            >
              Já anotei
            </button>
          </div>
        </div>
      )}
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
          <Field label="Telefone">
            <input
              type="tel"
              placeholder="DDD + número (opcional)"
              value={phone}
              onInput={(e) => setPhone(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Tipo de conta">
            <select
              value={authSource}
              onChange={(e) => {
                setAuthSource(e.currentTarget.value as "local" | "entra");
                // Switching flows must not keep a previous secret on screen.
                setSenhaTemporaria(null);
              }}
              style={inputSt}
            >
              <option value="local">Senha local</option>
              <option value="entra">Microsoft Entra</option>
            </select>
          </Field>
          {authSource === "local"
            ? (
              <Field label="Senha (vazia = o sistema gera)">
                <input
                  type="password"
                  minLength={12}
                  placeholder="deixe vazio e o sistema gera uma"
                  value={password}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  style={inputSt}
                />
              </Field>
            )
            : (
              <Field label="Object ID do Entra (opcional)">
                <input
                  type="text"
                  placeholder="deixe vazio: vincula no primeiro acesso"
                  value={entraObjectId}
                  onInput={(e) => setEntraObjectId(e.currentTarget.value)}
                  style={inputSt}
                />
              </Field>
            )}
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
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "var(--d-small)",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          Usuários não-admin são criados sem acesso a estações (fail closed).
          Atribua os grupos em <strong>Grupos</strong>{" "}
          antes de liberar o acesso.
        </p>
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
                  <StatusBadge
                    tone={u.auth_source === "entra" ? "admin" : "neutral"}
                  >
                    {u.auth_source === "entra" ? "Entra" : "Local"}
                  </StatusBadge>
                  {u.must_change_password === true && (
                    <StatusBadge tone="danger">
                      senha temporária
                    </StatusBadge>
                  )}
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
                      disabled={patchBusy === u.id}
                      onClick={() =>
                        void patch(u.id, {
                          role: u.role === "admin" ? "user" : "admin",
                        })}
                      style={ghostBtn}
                    >
                      {patchBusy === u.id
                        ? "Aguarde…"
                        : u.role === "admin"
                        ? "Rebaixar"
                        : "Promover"}
                    </button>
                    <button
                      type="button"
                      disabled={patchBusy === u.id}
                      onClick={() =>
                        void patch(u.id, { active: !u.active })}
                      style={u.active ? dangerBtn : ghostBtn}
                    >
                      {patchBusy === u.id
                        ? "Aguarde…"
                        : u.active
                        ? "Desativar"
                        : "Ativar"}
                    </button>
                    {u.auth_source !== "entra" && (
                      <button
                        type="button"
                        disabled={patchBusy === u.id}
                        onClick={() => void resetPassword(u)}
                        style={ghostBtn}
                      >
                        {patchBusy === u.id ? "Aguarde…" : "Redefinir senha"}
                      </button>
                    )}
                    {u.auth_source !== "entra" && (
                      <button
                        type="button"
                        onClick={() => void convertToEntra(u)}
                        style={ghostBtn}
                      >
                        Converter para Entra
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void revokeSessions(u.id)}
                      style={ghostBtn}
                    >
                      Revogar sessões
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
                            setEditFor(u.id);
                            setNotice("");
                          }}
                          style={ghostBtn}
                        >
                          Editar
                        </button>
                      )}
                  </span>
                </AdminRow>
                {editFor === u.id && (
                  <EditUserForm
                    user={u}
                    onCancel={() => setEditFor(null)}
                    onDone={(email) => {
                      setEditFor(null);
                      setNotice(
                        `Usuário ${email} atualizado.`,
                      );
                      // Re-fetch so the row shows the edited name/email/phone
                      // instead of the stale pre-edit snapshot.
                      void refresh();
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
