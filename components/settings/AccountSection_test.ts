// Regression tests for the account e-mail change guard (audit U7 follow-up).
// This is why they exist: changing one's own e-mail through the profile form
// now asks for the caller's current password and carries it on the PATCH,
// but only for local accounts (an Entra row has no password_hash to
// verify against) and only when the draft e-mail actually differs from the
// saved one (case and space changes normalize away on the server) and only
// when a confirmation was typed. So a "same e-mail, different case" edit
// never prompts, and a password-less body (an Entra account) never carries
// even an empty secret across the wire. The pure helpers are the exact
// decision the component makes, so we cover them here instead of mounting
// the section through linkedom (AccountSection is written in
// Fresh-precompiled JSX and does not mount under the harness; see
// scripts/test-dom.ts).
import {
  buildProfileBody,
  emailConfirmRequiredFor,
  emailRequiresPassword,
} from "./AccountSection.tsx";

import { assert, assertEquals } from "jsr:@std/assert@^1";

const saved = { name: "Ana", email: "ana@plataforma.br", phone: "" };

Deno.test("emailRequiresPassword ignores case and surrounding space", () => {
  assert(!emailRequiresPassword("ana@plataforma.br", "ANA@plataforma.br"));
  assert(!emailRequiresPassword("ana@plataforma.br", "  ana@plataforma.br  "));
  assert(
    !emailRequiresPassword("  Ana@Plataforma.br ", "ana@plataforma.br"),
  );
});

Deno.test("emailRequiresPassword flags a real e-mail change", () => {
  assert(emailRequiresPassword("ana@plataforma.br", "ana.nova@plataforma.br"));
  assert(emailRequiresPassword("ana@plataforma.br", ""));
});

Deno.test("buildProfileBody always sends name, email and phone", () => {
  const body = buildProfileBody(saved, {
    name: "Ana Souza",
    email: saved.email,
    phone: "11 9 9999-0000",
    currentPassword: "should-not-appear",
  });
  assertEquals(body, {
    name: "Ana Souza",
    email: "ana@plataforma.br",
    phone: "11 9 9999-0000",
  });
  assert(!("currentPassword" in body), "unchanged email carries no secret");
});

Deno.test("buildProfileBody attaches currentPassword on a real change", () => {
  const body = buildProfileBody(saved, {
    name: "Ana",
    email: "nova@plataforma.br",
    phone: "",
    currentPassword: "correct horse battery",
  });
  assertEquals(body, {
    name: "Ana",
    email: "nova@plataforma.br",
    phone: "",
    currentPassword: "correct horse battery",
  });
});

Deno.test("buildProfileBody does not attach currentPassword on case flips", () => {
  // Server normalizes to lower; a case-only edit is a no-op write and must
  // not prompt the auth path.
  const body = buildProfileBody(saved, {
    name: "Ana",
    email: "ANA@PLATAFORMA.BR",
    phone: "",
    currentPassword: "should-not-appear",
  });
  assert(!("currentPassword" in body));
});

Deno.test("buildProfileBody never sends an empty password, even on change", () => {
  // Entra accounts have no local password, so the form never collects one;
  // the wire body must not carry an empty secret either.
  const body = buildProfileBody(saved, {
    name: "Ana",
    email: "nova@plataforma.br",
    phone: "",
    currentPassword: "",
  });
  assert(!("currentPassword" in body), "an empty confirmation stays local");
});

Deno.test("emailConfirmRequiredFor skips the prompt entirely for Entra rows", () => {
  // An Entra account has no local password (users.password_hash is null),
  // so prompting one would lock the person out of the profile PATCH that
  // lets them fix a stale IdP address.
  assert(!emailConfirmRequiredFor("entra", "ana@plataforma.br", ""));
  assert(
    !emailConfirmRequiredFor("entra", "ana@plataforma.br", "nova@x.br"),
  );
});

Deno.test("emailConfirmRequiredFor follows emailRequiresPassword on local", () => {
  assert(!emailConfirmRequiredFor("local", "ana@plataforma.br", "ANA@x.br"));
  assert(!emailConfirmRequiredFor("local", saved.email, saved.email));
  assert(emailConfirmRequiredFor("local", "ana@plataforma.br", "nova@x.br"));
});
