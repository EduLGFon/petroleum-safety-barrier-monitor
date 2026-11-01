// Minimal Deno-native SMTP submission client (P3 ops alerting, optional).
// This is why it exists: sync failures must never go silent, and ops email is
// the optional escalation channel. One submit path (MAIL FROM / RCPT TO /
// DATA) with EHLO + optional STARTTLS + AUTH PLAIN / AUTH LOGIN fallback. Boundary code: the socket
// and line IO are isolated behind small interfaces so the whole sequence is
// testable headless with a scripted fake socket (real TLS is never touched
// in tests).

export interface SmtpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void;
}

export interface SmtpConnectOptions {
  hostname: string;
  port: number;
  secure: boolean; // implicit TLS (465) vs plain + STARTTLS upgrade
}

// SmtpUpgrader: swaps a plain socket for a TLS socket after STARTTLS. The
// original Deno TcpConn exposes the startTls on the upgraded side; the
// connector owns that detail.
export type SmtpUpgrader = (socket: SmtpSocket) => Promise<SmtpSocket>;

export type SmtpConnector = (
  opts: SmtpConnectOptions,
) => Promise<{ socket: SmtpSocket; upgrade?: SmtpUpgrader }>;

export const defaultSmtpConnector: SmtpConnector = async ({
  hostname,
  port,
  secure,
}) => {
  if (secure) return { socket: await Deno.connectTls({ hostname, port }) };
  const conn = await Deno.connect({ hostname, port });
  return {
    socket: conn,
    upgrade: (s) => Deno.startTls(s as Deno.TcpConn, { hostname }),
  };
};

export interface SmtpConfig {
  hostname: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  to: string;
  secure?: boolean;
  connector?: SmtpConnector; // defaults to defaultSmtpConnector
  // requireTls overrides SMTP_REQUIRE_TLS env (default 1 in prod).
  requireTls?: boolean;
  // timeoutMs bounds one submission (default 30_000).
  timeoutMs?: number;
}

// SMTP_SEND_TIMEOUT_MS: one submission must stay bounded so a hung relay
// can never stall the poll cycle/runner (they await notifiers).
export const SMTP_SEND_TIMEOUT_MS = 30_000;

// smtpRequireTls: SMTP_REQUIRE_TLS=0/false opts out; "1"/"true" opts in.
// Unset defaults to 1 in prod (DENO_ENV/NODE_ENV/ENV=production) and 0
// elsewhere so local dev and headless tests keep plaintext fakes working.
export function smtpRequireTls(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  try {
    const raw = Deno.env.get("SMTP_REQUIRE_TLS");
    if (raw !== undefined) {
      const v = raw.trim().toLowerCase();
      if (v === "0" || v === "false" || v === "no" || v === "off") {
        return false;
      }
      if (v === "1" || v === "true" || v === "yes" || v === "on") {
        return true;
      }
      if (v !== "") return true;
    }
  } catch {
    return false;
  }
  try {
    const env = (Deno.env.get("DENO_ENV") ?? Deno.env.get("NODE_ENV") ??
      Deno.env.get("ENV") ?? "").trim().toLowerCase();
    if (env === "production" || env === "prod") return true;
  } catch {
    // No env access - stay permissive for headless tests.
  }
  return false;
}

// raceWithSignal: bounds one socket op by an AbortSignal (timeout or
// caller cancel). The underlying read/write promise stays pending but the
// submission rejects promptly, so SmtpLineIO honors the signal.
function raceWithSignal<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("[smtp] aborted"));
  return Promise.race([
    task,
    new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(signal.reason ?? new Error("[smtp] timed out")),
        { once: true },
      );
    }),
  ]);
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error("[smtp] timed out")), ms);
  return ctrl.signal;
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof (AbortSignal as unknown as { any?: unknown }).any === "function") {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([a, b]);
  }
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(a.aborted ? a.reason : b.reason);
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

// SmtpLineIO: command/response state machine over a streaming socket.
// Accepts an optional AbortSignal so a hung relay (or the 30s sendMail
// timeout) bounds every read/write; the poll cycle/runner stay bounded
// because they await notifiers that await this bounded send.
class SmtpLineIO {
  #socket: SmtpSocket;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null;
  #buffer = "";
  #decoder = new TextDecoder();
  #encoder = new TextEncoder();
  #signal?: AbortSignal;

