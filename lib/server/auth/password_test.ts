// Unit tests for password hashing - format, verify, policy.
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "./password.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("hashPassword verifies the same password", async () => {
  const hash = await hashPassword("correct-horse-1234");
  assertStrictEquals(await verifyPassword("correct-horse-1234", hash), true);
});

Deno.test("verifyPassword rejects wrong passwords and bad hashes", async () => {
  const hash = await hashPassword("correct-horse-1234");
  assertStrictEquals(await verifyPassword("wrong-password-000", hash), false);
  assertStrictEquals(await verifyPassword("x", "not-a-hash"), false);
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
