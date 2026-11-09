// Unit tests for the UsersManager notice helper (pure, no DOM).
// This is why it exists: the one-time password block must tell the admin
// whether MSGFLOW delivered the notice, without ever rendering the raw
// provider body that could carry the password.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { mensagemAviso } from "./user-notice.ts";

Deno.test("mensagemAviso reports a delivered notice", () => {
  assertStrictEquals(
    mensagemAviso({ sent: true }),
    "aviso enviado por MSGFLOW.",
  );
});

Deno.test("mensagemAviso reports a failed notice with the reason", () => {
  assertStrictEquals(
    mensagemAviso({ sent: false, reason: "provedor indisponível" }),
    "aviso não enviado: provedor indisponível",
  );
});

Deno.test("mensagemAviso returns null without an outcome", () => {
  assertStrictEquals(mensagemAviso(null), null);
  assertStrictEquals(mensagemAviso(undefined), null);
});
