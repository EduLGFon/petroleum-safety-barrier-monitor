// Island: the only screen a pending account can reach.
// This is why it exists: an account created with a system-generated password
// is authenticated but held at the door by the API guards (403
// PASSWORD_CHANGE_REQUIRED on every other route). Without a screen of its
// own the person would see a dashboard made of errors and no way out.
//
// The form posts to the same self-service endpoint the Conta tab uses, so
// there is one password-change path in the app, not two. Passwords stay in
// local component state only: never in storage, never in logs.
import { toPtError } from "../lib/api/error-pt.ts";

import { apiFetch } from "../lib/api/http.ts";

import { useState } from "preact/hooks";

// extrairMensagemErro: reads the { error: string, code, requestId } envelope
// the API returns. A string error maps through toPtError; anything else falls
// back to a localized status message. Never touches error.message objects.
export function extrairMensagemErro(corpo: unknown, status: number): string {
  if (typeof corpo === "object" && corpo !== null) {
    const erro = (corpo as { error?: unknown }).error;
    if (typeof erro === "string" && erro.trim() !== "") {
      return toPtError(erro);
    }
  }
  return `Falha ao trocar a senha (${status}).`;
}

export function ForcePasswordChange({ email }: { email: string }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: Event) {
    e.preventDefault();
    setErro(null);
    if (nova !== confirma) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }
    setOcupado(true);
    try {
      const res = await apiFetch("/api/auth/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: atual, newPassword: nova }),
      });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        throw new Error(extrairMensagemErro(corpo, res.status));
      }
      // The endpoint revokes every session, this one included, and expires
      // the cookie. Sending the person to /login is not a courtesy: it is
      // the only place they can go now, and with the new password. Clear the
      // fields first so no password lingers in component state.
      setAtual("");
      setNova("");
      setConfirma("");
      setPronto(true);
      globalThis.setTimeout(() => {
        globalThis.location.href = "/login";
      }, 1500);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  }

  const campo = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border, #334155)",
    background: "var(--bg-2, #0f172a)",
    color: "inherit",
    fontSize: 15,
  } as const;

  if (pronto) {
    return (
      <p>
        Senha trocada. Entre de novo com a senha nova. Levando você para a tela
        de acesso…
      </p>
    );
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, opacity: 0.85 }}>
        A senha de <strong>{email}</strong>{" "}
        foi gerada pelo sistema. Escolha uma só sua para continuar.
      </p>
      {erro && (
        <div
          role="alert"
          style={{
            border: "1px solid var(--danger, #b91c1c)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          {erro}
        </div>
      )}
      <label style={{ display: "grid", gap: 4 }}>
        <span>Senha atual (a que você recebeu)</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={atual}
          onInput={(e) => setAtual(e.currentTarget.value)}
          style={campo}
        />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Nova senha (mínimo 12 caracteres)</span>
        <input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={nova}
          onInput={(e) => setNova(e.currentTarget.value)}
          style={campo}
        />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Repita a nova senha</span>
        <input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={confirma}
          onInput={(e) => setConfirma(e.currentTarget.value)}
          style={campo}
        />
      </label>
      <button
        type="submit"
        disabled={ocupado}
        style={{
          padding: "11px 14px",
          borderRadius: 8,
          border: "none",
          fontSize: 15,
          cursor: ocupado ? "default" : "pointer",
          background: "var(--accent, #4338ca)",
          color: "#fff",
        }}
      >
        {ocupado ? "Aguarde…" : "Trocar a senha"}
      </button>
    </form>
  );
}
