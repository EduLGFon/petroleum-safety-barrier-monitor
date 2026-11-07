import { greetingName } from "./greeting.ts";

import { assertEquals } from "jsr:@std/assert@^1";

Deno.test("greetingName falls back to Usuário", () => {
  assertEquals(greetingName(null), "Olá, Usuário");
  assertEquals(greetingName(undefined), "Olá, Usuário");
  assertEquals(greetingName("   "), "Olá, Usuário");
});

Deno.test("greetingName trims and greets", () => {
  assertEquals(greetingName("  Maria  "), "Olá, Maria");
});
