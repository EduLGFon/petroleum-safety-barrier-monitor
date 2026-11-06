// Unit tests for the Entra claim policy - identity fields and the address
// claims used for the first-sign-in hand-off.
import { assertEquals, assertRejects } from "jsr:@std/assert@^1";

import type { EntraConfig } from "../../config.ts";

import { validateEntraClaims } from "./claims.ts";

import type { IDToken } from "openid-client";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";
const OBJECT_ID = "33333333-3333-3333-3333-333333333333";
const NONCE = "nonce-value";

const CONFIG: EntraConfig = {
  tenantId: TENANT_ID,
  clientId: CLIENT_ID,
  credential: { type: "secret", secret: "test-secret" },
  clientAssertionAlg: "RS256",
  forceAccountPicker: false,
  flowTtlSeconds: 600,
  clockToleranceSeconds: 30,
  httpTimeoutMs: 10000,
  appBaseUrl: "https://example.com",
  redirectUri: "https://example.com/auth/entra/callback",
  postLogoutRedirectUri: "https://example.com/auth/entra/logged-out",
  frontChannelLogoutEnabled: false,
};

function baseClaims(extra: Record<string, unknown> = {}): IDToken {
  return {
    iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    aud: CLIENT_ID,
    tid: TENANT_ID,
    oid: OBJECT_ID,
    sub: "subject",
    ver: "2.0",
    nonce: NONCE,
    ...extra,
  } as unknown as IDToken;
}

Deno.test("claim emails read preferred_username, email and upn", async () => {
  const identity = await validateEntraClaims(
    baseClaims({
      preferred_username: " Preferred@Example.com ",
      email: "email@example.com",
      upn: "upn@example.com",
    }),
    CONFIG,
    NONCE,
  );
  assertEquals(identity.emails, [
    "preferred@example.com",
    "email@example.com",
    "upn@example.com",
  ]);
});

Deno.test("claim emails trim, lowercase and dedupe", async () => {
  const identity = await validateEntraClaims(
    baseClaims({
      preferred_username: "USER@Example.com",
      email: " user@example.com ",
      upn: "USER@EXAMPLE.COM",
    }),
    CONFIG,
    NONCE,
  );
  assertEquals(identity.emails, ["user@example.com"]);
});

Deno.test("claim emails skip bare usernames without @", async () => {
  const identity = await validateEntraClaims(
    baseClaims({
      preferred_username: "some.user",
      email: "not-an-address",
      upn: "another.user",
    }),
    CONFIG,
    NONCE,
  );
  assertEquals(identity.emails, []);
});

Deno.test("claim emails skip values longer than 320 characters", async () => {
  const oversize = `${"a".repeat(320)}@x.com`;
  const identity = await validateEntraClaims(
    baseClaims({
      preferred_username: oversize,
      email: "ok@example.com",
    }),
    CONFIG,
    NONCE,
  );
  assertEquals(identity.emails, ["ok@example.com"]);
});

Deno.test("claim emails skip non-string claim values", async () => {
  const identity = await validateEntraClaims(
    baseClaims({
      preferred_username: 42,
      email: "ok@example.com",
      upn: null,
    }),
    CONFIG,
    NONCE,
  );
  assertEquals(identity.emails, ["ok@example.com"]);
});

Deno.test("invalid claims still reject before extracting emails", async () => {
  await assertRejects(
    () =>
      validateEntraClaims(
        baseClaims({ nonce: "wrong", email: "ok@example.com" }),
        CONFIG,
        NONCE,
      ),
    Error,
    "invalid_claims",
  );
});