  constructor(socket: SmtpSocket, signal?: AbortSignal) {
    this.#socket = socket;
    this.#reader = socket.readable.getReader();
    this.#signal = signal;
  }

  #throwIfAborted(): void {
    this.#signal?.throwIfAborted();
  }

  // releaseReader: releases the reader lock so the underlying socket can be
  // handed to Deno.startTls (which throws BadResource "Bad resource ID"
  // while either stream is still locked). It must NOT cancel: cancelling
  // the readable tears down the TCP resource itself, which is exactly
  // what made startTls fail. Callers only invoke this right after a
  // completed reply, so no unread bytes are outstanding.
  releaseReader(): void {
    if (this.#reader !== null) {
      try {
        this.#reader.releaseLock();
      } catch {
        // Already released - upgrade must still proceed.
      }
      this.#reader = null;
    }
  }

  // nextRawLine: next CRLF line, reconnecting the reader after an upgrade.
  private async nextRawLine(): Promise<string> {
    this.#throwIfAborted();
    while (true) {
      const nl = this.#buffer.indexOf("\n");
      if (nl >= 0) {
        const line = this.#buffer.slice(0, nl).replace(/\r$/, "");
        this.#buffer = this.#buffer.slice(nl + 1);
        return line;
      }
      if (this.#reader === null) {
        throw new Error("[smtp] reader released before reply");
      }
      const { value, done } = await raceWithSignal(
        this.#reader.read(),
        this.#signal,
      );
      if (done) throw new Error("[smtp] connection closed mid-line");
      this.#buffer += this.#decoder.decode(value, { stream: true });
    }
  }

  // readReply: one reply, joining continuation lines ("250-...").
  async readReply(): Promise<string> {
    const first = await this.nextRawLine();
    const code = first.slice(0, 3);
    if (first.length >= 4 && first[3] === "-") {
      let tail = first.slice(4);
      while (true) {
        const next = await this.nextRawLine();
        if (next.length >= 4 && next[3] === "-") {
          tail += "\n" + next.slice(4);
          continue;
        }
        return `${code} ${tail}\n${next}`.replace(/\r$/, "");
      }
    }
    return first;
  }

  // expectCode: reads a reply and throws unless its code matches.
  async expectCode(expected: number): Promise<string> {
    const reply = await this.readReply();
    const code = Number(reply.slice(0, 3));
    if (code !== expected) {
      throw new Error(`[smtp] expected ${expected}, got ${code}: ${reply}`);
    }
    return reply;
  }

  private async writeRaw(data: string): Promise<void> {
    this.#throwIfAborted();
    const writer = this.#socket.writable.getWriter();
    try {
      await raceWithSignal(
        writer.write(this.#encoder.encode(data)),
        this.#signal,
      );
    } finally {
      writer.releaseLock();
    }
  }

  // ehlo: sends EHLO and returns the capability words from the reply.
  async ehlo(caps: string[]): Promise<Set<string>> {
    await this.writeRaw(`EHLO barrier-monitor.local\r\n`);
    const reply = await this.readReply();
    if (Number(reply.slice(0, 3)) !== 250) {
      throw new Error(`[smtp] EHLO rejected: ${reply}`);
    }
    const words = new Set<string>();
    for (const line of reply.replace(/\r/g, "").split("\n")) {
      for (const w of line.split(" ")) if (w) words.add(w.toUpperCase());
    }
    for (const c of caps) words.add(c.toUpperCase());
    return words;
  }

  // command: send a verb line and expect its reply code.
  async command(verb: string, expected: number): Promise<void> {
    await this.writeRaw(`${verb}\r\n`);
    await this.expectCode(expected);
  }

  // sendData: the message body, dot-stuffed, terminated by ".".
  async sendData(message: string): Promise<void> {
    this.#throwIfAborted();
    const stuffed = message.replace(/^\./gm, "..");
    const writer = this.#socket.writable.getWriter();
    try {
      await raceWithSignal(
        writer.write(this.#encoder.encode(`${stuffed}\r\n.\r\n`)),
        this.#signal,
      );
    } finally {
      writer.releaseLock();
    }
    await this.expectCode(250);
  }

  close(): void {
    if (this.#reader !== null) {
      try {
        // cancel() may throw synchronously on a dead resource and may
        // reject async after a peer FIN - neither may fail the send.
        this.#reader.cancel().catch((err) => {
          console.warn("[smtp] reader cancel failed", err);
        });
      } catch {
        // fall through to unlock + close below
      }
      try {
        this.#reader.releaseLock();
      } catch {
        // already unlocked - safe to close the socket
      }
      this.#reader = null;
    }
    try {
      this.#socket.close();
    } catch {
      // Already closed by the peer (normal right after QUIT/221) - the
      // mail was accepted, so a close race must never fail the send.
    }
  }
}

