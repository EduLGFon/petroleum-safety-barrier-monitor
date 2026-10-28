// Entra flow helpers - state, PKCE, nonce, and browser binding.
// This is why it exists: the callback must prove that the same browser that
// started the flow is completing it, and that the flow is one-time.
import { createAuthFlow, consumeAuthFlow, deleteExpiredAuthFlows, countAuthFlows } from "../../sql/auth-flows.ts";

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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
  await deleteExpiredAuthFlows();
  if (await countAuthFlows() >= FLOW_CAP) {
    await deleteExpiredAuthFlows();
    if (await countAuthFlows() >= FLOW_CAP) {
      throw new Error("flow_capacity");
    }
  }
  await createAuthFlow({
    stateHash: await sha256Hex(input.state),
    browserHash: await sha256Hex(input.browserToken),
    nonce: input.nonce,
    codeVerifier: input.codeVerifier,
    returnTo: input.returnTo,
    expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
  });
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