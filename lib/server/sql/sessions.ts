// Sessions SQL - opaque login sessions joining users.
// This is why it exists: the auth routes create and revoke cookie sessions,
// while lib/server/auth.ts resolves them per request. Only hashes are stored.
import type { UserRole } from "./users.ts";

import { queryRows } from "../db.ts";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

// createSession: stores a hashed token with an expiry for a user.
export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await queryRows(
    `insert into sessions (user_id, token_hash, expires_at)
    values ($1, $2, $3::timestamptz)`,
    [userId, tokenHash, expiresAt.toISOString()],
  );
}

// getSessionUser: resolves a token hash to its active, unexpired user.
export async function getSessionUser(
  tokenHash: string,
): Promise<SessionUser | null> {
  const rows = await queryRows<SessionUser>(
    `select u.id, u.email, u.name, u.role, u.active
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

// deleteSession: revokes one token (logout); missing tokens still succeed.
export async function deleteSession(tokenHash: string): Promise<void> {
  await queryRows(`delete from sessions where token_hash = $1`, [tokenHash]);
}

// deleteSessionsForUser: revokes every session after a password or role
// change so stale cookies cannot linger with old privileges.
export async function deleteSessionsForUser(userId: number): Promise<void> {
  await queryRows(`delete from sessions where user_id = $1`, [userId]);
}

// deleteExpiredSessions: opportunistic sweep, safe to run on login.
export async function deleteExpiredSessions(): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `delete from sessions where expires_at <= now() returning id`,
  );
  return rows.length;
}
