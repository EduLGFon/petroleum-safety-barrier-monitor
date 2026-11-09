import { assertEquals } from "jsr:@std/assert@^1";

import { greetingName } from "./greeting.ts";

Deno.test("greetingName prefers the trimmed name", () => {
  assertEquals(greetingName("Maria", "maria@example.com"), "Olá, Maria");
  assertEquals(greetingName("  Maria  "), "Olá, Maria");
});

Deno.test("greetingName falls back to the email local part", () => {
  assertEquals(greetingName(null, "maria@example.com"), "Olá, maria");
  assertEquals(
    greetingName("   ", "  joao.silva@example.com  "),
    "Olá, joao.silva",
  );
});

Deno.test("greetingName falls back to Usuário", () => {
  assertEquals(greetingName(null, null), "Olá, Usuário");
  assertEquals(greetingName(undefined, undefined), "Olá, Usuário");
  assertEquals(greetingName("   ", "   "), "Olá, Usuário");
  assertEquals(greetingName(null, "@example.com"), "Olá, Usuário");
});
