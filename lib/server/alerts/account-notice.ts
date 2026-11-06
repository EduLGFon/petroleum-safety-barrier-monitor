// Account notices - tells a person the credential that was just created for
// them, over the channels MSGFLOW already owns.
//
// This is why it exists: the admin screen shows a generated password once and
// never again. Without this, handing it over is a copy-paste into whatever
// chat window happens to be open - which is exactly how a credential ends up
// somewhere nobody can delete it from.
//
// MSGFLOW already carries the monitor's account templates
// (monitor_conta_senha_criada / _reset / _convite, e-mail and whatsapp) and
// exposes /internal/api/monitor/conta. Nothing is templated here: this file
// only says who, which kind, and hands over the secret.
//
// Deliberately NOT fatal. An account is created, or a password reset, because
// somebody is waiting to work - a messaging outage must not undo that. The
// caller reports what happened and still shows the password on screen, which
// is the path that always works.
import {
  assertHttpsUrl,
  type ProviderConfig,
  providerConfigFromEnv,
} from "./provider.ts";

import { log } from "../log.ts";

export type AccountNoticeKind = "senha_criada" | "senha_reset" | "convite";

export interface AccountNoticeInput {
  accountId: number;
  kind: AccountNoticeKind;
  /** Required by MSGFLOW for senha_criada / senha_reset, refused for convite. */
  password?: string;
  name: string;
  /** The address the person signs in with; also the e-mail destination. */
  login: string;
  /** Optional: adds the whatsapp channel when present. */
  phone?: string;
  /**
   * ISO-8601. Only used by "convite", where it becomes the idempotency mark.
   * Pass the same value to retry one invite; pass a new one to resend it.
   */
  occurredAt?: string;
  /**
   * The sentence the person reads, rendered into {{message}}. Leave it out and
   * MSGFLOW writes a generic line for the kind - fine for a password notice,
   * not for an invite that has to explain a change in how people sign in.
   */
  message?: string;
  /**
   * Only reaches the whatsapp message, whose template renders {{title}}. The
   * e-mail subject is fixed in the template and cannot be set from here.
   */
  title?: string;
  /** Hits /conta/teste, which validates everything and sends nothing. */
  dryRun?: boolean;
}

export interface AccountNoticeResult {
  sent: boolean;
  /** Why nothing was sent. Present only when sent is false. */
  reason?: string;
  status?: number;
}

// FetchImpl: the narrow slice of fetch this module needs, so tests can inject
// a stub without touching the network.
export type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const TIMEOUT_MS = 8000;

// loginUrl: where the message's button points. MSGFLOW renders the button
// only when a link arrives (an <a href=""> would be a button going nowhere),
// so an e-mail with no link is an e-mail that tells the person a password and
// not where to use it.
//
// APP_BASE_URL is the public address of this app and the same value the
// cookie's Secure flag is decided from, so if it is wrong the sign-in is
// already broken - there is no second source to disagree with. Only a real
// http/https origin qualifies: a path, query, fragment or embedded
// credentials are dropped entirely instead of being pasted into the message.
function loginUrl(): string {
  let raw = "";
  try {
    raw = (Deno.env.get("APP_BASE_URL") ?? "").trim();
  } catch {
    // No env access: no link, and the button simply does not render.
    return "";
  }
  if (raw === "") return "";
  let normalized: string;
  try {
    normalized = assertHttpsUrl(raw, "APP_BASE_URL");
  } catch {
    return "";
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return "";
  }
  if (url.pathname !== "" && url.pathname !== "/") return "";
  if (url.search !== "" || url.hash !== "") return "";
  if (url.username !== "" || url.password !== "") return "";
  return `${url.origin}/login`;
}

// onlyDigits: MSGFLOW validates the phone itself and answers 422 for a bad
// one. Stripping punctuation here keeps a "(27) 99999-9999" typed by an admin
// from being rejected over its parentheses.
function onlyDigits(raw: string): string {
  return raw.replace(/\D+/g, "");
}

