// Sessions SQL - opaque login sessions joining users.
// This is why it exists: the auth routes create and revoke cookie sessions,
// while lib/server/auth.ts resolves them per request. Only hashes are stored.
import { allowedLocationsForUser } from "./access-groups.ts";

import type { UserRole } from "./users.ts";

import { queryRows } from "../db.ts";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  allowedLocationIds: number[] | null;
  auth_source: "local" | "entra";
  auth_method: "password" | "entra";
}

// createSession: stores a hashed token with an expiry for a user.
export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
  options: {
    authMethod?: "password" | "entra";
    idpSidHash?: string | null;
  } = {},
): Promise<void> {
  await queryRows(
    `insert into sessions
       (user_id, token_hash, expires_at, auth_method, idp_sid_hash)
     values ($1, $2, $3::timestamptz, $4, $5)`,
    [
      userId,
      tokenHash,
      expiresAt.toISOString(),
      options.authMethod ?? "password",
      options.idpSidHash ?? null,
    ],
  );
}

// getSessionUser: resolves a token hash to its active, unexpired user.
export async function getSessionUser(
  tokenHash: string,
): Promise<SessionUser | null> {
  const rows = await queryRows<Omit<SessionUser, "allowedLocationIds">>(
    `select u.id, u.email, u.name, coalesce(u.phone, '') as phone, u.role, u.active,
            u.auth_source, s.auth_method
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [tokenHash],
  );
  const base = rows[0];
  if (!base) return null;
  const allowedLocationIds = await allowedLocationsForUser(base.id);
  return { ...base, allowedLocationIds };
}

// deleteSession: revokes one token (logout); missing tokens still succeed.
export async function deleteSession(tokenHash: string): Promise<void> {
  await queryRows(`delete from sessions where token_hash = $1`, [tokenHash]);
}

// deleteSessionsForUser: revokes every session for one user.
export async function deleteSessionsForUser(userId: number): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `delete from sessions where user_id = $1 returning id`,
    [userId],
  );
  return rows.length;
}

// deleteSessionsBySidHash: revokes sessions for a later front-channel logout.
export async function deleteSessionsBySidHash(
  sidHash: string,
): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `delete from sessions where idp_sid_hash = $1 returning id`,
    [sidHash],
  );
  return rows.length;
}

// deleteExpiredSessions: opportunistic sweep, safe to run on login.
export async function deleteExpiredSessions(): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `delete from sessions where expires_at <= now() returning id`,
  );
  return rows.length;
}
