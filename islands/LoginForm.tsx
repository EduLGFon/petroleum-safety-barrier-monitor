// LoginForm - email + password login plus first-admin bootstrap.
// This is why it exists: dashboard users need a PT login screen that sets
// the HttpOnly session cookie; a fresh database offers one registration
// form that always creates the first admin.
import { useState } from "preact/hooks";

type Mode = "login" | "register";

// postJson: fetch helper that sends cookies and parses error envelopes.
async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = await res.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Keep the status fallback when the body is not JSON.
    }
    throw new Error(message);
  }
  return await res.json();
}

// LoginForm: PT login/register card; shows localized errors and reloads on success.
export function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await postJson("/api/auth/login", { email, password });
        globalThis.location.href = "/";
      } else {
        await postJson("/api/users", { email, name, password });
        globalThis.location.href = "/admin";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "grid", gap: 12, maxWidth: 360, width: "100%" }}
    >
      <h1 style={{ margin: 0 }}>
        {mode === "login" ? "Acesso" : "Criar primeiro acesso"}
      </h1>
      <label style={{ display: "grid", gap: 4 }}>
        E-mail
        <input
          type="email"
          required
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
          autoComplete="email"
        />
      </label>
      {mode === "register" && (
        <label style={{ display: "grid", gap: 4 }}>
          Nome
          <input
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoComplete="name"
          />
        </label>
      )}
      <label style={{ display: "grid", gap: 4 }}>
        Senha {mode === "register" ? "(mínimo 12 caracteres)" : ""}
        <input
          type="password"
          required
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error && (
        <div role="alert" style={{ color: "var(--alert-nc-text)" }}>
          {error}
        </div>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar admin"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Criar primeiro acesso" : "Voltar ao login"}
      </button>
    </form>
  );
}
