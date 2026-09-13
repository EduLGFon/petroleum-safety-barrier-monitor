// Unit tests for the Fracttal OAuth2 token cache - grants, single-flight,
// expiry-driven refresh. No network: fetchToken is injected.
import {
  createTokenCache,
  type FracttalToken,
  type TokenCredentials,
} from "./token.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

const creds: TokenCredentials = { key: "k", secret: "s" };

function makeCatch(fetcher: (body: URLSearchParams) => Promise<FracttalToken>) {
  const granted: string[] = [];
  const cache = createTokenCache({
    fetchToken: async (body) => {
      granted.push(body.get("grant_type") ?? "?");
      return await fetcher(body);
    },
    creds,
    now: () => 1_000_000,
  });
  return { cache, granted };
}

function tokenBody(
  grant: "client_credentials" | "refresh_token",
): FracttalToken {
  return {
    access_token: `tok-${grant}`,
    refresh_token: "rt-1",
    token_type: "Bearer",
    expires_in: 7200,
  };
}

Deno.test("token cache acquires client_credentials on first get", async () => {
  const { cache, granted } = makeCatch((b) =>
    Promise.resolve(tokenBody(b.get("grant_type") as "client_credentials"))
  );
  assertStrictEquals(await cache.get(), "tok-client_credentials");
  assertEquals(granted, ["client_credentials"]);
});

Deno.test("token cache reuses a fresh token without re-granting", async () => {
  const { cache, granted } = makeCatch((b) =>
    Promise.resolve(tokenBody(b.get("grant_type") as "client_credentials"))
  );
  await cache.get();
  await cache.get();
  assertEquals(granted, ["client_credentials"]);
});

Deno.test("token cache refreshes via the refresh grant on expiry", async () => {
  let now = 1_000_000;
  const cache = createTokenCache({
    fetchToken: (b) =>
      Promise.resolve(tokenBody(b.get("grant_type") as "client_credentials")),
    creds,
    now: () => now,
  });
  await cache.get();
  now += 7200_000 + 1; // past expiresIn minus margin
  assertStrictEquals(await cache.get(), "tok-refresh_token");
  assertEquals(cache.state()?.refreshToken, "rt-1");
});

Deno.test("token refresh() issues a refresh_token grant and replaces the token", async () => {
  const granted: string[] = [];
  const cache = createTokenCache({
    fetchToken: (b) => {
      granted.push(b.get("grant_type") ?? "?");
      return Promise.resolve(
        tokenBody(b.get("grant_type") as "client_credentials"),
      );
    },
    creds,
  });
  await cache.get();
  await cache.refresh();
  assertEquals(granted, ["client_credentials", "refresh_token"]);
  assertEquals(cache.state()?.accessToken, "tok-refresh_token");
});

Deno.test("token refresh() falls back to client_credentials without a refresh token", async () => {
  const granted: string[] = [];
  const cache = createTokenCache({
    fetchToken: (b) => {
      granted.push(b.get("grant_type") ?? "?");
      return Promise.resolve({
        access_token: "tok-x",
        expires_in: 7200,
      });
    },
    creds,
  });
  await cache.get();
  await cache.refresh();
  assertEquals(granted, ["client_credentials", "client_credentials"]);
});

Deno.test("single-flight: concurrent gets share one grant", async () => {
  let inflight = 0;
  let peak = 0;
  const cache = createTokenCache({
    fetchToken: async (b) => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return tokenBody(b.get("grant_type") as "client_credentials");
    },
    creds,
  });
  await Promise.all([cache.get(), cache.get(), cache.get()]);
  assertStrictEquals(peak, 1);
});

Deno.test("token cache rejects a missing access_token", async () => {
  const cache = createTokenCache({
    fetchToken: () => Promise.resolve({ access_token: "" }),
    creds,
  });
  let caught: Error | null = null;
  try {
    await cache.get();
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught?.message.includes("access_token"), true);
});
