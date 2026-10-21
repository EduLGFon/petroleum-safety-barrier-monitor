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

Deno.test("toPtError maps ids, roles, and throttle to pt-BR", () => {
  assertStrictEquals(toPtError("Invalid barrier id"), "Barreira inválida");
  assertStrictEquals(toPtError("Barrier not found"), "Barreira não encontrada");
  assertStrictEquals(toPtError("User not found"), "Usuário não encontrado");
  assertStrictEquals(
    toPtError("admin only"),
    "Acesso restrito ao administrador",
  );
  assertStrictEquals(
    toPtError("Auth store unreachable"),
    "Banco indisponível, tente novamente",
  );
  assertStrictEquals(
    toPtError("export rate limit exceeded"),
    "Limite de exportação excedido, aguarde um minuto",
  );
});

Deno.test("toPtError translates last-admin guards", () => {
  assertStrictEquals(
    toPtError("cannot demote the last active admin"),
    "Não é possível rebaixar o único administrador ativo",
  );
  assertStrictEquals(
    toPtError("cannot deactivate the last active admin"),
    "Não é possível desativar o único administrador ativo",
  );
  assertStrictEquals(
    toPtError("cannot delete the last active admin"),
    "Não é possível excluir o único administrador ativo",
  );
  assertStrictEquals(
    toPtError(
      "cannot demote your own account while you are the last active admin",
    ),
    "Você é o único administrador ativo. Não é possível rebaixar sua própria conta.",
  );
  assertStrictEquals(
    toPtError(
      "cannot deactivate your own account while you are the last active admin",
    ),
    "Você é o único administrador ativo. Não é possível desativar sua própria conta.",
  );
  assertStrictEquals(
    toPtError(
      "cannot delete your own account while you are the last active admin",
    ),
    "Você é o único administrador ativo. Não é possível excluir sua própria conta.",
  );
  // Safety net for older/deployed wording the user may still hit.
  assertStrictEquals(
    toPtError("Cannot demote the first admin"),
    "Não é possível rebaixar o único administrador ativo",
  );
});

Deno.test("toPtError translates admin validation messages", () => {
  assertStrictEquals(
    toPtError("nothing to update"),
    "Nenhuma alteração informada",
  );
  assertStrictEquals(
    toPtError("role must be admin or user"),
    "Perfil deve ser Admin ou Usuário",
  );
  assertStrictEquals(
    toPtError("invalid email address"),
    "Endereço de e-mail inválido",
  );
  assertStrictEquals(
    toPtError("invalid phone number"),
    "Número de telefone inválido",
  );
  assertStrictEquals(
    toPtError("email already exists"),
    "Este e-mail já está cadastrado",
  );
  assertStrictEquals(
    toPtError("rule name already exists"),
    "Já existe uma regra com este nome",
  );
});

Deno.test("toPtError translates dynamic rule/barrier validation", () => {
  assertStrictEquals(
    toPtError("categoryIds must be an array of integers"),
    "Categorias: informe uma lista de números inteiros",
  );
  assertStrictEquals(
    toPtError("activeDays values must be >= 1"),
    "Dias ativos: os valores devem ser maiores ou iguais a 1",
  );
  assertStrictEquals(
    toPtError("validFrom must be YYYY-MM-DD or null"),
    "Início da validade: informe uma data no formato AAAA-MM-DD, ou nulo",
  );
  assertStrictEquals(
    toPtError("priority must be between -1000 and 1000"),
    "Prioridade deve estar entre -1000 e 1000",
  );
  assertStrictEquals(
    toPtError("locationId must be a non-negative integer"),
    "Localidade: informe um número inteiro não negativo",
  );
  assertStrictEquals(
    toPtError("quietStartHour must be an hour 0-23 or null"),
    "Início do silêncio: informe uma hora entre 0 e 23, ou nulo",
  );
});

Deno.test("toPtError never leaks unknown English text", () => {
  assertStrictEquals(
    toPtError("Failed to fetch"),
    "Falha de conexão, tente novamente",
  );
  assertStrictEquals(
    toPtError("boom"),
    "Ocorreu um erro inesperado. Tente novamente.",
  );
});
