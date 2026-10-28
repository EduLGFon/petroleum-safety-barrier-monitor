// Auth flows SQL - short-lived OIDC authorization flows.
// This is why it exists: the Entra callback must correlate state, PKCE, nonce,
// and the browser-binding cookie across requests and app instances. Only hashes
// of state and the binding cookie are stored; the verifier and nonce are
// short-lived protocol values.
import { queryRows } from "../db.ts";

export interface AuthFlowRecord {
  browserHash: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export async function createAuthFlow(input: {
  stateHash: string;
  browserHash: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: Date;
}): Promise<void> {
  await queryRows(
    `insert into auth_flows
       (state_hash, browser_hash, nonce, code_verifier, return_to, expires_at)
     values ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [
      input.stateHash,
      input.browserHash,
      input.nonce,
      input.codeVerifier,
      input.returnTo,
      input.expiresAt.toISOString(),
    ],
  );
}

// consumeAuthFlow: deletes the row by state hash and returns its contents.
// Deleting first makes the flow one-time even when the browser binding hash
// does not match. Expired rows are not returned.
export async function consumeAuthFlow(
  stateHash: string,
): Promise<AuthFlowRecord | null> {
  const rows = await queryRows<{
    browser_hash: string;
    nonce: string;
    code_verifier: string;
    return_to: string;
  }>(
    `delete from auth_flows
     where state_hash = $1 and expires_at > now()
     returning browser_hash, nonce, code_verifier, return_to`,
    [stateHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    browserHash: row.browser_hash,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    returnTo: row.return_to,
  };
}

export async function deleteExpiredAuthFlows(): Promise<number> {
  const rows = await queryRows<{ state_hash: string }>(
    `delete from auth_flows where expires_at <= now() returning state_hash`,
  );
  return rows.length;
}

export async function countAuthFlows(): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `select count(*)::text as n from auth_flows`,
  );
  return Number(rows[0]?.n ?? 0);
}
