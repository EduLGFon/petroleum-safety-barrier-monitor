// Minimal Deno-native SMTP submission client (P3 ops alerting, optional).
// This is why it exists: sync failures must never go silent, and ops email is
// the optional escalation channel. One submit path (MAIL FROM / RCPT TO /
// DATA) with EHLO + optional STARTTLS + AUTH PLAIN. Boundary code: the socket
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
}

// SmtpLineIO: command/response state machine over a streaming socket.
class SmtpLineIO {
  #socket: SmtpSocket;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null;
  #buffer = "";
  #decoder = new TextDecoder();
  #encoder = new TextEncoder();

  constructor(socket: SmtpSocket) {
    this.#socket = socket;
    this.#reader = socket.readable.getReader();
  }

  // releaseReader: cancels the current reader so the underlying socket can be
  // handed to Deno.startTls (which requires both streams unlocked).
  async releaseReader(): Promise<void> {
    if (this.#reader !== null) {
      await this.#reader.cancel();
      this.#reader = null;
    }
  }

  // nextRawLine: next CRLF line, reconnecting the reader after an upgrade.
  private async nextRawLine(): Promise<string> {
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
      const { value, done } = await this.#reader.read();
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
    const writer = this.#socket.writable.getWriter();
    try {
      await writer.write(this.#encoder.encode(data));
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
    const stuffed = message.replace(/^\./gm, "..");
    const writer = this.#socket.writable.getWriter();
    try {
      await writer.write(this.#encoder.encode(`${stuffed}\r\n.\r\n`));
    } finally {
      writer.releaseLock();
    }
    await this.expectCode(250);
  }

  close(): void {
    if (this.#reader !== null) {
      this.#reader.cancel().catch(() => {});
    }
    this.#socket.close();
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

// composeMessage: minimal single-part text/plain message with CRLF.
export function composeMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  date: string,
): string {
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
  ].join("\r\n");
  const bodyCrlf = body.replace(/\n/g, "\r\n");
  return `${head}\r\n\r\n${bodyCrlf}`;
}

// sendMail: one submission, best-effort semantics live in the caller.
export async function sendMail(
  config: SmtpConfig,
  subject: string,
  body: string,
): Promise<void> {
  const connector = config.connector ?? defaultSmtpConnector;
  const { socket, upgrade } = await connector({
    hostname: config.hostname,
    port: config.port,
    secure: config.secure ?? false,
  });
  let conn: SmtpSocket = socket;
  let io = new SmtpLineIO(conn);
  try {
    await io.expectCode(220);
    let caps = await io.ehlo([]);
    if (!(config.secure ?? false) && upgrade && caps.has("STARTTLS")) {
      await io.command("STARTTLS", 220);
      await io.releaseReader();
      conn = await upgrade(conn);
      io = new SmtpLineIO(conn);
      caps = await io.ehlo([...caps]);
    }
    if (config.user !== undefined) {
      const token = b64(
        new TextEncoder().encode(
          `\u0000${config.user}\u0000${config.pass ?? ""}`,
        ),
      );
      await io.command(`AUTH PLAIN ${token}`, 235);
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
      ),
    );
    await io.command("QUIT", 221);
  } finally {
    io.close();
  }
}
