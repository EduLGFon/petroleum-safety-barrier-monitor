// Users SQL - CRUD for dashboard logins with two roles.
// This is why it exists: authentication needs a validated store behind the
// /api/auth and /api/users routes, while the routes own throttling and the
// session-or-token guard. Password hashing lives in lib/server/auth/.
import { queryRows } from "../db.ts";

export type UserRole = "admin" | "user";

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

// toPublicUser: strips the password hash before any JSON response.
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
  };
}

// normalizeEmail: trims, lowercases, caps length. Throws as 400.
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("email must be a string");
  const email = raw.trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid email address");
  }
  return email;
}

// normalizeName: trims free text; empty stays empty.
export function normalizeName(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error("name must be a string");
  return raw.trim().slice(0, 200);
}

// normalizeRole: only the two supported roles; throws as 400 otherwise.
export function normalizeRole(raw: unknown): UserRole {
  if (raw === "admin" || raw === "user") return raw;
  throw new Error("role must be admin or user");
}

const PUBLIC_COLUMNS =
  "id, email, name, role, active, created_at::text, updated_at::text";

export async function listUsers(): Promise<PublicUser[]> {
  const rows = await queryRows<PublicUser>(
    `select ${PUBLIC_COLUMNS} from users order by id`,
  );
  return rows;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await queryRows<UserRow>(
    `select id, email, name, password_hash, role, active,
            created_at::text, updated_at::text
     from users where email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const rows = await queryRows<UserRow>(
    `select id, email, name, password_hash, role, active,
            created_at::text, updated_at::text
     from users where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function countUsers(): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `select count(*)::text as n from users`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countActiveAdmins(): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `select count(*)::text as n from users where role = 'admin' and active`,
  );
  return Number(rows[0]?.n ?? 0);
}

// createUser: inserts a validated user; passwordHash must already be hashed.
export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}): Promise<PublicUser> {
  const rows = await queryRows<PublicUser>(
    `insert into users (email, name, password_hash, role)
     values ($1, $2, $3, $4)
     returning ${PUBLIC_COLUMNS}`,
    [
      normalizeEmail(input.email),
      normalizeName(input.name),
      input.passwordHash,
      normalizeRole(input.role),
    ],
  );
  return rows[0]!;
}

// updateUser: partial update for name, role, active, or password hash.
// Guards the last active admin: demoting or deactivating it throws.
export async function updateUser(
  id: number,
  patch: {
    name?: unknown;
    role?: unknown;
    active?: unknown;
    passwordHash?: string;
  },
): Promise<PublicUser | null> {
  const current = await getUserById(id);
  if (!current) return null;
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    args.push(normalizeName(patch.name));
    sets.push(`name = $${args.length}`);
  }
  if (patch.role !== undefined) {
    const role = normalizeRole(patch.role);
    if (current.role === "admin" && role !== "admin") {
      if ((await countActiveAdmins()) <= 1 && current.active) {
        throw new Error("cannot demote the last active admin");
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
      if ((await countActiveAdmins()) <= 1 && current.active) {
        throw new Error("cannot deactivate the last active admin");
      }
    }
    args.push(patch.active);
    sets.push(`active = $${args.length}`);
  }
  if (patch.passwordHash !== undefined) {
    args.push(patch.passwordHash);
    sets.push(`password_hash = $${args.length}`);
  }
  if (sets.length === 0) throw new Error("nothing to update");
  args.push(id);
  const rows = await queryRows<PublicUser>(
    `update users set ${sets.join(", ")} where id = $${args.length}
     returning ${PUBLIC_COLUMNS}`,
    args,
  );
  return rows[0] ?? null;
}

// deleteUser: hard delete (sessions cascade). Refuses the last admin.
export async function deleteUser(id: number): Promise<boolean> {
  const current = await getUserById(id);
  if (!current) return false;
  if (current.role === "admin" && current.active) {
    if ((await countActiveAdmins()) <= 1) {
      throw new Error("cannot delete the last active admin");
    }
  }
  const rows = await queryRows<{ id: number }>(
    `delete from users where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}
