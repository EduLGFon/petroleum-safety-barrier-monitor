// Users SQL - CRUD for dashboard logins with two roles.
// This is why it exists: authentication needs a validated store behind the
// /api/auth and /api/users routes, while the routes own throttling and the
// session-or-token guard. Password hashing lives in lib/server/auth/.
import {
  normalizeEmail,
  normalizeEntraObjectId,
  normalizeName,
  normalizePhone,
  ValidationError,
} from "../validation.ts";

import { queryRows, type TxQuery, withTx } from "../db.ts";

export { normalizeEmail, normalizeName, normalizePhone };

export type UserRole = "admin" | "user";

export type AuthSource = "local" | "entra";

export interface UserRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  password_hash: string | null;
  must_change_password: boolean;
  role: UserRole;
  active: boolean;
  created_at: string;
  auth_source: AuthSource;
  entra_tid: string | null;
  entra_oid: string | null;
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  auth_source: AuthSource;
  // Surfaced so the admin list can show who has never picked a password of
  // their own - the people still holding a system-generated one.
  must_change_password: boolean;
}

export interface AdminUser extends PublicUser {
  entra_oid: string | null;
}

// toPublicUser: strips the password hash before any JSON response.
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
    auth_source: row.auth_source,
    must_change_password: row.must_change_password,
  };
}

// toAdminUser: admin-only view, includes the Entra object id for verification.
export function toAdminUser(row: UserRow): AdminUser {
  return {
    ...toPublicUser(row),
    entra_oid: row.entra_oid,
  };
}

// normalizeRole: only the two supported roles; throws as 400 otherwise.
export function normalizeRole(raw: unknown): UserRole {
  if (raw === "admin" || raw === "user") return raw;
  throw new Error("role must be admin or user");
}

// normalizeAuthSource: local password or Microsoft Entra ID.
export function normalizeAuthSource(raw: unknown): AuthSource {
  if (raw === "local" || raw === "entra") return raw;
  throw new Error("authSource must be local or entra");
}

const PUBLIC_COLUMNS =
  "id, email, name, coalesce(phone, '') as phone, role, active, created_at::text, auth_source, must_change_password";

