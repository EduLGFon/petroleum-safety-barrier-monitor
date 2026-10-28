// Entra OIDC client - discovery, client authentication, and code exchange.
// This is why it exists: protocol details stay in one module so routes only
// orchestrate flow state and sessions.
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  ClientSecretPost,
  customFetch,
  discovery,
  modifyAssertion,
  PrivateKeyJwt,
  type Configuration,
  type IDToken,
} from "openid-client";

import { type EntraConfig, type AuthConfig } from "../../config.ts";

import { loadPrivateKey, loadCertificateThumbprint } from "./keys.ts";


const discoveryCache = new Map<string, { value: Configuration; expiresAt: number }>();

function safeFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  return fetch(input, { ...init, redirect: "error" });
}

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

export async function getOidcConfiguration(config: AuthConfig): Promise<Configuration> {
  const entra = config.entra;
  if (!config.ssoEnabled || !entra) throw new Error("disabled");
  const cacheKey = `${entra.tenantId}:${entra.clientId}`;
  const cached = discoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const issuer = new URL(`https://login.microsoftonline.com/${entra.tenantId}/v2.0`);
  let resolvedClientAuth;
  if (entra.credential.type === "key") {
    const key = await loadPrivateKey(entra);
    const thumbprint = await loadCertificateThumbprint(entra);
    resolvedClientAuth = PrivateKeyJwt(key, {
      [modifyAssertion]: (header, payload) => {
        const h = header as Record<string, unknown>;
        const p = payload as Record<string, unknown>;
        h.typ = "JWT";
        h.alg = "PS256";
        h["x5t#S256"] = thumbprint;
        p.aud = tokenEndpoint(entra.tenantId);
        p.iss = entra.clientId;
        p.sub = entra.clientId;
      },
    });
  } else {
    resolvedClientAuth = ClientSecretPost(entra.credential.secret);
  }

  const metadata = {
    client_id: entra.clientId,
    redirect_uris: [entra.redirectUri],
    response_types: ["code"],
    scope: "openid profile",
    token_endpoint_auth_method: entra.credential.type === "key"
      ? "private_key_jwt"
      : "client_secret_post",
    id_token_signed_response_alg: "RS256",
    clockTolerance: entra.clockToleranceSeconds,
  };

  const cfg = await discovery(
    issuer,
    entra.clientId,
    metadata,
    resolvedClientAuth,
    { timeout: Math.max(1, Math.ceil(entra.httpTimeoutMs / 1000)) },
  );
  cfg[customFetch] = safeFetch as never;
  discoveryCache.set(cacheKey, {
    value: cfg,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return cfg;
}

export function clearDiscoveryCache(): void {
  discoveryCache.clear();
}

export function buildAuthorizationRequestUrl(
  config: AuthConfig,
  oidc: Configuration,
  state: string,
  nonce: string,
  codeChallenge: string,
): string {
  const entra = config.entra!;
  const url = buildAuthorizationUrl(oidc, {
    redirect_uri: entra.redirectUri,
    scope: "openid profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    response_mode: "query",
    ...(entra.forceAccountPicker ? { prompt: "select_account" } : {}),
  });
  return url.href;
}

export async function exchangeAuthorizationCode(
  config: AuthConfig,
  oidc: Configuration,
  currentUrl: URL,
  checks: {
    expectedState: string;
    expectedNonce: string;
    pkceCodeVerifier: string;
  },
): Promise<IDToken> {
  const entra = config.entra!;
  const response = await authorizationCodeGrant(oidc, currentUrl, {
    expectedState: checks.expectedState,
    expectedNonce: checks.expectedNonce,
    pkceCodeVerifier: checks.pkceCodeVerifier,
    idTokenExpected: true,
  });
  const claims = response.claims();
  if (!claims) throw new Error("invalid_claims");
  return claims;
}

export function buildLogoutUrl(config: AuthConfig): string | null {
  const entra = config.entra;
  if (!config.ssoEnabled || !entra) return null;
  const url = new URL(
    `https://login.microsoftonline.com/${entra.tenantId}/oauth2/v2.0/logout`,
  );
  url.searchParams.set("post_logout_redirect_uri", entra.postLogoutRedirectUri);
  return url.href;
}