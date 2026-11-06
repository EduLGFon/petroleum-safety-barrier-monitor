// Unit tests for password hashing - format, verify, policy.
import {
  generateTemporaryPassword,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "./password.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("hashPassword verifies the same password", async () => {
  const hash = await hashPassword("correct-horse-1234");
  assertStrictEquals(await verifyPassword("correct-horse-1234", hash), true);
});

Deno.test("verifyPassword rejects wrong passwords and bad hashes", async () => {
  const hash = await hashPassword("correct-horse-1234");
  assertStrictEquals(await verifyPassword("wrong-password-000", hash), false);
  assertStrictEquals(await verifyPassword("x", "not-a-hash"), false);
});

Deno.test("generateTemporaryPassword uses the unambiguous alphabet", () => {
  const password = generateTemporaryPassword();
  assertStrictEquals(password.length, 16);
  assert(/^[A-HJ-NP-Za-km-np-z2-9]+$/.test(password));
  // 0/O, 1/l/I are deliberately absent: people type these from e-mail.
  assert(!/[0O1lI]/.test(password));
});

Deno.test("generateTemporaryPassword honours a custom length", () => {
  assertStrictEquals(generateTemporaryPassword(12).length, 12);
  assertStrictEquals(generateTemporaryPassword(32).length, 32);
});

Deno.test("generateTemporaryPassword refuses short lengths", () => {
  let threw = false;
  try {
    generateTemporaryPassword(11);
  } catch {
    threw = true;
  }
  assertStrictEquals(threw, true);
});

Deno.test("generateTemporaryPassword does not repeat a drawn value", () => {
  const values = new Set<string>();
  for (let i = 0; i < 32; i++) values.add(generateTemporaryPassword());
  assertStrictEquals(values.size, 32);
});

Deno.test("validateNewPassword enforces a minimum length", () => {
  let threw = false;
  try {
    validateNewPassword("short");
  } catch {
    threw = true;
  }
  assertStrictEquals(threw, true);
  assertStrictEquals(
    validateNewPassword("long-enough-1234"),
    "long-enough-1234",
  );
});
