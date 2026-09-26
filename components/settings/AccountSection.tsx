// AccountSection - profile summary plus self-service password change.
// This is why it exists: every authenticated user needs a way to change
// their own password; admins keep the separate reset path in AdminSection.
// Identity never leaves the session cookie: the request carries no id.
import {
  AdminCard,
  Avatar,
  Field,
  inputSt,
  primaryBtn,
  StatusBadge,
} from "./admin/AdminPrimitives.tsx";

import { adminApi } from "../../lib/api/admin-client.ts";

import type { AuthUser } from "../../lib/types.ts";

import { useState } from "preact/hooks";

// AccountSection: read-only profile card plus password form for the owner.
export function AccountSection(
  { sessionUser }: { sessionUser?: AuthUser | null },
) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!sessionUser) {
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
            Sem sessão
          </div>
          <div
            style={{ fontSize: "var(--d-small)", color: "var(--text-muted)" }}
          >
            Entre para gerenciar sua conta.
          </div>
        </div>
      </div>
    );
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (next !== confirm) {
      setError("A nova senha e a confirmação não coincidem");
      return;
    }
    setBusy(true);
    try {
      setError("");
      await adminApi("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // pwField: password input with a show/hide toggle inside.
  const pwField = (
    label: string,
    value: string,
    set: (v: string) => void,
    auto: string,
    placeholder: string,
  ) => (
    <Field label={label}>
      <span style={{ position: "relative", display: "block" }}>
        <input
          type={show ? "text" : "password"}
          required
          minLength={12}
          autoComplete={auto}
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
    <div
      className="animate-settings-in"
      style={{
        padding: "var(--d-panel-body)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--d-panel-gap)",
      }}
    >
      <AdminCard>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Avatar name={sessionUser.name || sessionUser.email} />
          <span style={{ minWidth: 0, flex: "1 1 auto" }}>
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
              {sessionUser.email}
            </div>
            {sessionUser.name && (
              <div
                style={{
                  fontSize: "var(--d-small)",
                  color: "var(--text-muted)",
                }}
              >
                {sessionUser.name}
              </div>
            )}
          </span>
          <StatusBadge
            tone={sessionUser.role === "admin" ? "admin" : "neutral"}
          >
            {sessionUser.role === "admin" ? "Administrador" : "Usuário"}
          </StatusBadge>
        </div>
      </AdminCard>
      {done
        ? (
          <AdminCard>
            <div
              style={{
                fontSize: "var(--d-lead)",
                fontWeight: 800,
                color: "var(--text-primary)",
              }}
            >
              Senha alterada
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "var(--d-small)",
                color: "var(--text-muted)",
                lineHeight: 1.55,
              }}
            >
              Todas as sessões foram encerradas. Entre novamente com a nova
              senha.
            </p>
            <a
              href="/login"
              className="lift"
              style={{
                ...primaryBtn,
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Ir para o acesso
            </a>
          </AdminCard>
        )
        : (
          <AdminCard>
            <div
              style={{
                fontSize: "var(--d-lead)",
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Alterar senha
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
            <form
              onSubmit={submit}
              style={{ display: "grid", gap: 10 }}
            >
              {pwField(
                "Senha atual",
                current,
                setCurrent,
                "current-password",
                "••••••••••••",
              )}
              {pwField(
                "Nova senha (12+)",
                next,
                setNext,
                "new-password",
                "Mínimo 12 caracteres",
              )}
              {pwField(
                "Confirmar nova senha",
                confirm,
                setConfirm,
                "new-password",
                "Repita a nova senha",
              )}
              <button
                type="submit"
                disabled={busy}
                className="lift"
                style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "Alterando…" : "Alterar senha"}
              </button>
            </form>
          </AdminCard>
        )}
    </div>
  );
}
