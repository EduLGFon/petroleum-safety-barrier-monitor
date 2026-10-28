// Entra claim policy - extracts the stable identity from a validated ID token.
// This is why it exists: openid-client validates protocol mechanics, but the
// application still must pin the tenant, client, and required claims.
import type { IDToken } from "openid-client";

import { type EntraConfig } from "../../config.ts";

import { normalizeEntraObjectId } from "../../validation.ts";

import { constantTimeEqual } from "../constant-time.ts";

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EntraIdentity {
  tenantId: string;
  objectId: string;
  sidHash: string | null;
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

  return { tenantId: config.tenantId, objectId, sidHash };
}
