// Unit tests for API error localization boundary.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { toPtError } from "./error-pt.ts";

Deno.test("toPtError maps known English errors to pt-BR", () => {
  assertStrictEquals(toPtError("invalid credentials"), "Credenciais inválidas");
  assertStrictEquals(
    toPtError("email and password are required"),
    "Informe e-mail e senha",
  );
});

Deno.test("toPtError passes through already-localized strings", () => {
  assertStrictEquals(toPtError("Erro 404"), "Erro 404");
  assertStrictEquals(toPtError("Falha ao carregar"), "Falha ao carregar");
});
