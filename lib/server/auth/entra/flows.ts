// Entra flow helpers - state, PKCE, nonce, and browser binding.
// This is why it exists: the callback must prove that the same browser that
// started the flow is completing it, and that the flow is one-time.
import {
  consumeAuthFlow,
  countAuthFlows,
  deleteExpiredAuthFlows,
} from "../../sql/auth-flows.ts";

import { queryRows } from "../../db.ts";

import { constantTimeEqual } from "../constant-time.ts";

import { type AuthConfig } from "../../config.ts";

const FLOW_CAP = 10000;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

export function generateState(): string {
  return base64Url(randomBytes(32));
}

export function generateBindingToken(): string {
  return base64Url(randomBytes(32));
}

export function generateNonce(): string {
  return base64Url(randomBytes(32));
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ConsumedFlow {
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export async function createFlow(input: {
  state: string;
  browserToken: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  ttlSeconds: number;
}): Promise<void> {
  // One statement does the sweep, the capacity guard, and the insert: expired
  // rows are pruned first so the cap counts only live flows, the WHERE clause
  // refuses new rows at FLOW_CAP, and ON CONFLICT DO NOTHING absorbs a state
  // re-use (a retry after a partial failure) instead of erroring. Residual
  // race: concurrent bursts can overshoot the cap by the racing window; the
  // login throttle is the real backstop, the cap only bounds the table.
  await deleteExpiredAuthFlows();
  const stateHash = await sha256Hex(input.state);
  const rows = await queryRows<{ state_hash: string }>(
    `insert into auth_flows
       (state_hash, browser_hash, nonce, code_verifier, return_to, expires_at)
     select $1, $2, $3, $4, $5, $6::timestamptz
     where (select count(*) from auth_flows) < ${FLOW_CAP}
     on conflict (state_hash) do nothing
     returning state_hash`,
    [
      stateHash,
      await sha256Hex(input.browserToken),
      input.nonce,
      input.codeVerifier,
      input.returnTo,
      new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
    ],
  );
  if (rows.length === 0) {
    // Either the table is at capacity, or (with ~2^-256 probability) the
    // random state collided with a live row. Both mean "try the login again",
    // so both surface as flow_capacity after confirming the count.
    if ((await countAuthFlows()) >= FLOW_CAP) throw new Error("flow_capacity");
    throw new Error("flow_capacity");
  }
}

export async function consumeFlow(
  state: string,
  browserToken: string | null,
): Promise<ConsumedFlow | null> {
  const record = await consumeAuthFlow(await sha256Hex(state));
  if (!record) return null;
  if (!browserToken) return null;
  const browserHash = await sha256Hex(browserToken);
  if (!constantTimeEqual(record.browserHash, browserHash)) return null;
  return {
    nonce: record.nonce,
    codeVerifier: record.codeVerifier,
    returnTo: record.returnTo,
  };
}

export function buildBindingCookie(
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    `barrier_sso=${encodeURIComponent(token)}`,
    "Path=/auth/entra",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearBindingCookie(secure: boolean): string {
  const parts = [
    "barrier_sso=",
    "Path=/auth/entra",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureForConfig(config: AuthConfig, req: Request): boolean {
  try {
    if (new URL(req.url).protocol === "https:") return true;
  } catch {
    // Fall through to configured public URL.
  }
  return config.entra?.appBaseUrl.startsWith("https://") ?? false;
}
