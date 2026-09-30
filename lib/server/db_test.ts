// Unit tests for the Postgres pool TLS decision (pure helper).
// This is why they exist: loopback databases must skip the TLS attempt
// (no per-connection fallback spam) while remote ones keep try-TLS-first,
// and that matrix must not regress silently.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { tlsAttemptNeeded } from "./db.ts";

Deno.test("tlsAttemptNeeded skips TLS on loopback hosts", () => {
  assertStrictEquals(
    tlsAttemptNeeded(new URL("postgres://u:p@localhost:5432/db")),
    false,
  );
  assertStrictEquals(
    tlsAttemptNeeded(new URL("postgres://u:p@127.0.0.1:5432/db")),
    false,
  );
  assertStrictEquals(
    tlsAttemptNeeded(new URL("postgres://u:p@[::1]:5432/db")),
    false,
  );
});

Deno.test("tlsAttemptNeeded honors explicit sslmode=disable", () => {
  assertStrictEquals(
    tlsAttemptNeeded(
      new URL("postgres://u:p@db.internal:5432/db?sslmode=disable"),
    ),
    false,
  );
});

Deno.test("tlsAttemptNeeded keeps TLS anywhere else", () => {
  assertStrictEquals(
    tlsAttemptNeeded(new URL("postgres://u:p@db.internal:5432/db")),
    true,
  );
  assertStrictEquals(
    tlsAttemptNeeded(
      new URL("postgres://u:p@db.internal:5432/db?sslmode=require"),
    ),
    true,
  );
});

Deno.test("isStaleConnection matches transport failures only", async () => {
  const { isStaleConnection } = await import("./db.ts");
  for (
    const msg of [
      "BrokenPipe: Broken pipe (os error 32)",
      "Connection reset by peer (os error 104)",
      "terminating connection due to administrator command",
      "connection closed",
    ]
  ) {
    assertStrictEquals(isStaleConnection(new Error(msg)), true);
  }
  assertStrictEquals(isStaleConnection(new Error("EPIPE")), true);
  for (
    const msg of [
      'syntax error at or near "SELECT"',
      "permission denied for table barriers",
      "duplicate key value violates unique constraint",
    ]
  ) {
    assertStrictEquals(isStaleConnection(new Error(msg)), false);
  }
});
