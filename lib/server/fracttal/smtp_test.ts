// Unit tests for the SMTP submission client (P3). A scripted fake socket
// replays a server conversation; the real TLS path is never exercised here.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import {
  composeMessage,
  encodeSubject,
  sendMail,
  type SmtpConfig,
  type SmtpConnector,
  type SmtpSocket,
} from "./smtp.ts";

// fakeSocket: a scripted SMTP server. Each command \n-line the client sends
// consumes the next scripted reply; after a DATA command the dot-terminated
// payload is swallowed before that next reply is consumed. A second socket
// models the post-STARTTLS connection (a fresh Deno.startTls socket).
function fakeSocket(
  script: string[],
): { socket: SmtpSocket; tls: SmtpSocket; received: () => string } {
  const replies = [...script];
  const received: string[] = [];

  const encoder = new TextEncoder();
  const make = (seed: string | null): SmtpSocket => {
    let incoming = "";
    let dataModeLocal = false;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const enqueueReply = () => {
      controller.enqueue(
        encoder.encode((replies.shift() ?? "250 2.0.0 ok") + "\r\n"),
      );
    };
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        incoming += new TextDecoder().decode(chunk);
        for (;;) {
          const nl = incoming.indexOf("\r\n");
          if (nl === -1) break;
          const line = incoming.slice(0, nl);
          incoming = incoming.slice(nl + 2);
          received.push(line);
          if (line.toUpperCase().startsWith("DATA")) {
            // reply 354 now; the body arrives next.
            dataModeLocal = true;
            enqueueReply();
          } else if (dataModeLocal && line === ".") {
            // the dot-terminated body ends here; reply with acceptance.
            dataModeLocal = false;
            enqueueReply();
          } else if (!dataModeLocal) {
            enqueueReply();
          }
        }
      },
    });
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        if (seed !== null) c.enqueue(encoder.encode(seed + "\r\n"));
      },
    });
    return {
      readable,
      writable,
      close() {
        try {
          controller.error(new Error("connection closed by client"));
        } catch {
          // already errored
        }
      },
    };
  };

  const socket = make(replies.shift() ?? "220 fake ESMTP");
  const tls = make(null);

  return {
    socket,
    tls,
    received: () => received.join("\n"),
  };
}

function config(over: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    hostname: "smtp.example.com",
    port: 587,
    from: "ops@example.com",
    to: "team@example.com",
    ...over,
  };
}

function plainConnector(socket: SmtpSocket): SmtpConnector {
  return () => Promise.resolve({ socket });
}

Deno.test("sendMail walks the full plain submit sequence", async () => {
  const fake = fakeSocket([
    "220 fake ESMTP",
    "250-fake ESMTP\r\n250-AUTH PLAIN LOGIN\r\n250 OK",
    "235 2.7.0 Authentication successful",
    "250 2.1.0 Sender ok",
    "250 2.1.5 Recipient ok",
    "354 End data with <CR><LF>.<CR><LF>",
    "250 2.0.0 Message accepted",
    "221 2.0.0 Bye",
  ]);
  await sendMail(
    config({
      connector: plainConnector(fake.socket),
      user: "ops@example.com",
      pass: "sekret",
    }),
    "sync failed: scope x",
    "body line 1\n.dot\n.leading",
  );
  const log = fake.received();
  assertStrictEquals(log.includes("EHLO barrier-monitor.local"), true);
  assertStrictEquals(log.includes("STARTTLS"), false);
  assertStrictEquals(log.includes("AUTH PLAIN"), true);
  assertStrictEquals(log.includes("MAIL FROM:<ops@example.com>"), true);
  assertStrictEquals(log.includes("RCPT TO:<team@example.com>"), true);
  assertStrictEquals(log.includes("DATA"), true);
  // dot-stuffing: body lines starting with "." get doubled.
  const lines = fake.received().split("\n");
  assertStrictEquals(lines.includes("..dot"), true);
  assertStrictEquals(lines.includes("..leading"), true);
  assertStrictEquals(log.includes("QUIT"), true);
});

Deno.test("sendMail tolerates a peer-closed socket on close", async () => {
  const fake = fakeSocket([
    "220 fake ESMTP",
    "250 fake",
    "250 2.1.0 Sender ok",
    "250 2.1.5 Recipient ok",
    "354 End data",
    "250 2.0.0 Message accepted",
    "221 2.0.0 Bye",
  ]);
  const closing: SmtpSocket = {
    ...fake.socket,
    close() {
      // Models Deno reaping the rid after the peer's FIN post-QUIT.
      throw new Deno.errors.BadResource("Bad resource ID");
    },
  };
  await sendMail(
    config({ connector: plainConnector(closing) }),
    "s",
    "b",
  );
});

Deno.test("sendMail rejects a non-220 greeting", async () => {
  const fake = fakeSocket(["421 Service not available"]);
  await assertRejectsSmpt(
    sendMail(config({ connector: plainConnector(fake.socket) }), "s", "b"),
    "expected 220",
  );
});

Deno.test("sendMail upgrades via STARTTLS when advertised", async () => {
  const fake = fakeSocket([
    "220 fake ESMTP",
    "250-STARTTLS\r\n250 8BITMIME",
    "220 2.0.0 Ready to start TLS",
    "250 8BITMIME",
    "250 2.1.0 Sender ok",
    "250 2.1.5 Recipient ok",
    "354 End data",
    "250 2.0.0 Message accepted",
    "221 2.0.0 Bye",
  ]);
  const upgrades: unknown[] = [];
  const upgrade = (s: SmtpSocket): Promise<SmtpSocket> => {
    upgrades.push(s);
    return Promise.resolve(fake.tls);
  };
  await sendMail(
    config({
      connector: () => Promise.resolve({ socket: fake.socket, upgrade }),
    }),
    "s",
    "b",
  );
  assertStrictEquals(upgrades.length, 1);
  const log = fake.received();
  assertStrictEquals(log.includes("STARTTLS"), true);
  assertStrictEquals(log.match(/EHLO/g)?.length, 2);
});

Deno.test("composeMessage builds a CRLF message", () => {
  const msg = composeMessage(
    "a@b.c",
    "d@e.f",
    "sync ok",
    "line1\nline2",
    "Tue, 1 Jan 2026 00:00:00 GMT",
  );
  assertEquals(
    msg,
    [
      "From: a@b.c",
      "To: d@e.f",
      "Subject: sync ok",
      "Date: Tue, 1 Jan 2026 00:00:00 GMT",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "line1\r\nline2",
    ].join("\r\n"),
  );
});

Deno.test("encodeSubject wraps non-ASCII in an encoded-word", () => {
  assertStrictEquals(encodeSubject("sync ok"), "sync ok");
  const enc = encodeSubject("sincronização");
  assertStrictEquals(enc.startsWith("=?UTF-8?B?"), true);
  assertStrictEquals(enc.endsWith("?="), true);
});

// assertRejectsSmpt: local rejection assert (std's assertRejects overloads
// trip the no-explicit-any lint check).
async function assertRejectsSmpt(promise: Promise<unknown>, pattern: string) {
  let caught: Error | null = null;
  try {
    await promise;
  } catch (err) {
    caught = err as Error;
  }
  if (caught === null) throw new Error("expected rejection");
  assertStrictEquals(caught.message.includes(pattern), true, caught.message);
}
