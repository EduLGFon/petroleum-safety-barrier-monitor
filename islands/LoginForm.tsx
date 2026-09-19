// LoginForm - immersive Blurred Dashboard credential screen.
// This is why it exists: production login floats a glass credential card
// over a blurred dashboard preview, with PT copy, show/hide password,
// localized errors and first-admin bootstrap.
import { BlurredBackdrop } from "../components/login/BlurredBackdrop.tsx";
import { BrandHeader } from "../components/login/BrandHeader.tsx";
import { TrustFooter } from "../components/login/TrustFooter.tsx";
import { toPtError } from "../lib/api/error-pt.ts";
import { useState } from "preact/hooks";
import { AURORA } from "../lib/aurora.ts";

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

const labelStyle = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--au-label)",
  letterSpacing: ".02em",
} as const;

// safeNext: client mirror of the server gate - only same-origin absolute
// paths qualify as post-login targets, so a crafted ?next= cannot bounce
// the user to an external site after signing in.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return "/";
  return raw;
}

// LoginForm: blurred preview behind, glass card over it; reloads on success.
export function LoginForm({ companyName = "" }: { companyName?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await postJson("/api/auth/login", { email, password });
        const params = new URLSearchParams(globalThis.location.search);
        globalThis.location.href = safeNext(params.get("next"));
      } else {
        await postJson("/api/users", { email, name, password });
        globalThis.location.href = "/admin";
      }
    } catch (err) {
      setError(toPtError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="animate-fade-in"
      style={{ position: "relative", width: "100%", maxWidth: 880 }}
    >
      <BlurredBackdrop />
      <div
        style={{ display: "flex", justifyContent: "center", marginTop: -90 }}
      >
        <div
          className="glass-card animate-scale-in"
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 400,
            background: AURORA.card,
            border: `1px solid ${AURORA.cardBorder}`,
            borderRadius: 20,
            padding: "30px 28px 24px",
            boxShadow: "0 32px 80px rgba(0,0,0,.6)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "8%",
              right: "8%",
              height: 1,
              background:
                "linear-gradient(90deg,transparent,var(--accent),var(--accent-2),transparent)",
              borderRadius: 1,
            }}
          />
          <BrandHeader
            companyName={companyName}
            markSize={52}
            title={mode === "login"
              ? "Monitor de Barreiras"
              : "Criar primeiro acesso"}
            subtitle={mode === "login"
              ? "Entre com suas credenciais corporativas"
              : "Banco vazio: esta conta será administradora"}
          />
          <div
            style={{
              height: 1,
              margin: "20px 0",
              background:
                "linear-gradient(90deg,transparent,var(--glow),transparent)",
            }}
          />
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
            <label style={labelStyle}>
              E-mail corporativo
              <input
                className="login-input"
                type="email"
                required
                value={email}
                placeholder="voce@operadora.com"
                onInput={(e) => setEmail(e.currentTarget.value)}
                autoComplete="email"
              />
            </label>
            {mode === "register" && (
              <label style={labelStyle} className="animate-fade-in">
                Nome
                <input
                  className="login-input"
                  type="text"
                  value={name}
                  placeholder="Nome completo"
                  onInput={(e) =>
                    setName(e.currentTarget.value)}
                  autoComplete="name"
                />
              </label>
            )}
            <label style={labelStyle}>
              <span>
                Senha {mode === "register" ? "(mínimo 12 caracteres)" : ""}
              </span>
              <span style={{ position: "relative", display: "block" }}>
                <input
                  className="login-input"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={mode === "register" ? 12 : undefined}
                  value={password}
                  placeholder="••••••••••••"
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  autoComplete={mode === "login"
                    ? "current-password"
                    : "new-password"}
                  style={{ paddingRight: 64 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: 0,
                    background: "transparent",
                    color: "var(--au-sub)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "6px 8px",
                  }}
                >
                  {showPw ? "Ocultar" : "Mostrar"}
                </button>
              </span>
            </label>
            {error && (
              <div
                role="alert"
                className="animate-fade-in"
                style={{
                  background: "var(--au-danger-bg)",
                  border: "1px solid var(--alert-nc-border)",
                  color: "var(--au-danger-fg)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="lift"
              style={{
                height: 44,
                border: 0,
                borderRadius: 10,
                background: AURORA.grad,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: ".01em",
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.75 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: "0 8px 28px var(--glow)",
              }}
            >
              {busy && (
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,.4)",
                    borderTopColor: "#fff",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
              )}
              {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar admin"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              style={{
                border: 0,
                background: "transparent",
                color: "var(--au-label)",
                fontSize: 13,
                cursor: "pointer",
                padding: 4,
              }}
            >
              {mode === "login" ? "Criar primeiro acesso" : "Voltar ao login"}
            </button>
          </form>
          <div style={{ marginTop: 18 }}>
            <TrustFooter companyName={companyName} />
          </div>
        </div>
      </div>
    </div>
  );
}
