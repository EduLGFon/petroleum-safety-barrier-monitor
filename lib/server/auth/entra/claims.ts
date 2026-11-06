// Entra claim policy - extracts the stable identity from a validated ID token.
// This is why it exists: openid-client validates protocol mechanics, but the
// application still must pin the tenant, client, and required claims.
import { normalizeEntraObjectId } from "../../validation.ts";

import { constantTimeEqual } from "../constant-time.ts";

import { type EntraConfig } from "../../config.ts";

import type { IDToken } from "openid-client";

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EntraIdentity {
  tenantId: string;
  objectId: string;
  sidHash: string | null;
  // Addresses carried by the validated ID token, lowercased and de-duplicated.
  // They exist for the first-sign-in hand-off: an admin enables SSO for an
  // address, and the callback binds the object id to the account holding it.
  // Never an authorization by itself - the account must already exist.
  emails: string[];
}

// claimEmails: the addresses this token vouches for. Entra puts the sign-in
// address in preferred_username; `email` only appears when the email scope is
// granted and the account has one, and `upn` is the legacy spelling. All three
// are read because a tenant can populate any subset of them.
function claimEmails(claims: IDToken): string[] {
  const out: string[] = [];
  for (const key of ["preferred_username", "email", "upn"] as const) {
    const raw = (claims as Record<string, unknown>)[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim().toLowerCase();
    // A bare username with no "@" is not an address: matching on it could hit
    // an unrelated row. Length is bounded so a hostile token cannot push a
    // huge string into the lookup.
    if (!value.includes("@") || value.length > 320) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export async function validateEntraClaims(
  claims: IDToken,
  config: EntraConfig,
  expectedNonce: string,
): Promise<EntraIdentity> {
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  if (claims.iss !== issuer) throw new Error("invalid_claims");

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(config.clientId)) throw new Error("invalid_claims");

  // OIDC Core 3.1.3.7: when aud is an array the token MUST carry an azp
  // claim for this client. Without this, a token minted for another party
  // that merely lists our client id would be accepted.
  if (Array.isArray(claims.aud) && claims.azp === undefined) {
    throw new Error("invalid_claims");
  }

  if (claims.tid !== config.tenantId) throw new Error("invalid_claims");

  if (typeof claims.oid !== "string" || !GUID_RE.test(claims.oid)) {
    throw new Error("invalid_claims");
  }
  const objectId = normalizeEntraObjectId(claims.oid);

  if (typeof claims.sub !== "string" || claims.sub === "") {
    throw new Error("invalid_claims");
  }

  if (claims.ver !== "2.0") throw new Error("invalid_claims");

  if (
    typeof claims.nonce !== "string" ||
    !constantTimeEqual(claims.nonce, expectedNonce)
  ) {
    throw new Error("invalid_claims");
  }

  if (claims.azp !== undefined && claims.azp !== config.clientId) {
    throw new Error("invalid_claims");
  }

  let sidHash: string | null = null;
  if (claims.sid !== undefined) {
    if (
      typeof claims.sid !== "string" || claims.sid === "" ||
      claims.sid.length > 256
    ) {
      throw new Error("invalid_claims");
    }
    const data = new TextEncoder().encode(
      `entra-sid:v1:${config.tenantId}:${claims.sid}`,
    );
    const digest = await crypto.subtle.digest("SHA-256", data);
    sidHash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  return {
    tenantId: config.tenantId,
    objectId,
    sidHash,
    emails: claimEmails(claims),
  };
}
