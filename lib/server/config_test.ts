import { assertEquals, assertThrows } from "jsr:@std/assert";

import { loadAuthConfig } from "./config.ts";

Deno.test("loadAuthConfig defaults to local login only", () => {
  const config = loadAuthConfig(() => undefined);
  assertEquals(config.localEnabled, true);
  assertEquals(config.ssoEnabled, false);
  assertEquals(config.entra, null);
});

Deno.test("loadAuthConfig rejects AUTH_LOCAL_ENABLED=false", () => {
  assertThrows(() =>
    loadAuthConfig((name) =>
      name === "AUTH_LOCAL_ENABLED" ? "false" : undefined
    )
  );
});

Deno.test("loadAuthConfig validates SSO settings", () => {
  assertThrows(() =>
    loadAuthConfig((name) => (name === "AUTH_SSO_ENABLED" ? "true" : undefined))
  );
});