const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, entra_oid`;

const USER_COLUMNS =
  "id, email, name, coalesce(phone, '') as phone, password_hash, role, active, created_at::text, auth_source, entra_tid, entra_oid, must_change_password";

export async function listUsers(): Promise<AdminUser[]> {
  const rows = await queryRows<AdminUser>(
    `select ${ADMIN_COLUMNS} from users order by id`,
  );
  return rows;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await queryRows<UserRow>(
    `select ${USER_COLUMNS} from users where email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserById(
  id: number,
  query: TxQuery = queryRows,
): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `select ${USER_COLUMNS} from users where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getUserByEntraIdentity(
  tenantId: string,
  objectId: string,
  query: TxQuery = queryRows,
): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `select ${USER_COLUMNS}
     from users
     where auth_source = 'entra' and entra_tid = $1 and entra_oid = $2`,
    [tenantId, objectId],
  );
  return rows[0] ?? null;
}

// getPendingEntraUserByEmail: an account an admin enabled for SSO that has
// not completed its first Entra sign-in yet, so no object id is bound. This
// is the e-mail hand-off that spares the admin from hunting a GUID: the admin
// enables SSO for an address, the first valid sign-in for that same address
// binds the identity, and every later sign-in matches by object id.
//
// It is not an authorization by itself: the row must already exist, be
// active, and be marked auth_source='entra'. A local account is never matched
// here - converting one is an explicit admin act.
export async function getPendingEntraUserByEmail(
  email: string,
  query: TxQuery = queryRows,
): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `select ${USER_COLUMNS}
     from users
     where auth_source = 'entra'
       and entra_oid is null
       and entra_tid is null
       and active
       and lower(email) = $1`,
    [normalizeEmail(email)],
  );
  return rows[0] ?? null;
}

export interface PendingEntraMatch {
  id: number;
  email: string;
}

// selectPendingEntraMatch: the one pending account the token's address claims
// agree on, or null when there is none or more than one distinct id. The
// callback never guesses: a second address pointing at a different account is
// a reason to deny, not to pick the first match. Two claims that resolve to
// the same id are still one account (the stored email is what matched).
export function selectPendingEntraMatch(
  matches: readonly PendingEntraMatch[],
): PendingEntraMatch | null {
  const byId = new Map<number, PendingEntraMatch>();
  for (const match of matches) {
    if (!byId.has(match.id)) byId.set(match.id, match);
  }
  if (byId.size !== 1) return null;
  return byId.values().next().value ?? null;
}

// bindEntraIdentity: writes tenant + object id onto a pending Entra account.
// The null checks in the WHERE clause are a lock, not a filter: when two
// callbacks race on the same account only one of them matches, and the unique
// index on (entra_tid, entra_oid) refuses binding one object id to a second
// account. The address must be the exact one that was looked up, so a row
// whose email changed between the read and the write is not bound by mistake.
// A caller that gets null must deny the sign-in instead of retrying, because
// null means the row stopped being bindable.
export async function bindEntraIdentity(
  userId: number,
  tenantId: string,
  objectId: string,
  email: string,
  query: TxQuery = queryRows,
): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `update users
        set entra_tid = $2,
            entra_oid = $3,
            updated_at = now()
      where id = $1
        and auth_source = 'entra'
        and entra_oid is null
        and entra_tid is null
        and lower(email) = lower($4)
        and active
      returning ${USER_COLUMNS}`,
    [
      userId,
      tenantId,
      normalizeEntraObjectId(objectId),
      normalizeEmail(email),
    ],
  );
  return rows[0] ?? null;
}

export async function countUsers(): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `select count(*)::text as n from users`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countActiveAdmins(
  query: TxQuery = queryRows,
): Promise<number> {
  const rows = await query<{ n: string }>(
    `select count(*)::text as n from users where role = 'admin' and active`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countActiveLocalAdmins(
  query: TxQuery = queryRows,
): Promise<number> {
  const rows = await query<{ n: string }>(
    `select count(*)::text as n from users
     where role = 'admin' and active and auth_source = 'local'`,
  );
  return Number(rows[0]?.n ?? 0);
}

// createUser: inserts a validated user; passwordHash must already be hashed.
export async function createUser(input: {
  email: string;
  name: string;
  phone?: unknown;
  passwordHash?: string | null;
  role: UserRole;
  authSource?: AuthSource;
  entraTid?: string | null;
  entraOid?: string | null;
  // Marks an account created with a system-generated password. It is a
  // property of how the account was born, so it is set here and not by a
  // later update: an account that is never flagged is one whose password
  // the person chose.
  mustChangePassword?: boolean;
}): Promise<AdminUser> {
  const authSource = input.authSource ?? "local";
  const rows = await queryRows<AdminUser>(
    `insert into users
       (email, name, phone, password_hash, role, auth_source, entra_tid, entra_oid, must_change_password)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${ADMIN_COLUMNS}`,
    [
      normalizeEmail(input.email),
      normalizeName(input.name),
      normalizePhone(input.phone ?? ""),
      input.passwordHash ?? null,
      normalizeRole(input.role),
      normalizeAuthSource(authSource),
      input.entraTid ?? null,
      input.entraOid ?? null,
      input.mustChangePassword === true,
    ],
  );
  const created = rows[0];
  if (!created) throw new Error("createUser returned no row");
  return created;
}

// lockActiveAdmins: serializes the last-admin guard. Without the row locks,
// two admins demoting/deactivating each other at the same time can both pass
// the "more than one active admin" check and leave the app with zero admins.
async function lockActiveAdmins(query: TxQuery): Promise<void> {
  await query(
    `select id from users where role = 'admin' and active order by id for update`,
  );
}

// updateUser: partial update for name, role, active, or password hash.
// Guards the last active admin: demoting or deactivating it throws. A password
// change or active-state change revokes every session in the same transaction,
// so a hash change never survives a failed revocation. The optional guard makes
// the update conditional: a concurrent admin reset or deactivation wins instead
// of being overwritten by a stale self-service password change.
export async function updateUser(
  id: number,
  patch: {
    email?: unknown;
    name?: unknown;
    phone?: unknown;
    role?: unknown;
    active?: unknown;
    passwordHash?: string;
    authSource?: unknown;
    entraTid?: string | null;
    entraOid?: unknown;
    mustChangePassword?: boolean;
  },
  guard: {
    expectedPasswordHash?: string;
    requireActive?: boolean;
  } = {},
): Promise<PublicUser | null> {
  return await withTx(async (query) => {
    await lockActiveAdmins(query);
    const current = await getUserById(id, query);
    if (!current) return null;
    const nextAuthSource = patch.authSource === undefined
      ? current.auth_source
      : normalizeAuthSource(patch.authSource);
    const convertingToEntra = current.auth_source === "local" &&
      nextAuthSource === "entra";
    // Converting drops the password so the row can satisfy
    // users_auth_source_shape. A password in the same call would fight that
    // conversion in the same SET list, so refuse before the UPDATE runs.
    if (convertingToEntra && patch.passwordHash !== undefined) {
      throw new Error("cannot set a password while converting to Entra");
    }
    const sets: string[] = [];
    const args: unknown[] = [];
    let identityChanged = false;
    let revokeSessions = false;
    if (patch.email !== undefined) {
      args.push(normalizeEmail(patch.email));
      sets.push(`email = $${args.length}`);
    }
    if (patch.name !== undefined) {
      args.push(normalizeName(patch.name));
      sets.push(`name = $${args.length}`);
    }
    if (patch.phone !== undefined) {
      args.push(normalizePhone(patch.phone));
      sets.push(`phone = $${args.length}`);
    }
    if (patch.mustChangePassword !== undefined && !convertingToEntra) {
      args.push(patch.mustChangePassword === true);
      sets.push(`must_change_password = $${args.length}`);
    }
    if (patch.authSource !== undefined) {
      if (convertingToEntra) {
        if (
          current.role === "admin" && current.active &&
          (await countActiveLocalAdmins(query)) <= 1
        ) {
          throw new Error("cannot convert the last active local admin");
        }
        identityChanged = true;
        revokeSessions = true;
        args.push("entra");
        sets.push(`auth_source = $${args.length}`);
        args.push(null);
        sets.push(`password_hash = $${args.length}`);
        // The flag is meaningless on an Entra row (there is no password to
        // replace) and a stale true would send the person to /trocar-senha
        // forever, so clear it in this same UPDATE.
        args.push(false);
        sets.push(`must_change_password = $${args.length}`);
      } else if (
        current.auth_source === "entra" && nextAuthSource === "local"
      ) {
        throw new Error("conversion back to local is not supported");
      } else if (nextAuthSource !== current.auth_source) {
        identityChanged = true;
        revokeSessions = true;
        args.push(nextAuthSource);
        sets.push(`auth_source = $${args.length}`);
      }
    }

    if (patch.entraTid !== undefined) {
      args.push(patch.entraTid);
      sets.push(`entra_tid = $${args.length}`);
      identityChanged = true;
    }

    if (patch.entraOid !== undefined) {
      const objectId = patch.entraOid === null
        ? null
        : normalizeEntraObjectId(patch.entraOid);
      if (
        current.auth_source !== "entra" &&
        (patch.authSource === undefined || patch.authSource !== "entra")
      ) {
        throw new Error("entraObjectId requires an Entra user");
      }
      if (objectId !== current.entra_oid) {
        identityChanged = true;
        revokeSessions = true;
      }
      args.push(objectId);
      sets.push(`entra_oid = $${args.length}`);
    }

    if (patch.role !== undefined) {
      const role = normalizeRole(patch.role);
      if (current.role === "admin" && role !== "admin") {
        if ((await countActiveAdmins(query)) <= 1 && current.active) {
          throw new Error("cannot demote the last active admin");
        }
        if (
          current.auth_source === "local" && current.active &&
          (await countActiveLocalAdmins(query)) <= 1
        ) {
          throw new Error("cannot demote the last active local admin");
        }
      }
      args.push(role);
      sets.push(`role = $${args.length}`);
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        throw new Error("active must be a boolean");
      }
      if (current.role === "admin" && patch.active === false) {
        if ((await countActiveAdmins(query)) <= 1 && current.active) {
          throw new Error("cannot deactivate the last active admin");
        }
        if (
          current.auth_source === "local" && current.active &&
          (await countActiveLocalAdmins(query)) <= 1
        ) {
          throw new Error("cannot deactivate the last active local admin");
        }
      }
      args.push(patch.active);
      sets.push(`active = $${args.length}`);
    }
    if (patch.passwordHash !== undefined) {
      if (current.auth_source === "entra") {
        throw new Error("SSO users do not use passwords");
      }
      args.push(patch.passwordHash);
      sets.push(`password_hash = $${args.length}`);
      revokeSessions = true;
    }
    if (sets.length === 0) throw new Error("nothing to update");
    args.push(id);
    const conditions = [`id = $${args.length}`];
    if (guard.expectedPasswordHash !== undefined) {
      args.push(guard.expectedPasswordHash);
      conditions.push(`password_hash = $${args.length}`);
    }
    if (guard.requireActive) conditions.push("active = true");
    const rows = await query<PublicUser>(
      `update users set ${sets.join(", ")}
       where ${conditions.join(" and ")}
       returning ${PUBLIC_COLUMNS}`,
      args,
    );
    if (rows.length === 0) return null;
    // Any active-state change revokes sessions: deactivation must not leave a
    // dormant cookie that comes back to life before the 12 h TTL expires, and
    // reactivation must not revive sessions created before deactivation.
    const activeChanged = patch.active !== undefined &&
      patch.active !== current.active;
    if (
      revokeSessions || patch.passwordHash !== undefined || activeChanged ||
      identityChanged
    ) {
      await query(`delete from sessions where user_id = $1`, [id]);
    }
    return rows[0] ?? null;
  });
}

// deleteUser: hard delete (sessions cascade). Refuses the last admin. The
// active-admin locks make the guard safe against concurrent deletions.
export async function deleteUser(id: number): Promise<boolean> {
  return await withTx(async (query) => {
    await lockActiveAdmins(query);
    const current = await getUserById(id, query);
    if (!current) return false;
    if (current.role === "admin" && current.active) {
      if ((await countActiveAdmins(query)) <= 1) {
        throw new Error("cannot delete the last active admin");
      }
      if (
        current.auth_source === "local" &&
        (await countActiveLocalAdmins(query)) <= 1
      ) {
        throw new Error("cannot delete the last active local admin");
      }
    }
    const rows = await query<{ id: number }>(
      `delete from users where id = $1 returning id`,
      [id],
    );
    return rows.length > 0;
  });
}

// --- Bulk helpers (pure + transactional) ----------------------------

export type UserBatchAction =
  | "activate"
  | "deactivate"
  | "promote"
  | "demote"
  | "revokeSessions";

// normalizeUserBatchIds: validates and dedupes the id list for a batch
// action. Caps at 500 distinct positive integers; rejects anything that is
// not a safe positive integer.
export function normalizeUserBatchIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("ids must be an array");
  }
  const ids: number[] = [];
  for (const item of raw) {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      throw new ValidationError("ids must be positive integers");
    }
    ids.push(item);
  }
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) {
    throw new ValidationError("ids must not be empty");
  }
  if (unique.length > 500) {
    throw new ValidationError("ids must not exceed 500");
  }
  return unique;
}

// normalizeUserBatchAction: accepts only the documented canonical actions;
// no PT/EN aliases and no fuzzy normalization.
export function normalizeUserBatchAction(raw: unknown): UserBatchAction {
  if (
    raw === "activate" || raw === "deactivate" || raw === "promote" ||
    raw === "demote" || raw === "revokeSessions"
  ) {
    return raw;
  }
  throw new ValidationError(
    "action must be one of activate, deactivate, promote, demote, revokeSessions",
  );
}

// batchUsers: one transaction. Locks active admins, fails when any id is
// missing, preserves the last-active-admin and last-active-local-admin
// guards, revokes sessions on active-state changes, and returns the rows
// actually changed. revokeSessions counts deleted session rows.
export async function batchUsers(
  ids: number[],
  action: UserBatchAction,
): Promise<{ affected: number }> {
  return await withTx(async (query) => {
    await lockActiveAdmins(query);
    const rows = await query<
      { id: number; active: boolean; role: string; auth_source: string }
    >(
      `select id, active, role, auth_source from users where id = any($1)`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new ValidationError(`missing users: ${missing.join(", ")}`);
    }

    if (action === "revokeSessions") {
      const deleted = await query<{ id: number }>(
        `delete from sessions where user_id = any($1::int[]) returning id`,
        [ids],
      );
      return { affected: deleted.length };
    }

    let affected = 0;
    const changedActive: number[] = [];

    for (const id of ids) {
      const current = byId.get(id);
      if (!current) continue;
      if (action === "activate") {
        if (current.active) continue;
        await query(`update users set active = true where id = $1`, [id]);
        affected += 1;
        changedActive.push(id);
      } else if (action === "deactivate") {
        if (!current.active) continue;
        if (current.role === "admin") {
          if ((await countActiveAdmins(query)) <= 1) {
            throw new ValidationError(
              "cannot deactivate the last active admin",
            );
          }
          if (
            current.auth_source === "local" &&
            (await countActiveLocalAdmins(query)) <= 1
          ) {
            throw new ValidationError(
              "cannot deactivate the last active local admin",
            );
          }
        }
        await query(`update users set active = false where id = $1`, [id]);
        affected += 1;
        changedActive.push(id);
      } else if (action === "promote") {
        if (current.role === "admin") continue;
        await query(`update users set role = 'admin' where id = $1`, [id]);
        affected += 1;
      } else if (action === "demote") {
        if (current.role !== "admin") continue;
        if (current.active) {
          if ((await countActiveAdmins(query)) <= 1) {
            throw new ValidationError("cannot demote the last active admin");
          }
          if (
            current.auth_source === "local" &&
            (await countActiveLocalAdmins(query)) <= 1
          ) {
            throw new ValidationError(
              "cannot demote the last active local admin",
            );
          }
        }
        await query(`update users set role = 'user' where id = $1`, [id]);
        affected += 1;
      }
    }

    if (changedActive.length > 0) {
      await query(`delete from sessions where user_id = any($1)`, [
        changedActive,
      ]);
    }
    return { affected };
  });
}
