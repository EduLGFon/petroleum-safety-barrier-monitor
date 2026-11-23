// Regression tests for the account e-mail change guard (audit U7 follow-up).
// This is why they exist: PATCH /api/auth/profile now requires the caller's
// current password for any e-mail change. The section sends the field only
// when the draft email actually differs from the saved one (case and space
// changes normalize away on the server), so a "same email, different case"
// edit never prompts for a password and never carries one across the wire.
// The pure helpers are the exact decision the component makes, so we cover
// them here instead of mounting the section through linkedom (AccountSection
// is written in Fresh-precompiled JSX and does not mount under the harness;
// see scripts/test-dom.ts).
import { buildProfileBody, emailRequiresPassword } from "./AccountSection.tsx";

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