// sanitizeHeader: strip CR/LF to block header injection, cap at 998 chars
// (RFC 5322 line limit) before building the DATA head.
function sanitizeHeader(v: string): string {
  return v.replace(/[\r\n]+/g, " ").slice(0, 998);
}

// assertEnvelopeAddress: validates MAIL FROM / RCPT TO envelope addresses.
// Throws on CR/LF or angle brackets (injection) and on non-email shapes.
function assertEnvelopeAddress(addr: string, label: string): void {
  if (/[\r\n<>]/.test(addr)) {
    throw new Error(`[smtp] invalid ${label} address`);
  }
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(addr)) {
    throw new Error(`[smtp] invalid ${label} address`);
  }
}
 
// b64 utf8: base64 for AUTH PLAIN and RFC2047 subject encoding.
function b64(data: Uint8Array): string {
  let bin = "";
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin);
}

// encodeSubject: RFC2047 encoded-word when the subject is non-ASCII.
export function encodeSubject(subject: string): string {
  if (/[\x80-\uffff]/.test(subject)) {
    return `=?UTF-8?B?${b64(new TextEncoder().encode(subject))}?=`;
  }
  return subject;
}

// composeMessage: single-part text/plain without html, otherwise
// multipart/alternative (plain fallback first, HTML part second) with CRLF.
export function composeMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  date: string,
  html?: string,
): string {
  // Validate envelope addresses on the raw values first (sanitizing would
  // hide an injection attempt); headers are sanitized before building head.
  assertEnvelopeAddress(from, "from");
  assertEnvelopeAddress(to, "to");
  const safeFrom = sanitizeHeader(from);
  const safeTo = sanitizeHeader(to);
  const safeSubject = sanitizeHeader(subject);
  const safeDate = sanitizeHeader(date);
  const head = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${encodeSubject(safeSubject)}`,
    `Date: ${safeDate}`,
    `MIME-Version: 1.0`,
  ];
  const bodyCrlf = body.replace(/\n/g, "\r\n");
  if (!html) {
    return `${
      [...head, `Content-Type: text/plain; charset=utf-8`].join("\r\n")
    }\r\n\r\n${bodyCrlf}`;
  }
  const boundary = `barrier-${crypto.randomUUID().replace(/-/g, "")}`;
  const htmlCrlf = html.replace(/\r?\n/g, "\r\n");
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    bodyCrlf,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    htmlCrlf,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

// authPlain: single-round AUTH PLAIN (Gmail advertises it).
async function authPlain(
  io: SmtpLineIO,
  user: string,
  pass: string,
): Promise<void> {
  const token = b64(
    new TextEncoder().encode(`\u0000${user}\u0000${pass}`),
  );
  await io.command(`AUTH PLAIN ${token}`, 235);
}

// authLogin: challenge-response AUTH LOGIN (Outlook/Exchange advertises
// LOGIN only - no PLAIN). No-initial-response flow for widest compat:
// server sends "334 VXNlcm5hbWU6" (Username:), we answer with b64(user),
// then "334 UGFzc3dvcmQ6" (Password:), we answer with b64(pass).
async function authLogin(
  io: SmtpLineIO,
  user: string,
  pass: string,
): Promise<void> {
  await io.command("AUTH LOGIN", 334);
  await io.command(b64(new TextEncoder().encode(user)), 334);
  await io.command(b64(new TextEncoder().encode(pass)), 235);
}

// authenticate: pick a mechanism from EHLO caps, with cross-fallback.
// Gmail advertises PLAIN+LOGIN (prefer PLAIN, one roundtrip); Outlook
// advertises LOGIN only (must use LOGIN); servers advertising neither
// (or fakes in tests) still try PLAIN first then LOGIN, so an
// unadvertised LOGIN-only relay still connects.
async function authenticate(
  io: SmtpLineIO,
  caps: Set<string>,
  user: string,
  pass: string,
): Promise<void> {
  // Gmail shows the app password spaced ("xxxx xxxx xxxx xxxx") but the
  // SMTP secret is the 16 letters without whitespace - normalize here so
  // both paste styles work.
  user = user.trim();
  pass = pass.replace(/\s+/g, "");
  const hasPlain = caps.has("PLAIN");
  const hasLogin = caps.has("LOGIN");
  const order: Array<"PLAIN" | "LOGIN"> = hasPlain && !hasLogin
    ? ["PLAIN", "LOGIN"]
    : !hasPlain && hasLogin
    ? ["LOGIN", "PLAIN"]
    : ["PLAIN", "LOGIN"];
  let last: unknown = null;
  for (const mech of order) {
    try {
      if (mech === "PLAIN") await authPlain(io, user, pass);
      else await authLogin(io, user, pass);
      return;
    } catch (err) {
      last = err;
      // PLAIN rejected (535 auth failed, 504 unrecognized) falls through
      // to LOGIN and vice versa; anything else would fail twice anyway.
    }
  }
  throw last;
}

// sendMail: one submission, best-effort semantics live in the caller.
// html (when given) rides as the multipart/alternative rich part.
// Bounded by timeoutMs (default SMTP_SEND_TIMEOUT_MS): the connector and
// every line IO race an AbortSignal.timeout so a hung relay can never stall
// the poll cycle/runner that awaits notifiers.
export async function sendMail(
  config: SmtpConfig,
  subject: string,
  body: string,
  html?: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<void> {
  // Validate envelope addresses before any network IO (header sanitizing in
  // composeMessage would otherwise hide an injection attempt).
  assertEnvelopeAddress(config.from, "from");
  assertEnvelopeAddress(config.to, "to");
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs ??
    SMTP_SEND_TIMEOUT_MS;
  const timeout = timeoutSignal(timeoutMs);
  const signal = options?.signal
    ? combineSignals(options.signal, timeout)
    : timeout;
  signal.throwIfAborted();
  const secure = config.secure ?? config.port === 465;
  const connector = config.connector ?? defaultSmtpConnector;
  const { socket, upgrade } = await raceWithSignal(
    connector({
      hostname: config.hostname,
      port: config.port,
      secure,
    }),
    signal,
  );
  let conn: SmtpSocket = socket;
  let io = new SmtpLineIO(conn, signal);
  let upgraded = false;
  try {
    await io.expectCode(220);
    let caps = await io.ehlo([]);
    if (!secure && upgrade && caps.has("STARTTLS")) {
      await io.command("STARTTLS", 220);
      await io.releaseReader();
      conn = await raceWithSignal(upgrade(conn), signal);
      io = new SmtpLineIO(conn, signal);
      caps = await io.ehlo([]);
      upgraded = true;
    }
    // STARTTLS downgrade guard: credentials must not cross plaintext.
    // SMTP_REQUIRE_TLS=1 (default in prod) refuses; otherwise log the
    // downgrade and continue for local/dev fakes.
    if (config.user !== undefined && !(secure || upgraded)) {
      const requireTLS = smtpRequireTls(config.requireTls);
      const msg =
        "[smtp] STARTTLS downgrade: refusing plaintext auth without TLS (SMTP_REQUIRE_TLS=1)";
      if (requireTLS) throw new Error(msg);
      console.warn(msg);
    }
    if (config.user !== undefined) {
      await authenticate(io, caps, config.user, config.pass ?? "");
    }
    await io.command(`MAIL FROM:<${config.from}>`, 250);
    await io.command(`RCPT TO:<${config.to}>`, 250);
    await io.command("DATA", 354);
    await io.sendData(
      composeMessage(
        config.from,
        config.to,
        subject,
        body,
        new Date().toUTCString(),
        html,
      ),
    );
    await io.command("QUIT", 221);
  } finally {
    io.close();
  }
}
