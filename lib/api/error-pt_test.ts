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

Deno.test("toPtError maps password-change errors to pt-BR", () => {
  assertStrictEquals(
    toPtError("current password is incorrect"),
    "Senha atual incorreta",
  );
  assertStrictEquals(
    toPtError("new password must differ"),
    "A nova senha deve ser diferente da atual",
  );
  assertStrictEquals(
    toPtError("password must be at least 12 characters"),
    "A senha deve ter 12+ caracteres",
  );
  assertStrictEquals(toPtError("session required"), "Sessão necessária");
});

Deno.test("toPtError passes through already-localized strings", () => {
  assertStrictEquals(toPtError("Erro 404"), "Erro 404");
  assertStrictEquals(toPtError("Falha ao carregar"), "Falha ao carregar");
});