// buildAccountNoticeBody: the MSGFLOW payload, kept pure so the shape can be
// asserted without a network call. One destination per channel is MSGFLOW's
// rule, and the right one: a password has a single owner. A phone adds the
// whatsapp channel, never a second recipient on an existing one.
export function buildAccountNoticeBody(
  input: AccountNoticeInput,
  config: ProviderConfig,
): Record<string, unknown> {
  const login = input.login.trim().toLowerCase();
  if (login === "") throw new Error("login is required");

  const telefone = onlyDigits(input.phone ?? "");
  const canais = ["email"];
  const destinatarios: Array<Record<string, string>> = [
    { canal: "email", valor: login, nome: input.name },
  ];
  if (telefone.length >= 10) {
    canais.push("whatsapp");
    destinatarios.push({
      canal: "whatsapp",
      valor: telefone,
      nome: input.name,
    });
  }

  const body: Record<string, unknown> = {
    company_id: config.companyId,
    // conta_id is a string for MSGFLOW parity: the provider stores and
    // compares it as a string, so a number here would be coerced differently
    // by different clients. Tradeoff: MSGFLOW dedupes by conta_id + tipo, so
    // a second reset of the same kind for the same account can be swallowed
    // as a duplicate. That is acceptable because the admin still has the
    // password on screen; a random id would make every retry send a second
    // message instead.
    conta_id: String(input.accountId),
    tipo: input.kind,
    pessoa: { nome: input.name, login },
    canais,
    destinatarios,
  };
  // Nothing is sent for validade_horas on purpose: these passwords have no
  // expiry, and MSGFLOW would print "expires in N hours" - a sentence the
  // system cannot keep.
  const url = loginUrl();
  if (url !== "") body.link_login = url;
  if (input.message) body.mensagem = input.message;
  if (input.title) body.titulo = input.title;
  // Sent only for the kinds that take it. MSGFLOW refuses a password on
  // "convite" on purpose - that template has no {{senha}} slot, so the secret
  // would vanish silently on the way.
  if (input.kind !== "convite" && input.password) {
    body.senha = input.password;
  }
  // An invite carries no secret, so MSGFLOW cannot build an idempotency key
  // from one and asks for a timestamp instead - and it is right to: resending
  // an invite is a feature (the first mail got lost), and without a mark it
  // would dedupe every resend forever. The caller may pass the moment it is
  // acting on; otherwise this send is its own moment.
  if (input.kind === "convite") {
    body.ocorrido_em = input.occurredAt ?? new Date().toISOString();
  }
  return body;
}

// providerReason: a short, safe explanation for a failed send. MSGFLOW echoes
// the request payload on validation errors, so the raw body may contain the
// password. Only the envelope's `erro`/`mensagem` strings survive, with the
// exact secret scrubbed; anything else becomes HTTP <status>.
async function providerReason(
  res: Response,
  password: string | undefined,
): Promise<string> {
  const fallback = `HTTP ${res.status}`;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  if (text === "") return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (parsed === null || typeof parsed !== "object") return fallback;
  const envelope = parsed as Record<string, unknown>;
  const candidate = [envelope.erro, envelope.mensagem].find(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );
  if (candidate === undefined) return fallback;
  // SECURITY: test the whole decoded candidate and the raw body before any
  // truncation. Slicing first could cut the password at the boundary and
  // return a prefix of the secret.
  const full = candidate.trim();
  if (
    password !== undefined && password !== "" &&
    (full.includes(password) || text.includes(password))
  ) {
    return fallback;
  }
  return `HTTP ${res.status}: ${full.slice(0, 200)}`;
}

export async function sendAccountNotice(
  input: AccountNoticeInput,
  fetchImpl: FetchImpl = fetch,
): Promise<AccountNoticeResult> {
  let config;
  try {
    config = providerConfigFromEnv();
  } catch (err) {
    // No provider configured is a deployment choice, not an incident.
    return {
      sent: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  let body: Record<string, unknown>;
  try {
    body = buildAccountNoticeBody(input, config);
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const path = input.dryRun
    ? "/internal/api/monitor/conta/teste"
    : "/internal/api/monitor/conta";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MSGFLOW-TOKEN": config.token,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (res.status >= 200 && res.status < 300) {
      // The body is read and dropped: nothing here may log the password.
      await res.text().catch(() => "");
      return { sent: true, status: res.status };
    }
    const motivo = await providerReason(res, input.password);
    log.child({ scope: "account-notice" }).warn("MSGFLOW rejected notice", {
      kind: input.kind,
      accountId: input.accountId,
      status: res.status,
    });
    return { sent: false, reason: motivo, status: res.status };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    log.child({ scope: "account-notice" }).warn("MSGFLOW unreachable", {
      kind: input.kind,
      accountId: input.accountId,
    });
    return { sent: false, reason: motivo };
  } finally {
    clearTimeout(timer);
  }
}
