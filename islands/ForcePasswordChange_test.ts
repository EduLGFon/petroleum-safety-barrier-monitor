// Unit tests for the ForcePasswordChange error helper (pure, no DOM).
// This is why it exists: the envelope is { error: string, code, requestId },
// not { error: { message } }, so parsing must read the string field and
// fall back to a localized status message otherwise.
import { extrairMensagemErro } from "./ForcePasswordChange.tsx";

import { assertStrictEquals } from "jsr:@std/assert@^1";


Deno.test("extrairMensagemErro localizes a string error", () => {
  assertStrictEquals(
    extrairMensagemErro({ error: "current password is incorrect" }, 400),
    "Senha atual incorreta",
  );
});

Deno.test("extrairMensagemErro falls back to status without a string", () => {
  assertStrictEquals(
    extrairMensagemErro({ error: { message: "x" } }, 400),
    "Falha ao trocar a senha (400).",
  );
  assertStrictEquals(
    extrairMensagemErro(null, 500),
    "Falha ao trocar a senha (500).",
  );
});
