// Fracttal OAuth2 token - client-credentials with one-shot refresh caching.
// This is why it exists: tokens last 2h and a data 401 means "refresh me".
// The token store lives in one closure so every client request transparently
// uses (or lazily refreshes) a single cached access token.
export interface TokenCredentials {
  key: string;
  secret: string;
}

export interface FracttalToken {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface TokenState {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs: number;
}

export interface TokenFetcher {
  // getToken: POSTs to the token endpoint; raw network layer (timeout/retry
  // stay in client.ts) so tests inject a fake fetch.
  (body: URLSearchParams, creds: TokenCredentials): Promise<FracttalToken>;
}

// tokenCache: single-flight token holder with clock injection for tests.
// refreshTtlMarginMs keeps a safety window so a token used right at expiry
// does not trip a data 401.
export interface TokenCacheOptions {
  fetchToken: TokenFetcher;
  creds: TokenCredentials;
  now?: () => number;
  ttlMarginMs?: number;
}

export function createTokenCache(
  { fetchToken, creds, now = Date.now, ttlMarginMs = 30_000 }:
    TokenCacheOptions,
): {
  get: () => Promise<string>;
  refresh: () => Promise<string>;
  state: () => TokenState | null;
} {
  let current: TokenState | null = null;
  // In-flight grant: concurrent calls await one token instead of stampeding.
  let pending: Promise<string> | null = null;

  async function acquire(
    grant: "client_credentials" | "refresh_token",
  ): Promise<string> {
    const body = new URLSearchParams();
    body.set("grant_type", grant);
    const refresh = grant === "refresh_token"
      ? current?.refreshToken
      : undefined;
    if (grant === "refresh_token" && refresh === undefined) {
      return acquire("client_credentials");
    }
    if (grant === "refresh_token" && refresh !== undefined) {
      body.set("refresh_token", refresh);
    }
    const token = await fetchToken(body, creds);
    if (typeof token.access_token !== "string" || token.access_token === "") {
      throw new Error("[fracttal] token response missing access_token");
    }
    const expiresIn = Number(token.expires_in) || 0;
    current = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAtMs: now() + expiresIn * 1000 - ttlMarginMs,
    };
    return current.accessToken;
  }

  return {
    get() {
      if (pending) return pending;
      const fresh = current && now() < current.expiresAtMs;
      if (fresh) return Promise.resolve(current!.accessToken);
      // Expiry: use the documented refresh grant when we have a refresh
      // token; the token endpoint's grant handler falls back to
      // client_credentials otherwise.
      const grant = current?.refreshToken !== undefined
        ? "refresh_token"
        : "client_credentials";
      pending = acquire(grant).finally(() => {
        pending = null;
      });
      return pending;
    },
    // Refresh on 401: rewrites pending with the refresh grant so callers of
    // get() (which pending short-circuits) cannot race a stale token.
    refresh() {
      pending = acquire("refresh_token").finally(() => {
        pending = null;
      });
      return pending;
    },
    state: () => current,
  };
}
