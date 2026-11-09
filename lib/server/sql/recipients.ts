// Alert recipients SQL - CRUD for the urgent digest audience.
// This is why it exists: the send path must read recipients from the
// database (not env), but only admins may change them - the routes guard
// with P4 checkAdminAuth while this module stays a thin validated store.
import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
  ValidationError,
} from "../validation.ts";

export { normalizeEmail, normalizeName, normalizePhone };

import { queryRows } from "../db.ts";

export interface AlertRecipient {
  id: number;
  email: string;
  name: string;
  phone: string;
  active: boolean;
  created_at: string;
}

export async function listRecipients(
  activeOnly = false,
): Promise<AlertRecipient[]> {
  return await queryRows<AlertRecipient>(
    `select id, email, name, coalesce(phone, '') as phone, active, created_at::text
     from alert_recipients
     ${activeOnly ? "where active" : ""}
     order by id`,
  );
}

export async function createRecipient(
  email: string,
  name: string,
  phone: unknown = "",
): Promise<AlertRecipient> {
  const rows = await queryRows<AlertRecipient>(
    `insert into alert_recipients (email, name, phone)
     values ($1, $2, $3)
     on conflict (email) do update set name = excluded.name, phone = excluded.phone
     returning id, email, name, coalesce(phone, '') as phone, active, created_at::text`,
    [normalizeEmail(email), normalizeName(name), normalizePhone(phone)],
  );
  const created = rows[0];
  if (!created) throw new Error("createRecipient returned no row");
  return created;
}

export async function updateRecipient(
  id: number,
  patch: { name?: unknown; phone?: unknown; active?: unknown },
): Promise<AlertRecipient | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    args.push(normalizeName(patch.name));
    sets.push(`name = $${args.length}`);
  }
  if (patch.phone !== undefined) {
    args.push(normalizePhone(patch.phone));
    sets.push(`phone = $${args.length}`);
  }
  if (patch.active !== undefined) {
    if (typeof patch.active !== "boolean") {
      throw new Error("active must be a boolean");
    }
    args.push(patch.active);
    sets.push(`active = $${args.length}`);
  }
  if (sets.length === 0) throw new Error("nothing to update");
  args.push(id);
  const rows = await queryRows<AlertRecipient>(
    `update alert_recipients set ${sets.join(", ")}
     where id = $${args.length}
     returning id, email, name, coalesce(phone, '') as phone, active, created_at::text`,
    args,
  );
  return rows[0] ?? null;
}

export async function deleteRecipient(id: number): Promise<boolean> {
  const rows = await queryRows<{ id: number }>(
    `delete from alert_recipients where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}

// validateRecipientIds: pure validator for batch id arrays. Returns a deduped
// list of positive safe integers and throws on anything else, so the route and
// the SQL store agree on the 500-id ceiling and the wire contract.
export function validateRecipientIds(
  raw: unknown,
  field = "ids",
): number[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError(`${field} must be an array`);
  }
  if (raw.length === 0) {
    throw new ValidationError(`${field} must not be empty`);
  }
  if (raw.length > 500) {
    throw new ValidationError(`${field} must contain at most 500 items`);
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of raw) {
    if (
      typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0
    ) {
      throw new ValidationError(`${field} must contain positive integers`);
    }
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  if (out.length === 0) {
    throw new ValidationError(`${field} must not be empty`);
  }
  if (out.length > 500) {
    throw new ValidationError(`${field} must contain at most 500 items`);
  }
  return out;
}

// activateRecipients: marks the given recipients active. Returns affected count.
export async function activateRecipients(ids: number[]): Promise<number> {
  const valid = validateRecipientIds(ids);
  const rows = await queryRows<{ id: number }>(
    `update alert_recipients set active = true
     where id = any($1::int[])
     returning id`,
    [valid],
  );
  return rows.length;
}

// deactivateRecipients: marks the given recipients inactive.
export async function deactivateRecipients(ids: number[]): Promise<number> {
  const valid = validateRecipientIds(ids);
  const rows = await queryRows<{ id: number }>(
    `update alert_recipients set active = false
     where id = any($1::int[])
     returning id`,
    [valid],
  );
  return rows.length;
}

// deleteRecipients: removes the given recipients. Returns affected count.
export async function deleteRecipients(ids: number[]): Promise<number> {
  const valid = validateRecipientIds(ids);
  const rows = await queryRows<{ id: number }>(
    `delete from alert_recipients where id = any($1::int[]) returning id`,
    [valid],
  );
  return rows.length;
}

// addRecipientUsers: inserts recipients from users, reviving/updating on email
// conflict and forcing active = true. Returns affected count (inserted or
// updated rows).
export async function addRecipientUsers(userIds: number[]): Promise<number> {
  const valid = validateRecipientIds(userIds, "userIds");
  const rows = await queryRows<{ id: number }>(
    `insert into alert_recipients (email, name, phone, active)
     select u.email, u.name, coalesce(u.phone, ''), true
     from users u
     where u.id = any($1::int[])
     on conflict (email) do update set
       name = excluded.name,
       phone = excluded.phone,
       active = true
     returning id`,
    [valid],
  );
  return rows.length;
}

// batchRecipients: single dispatcher used by the batch route. Returns affected.
export async function batchRecipients(
  action: unknown,
  ids?: unknown,
  userIds?: unknown,
): Promise<number> {
  if (action === "activate") {
    return await activateRecipients(validateRecipientIds(ids));
  }
  if (action === "deactivate") {
    return await deactivateRecipients(validateRecipientIds(ids));
  }
  if (action === "delete") {
    return await deleteRecipients(validateRecipientIds(ids));
  }
  if (action === "addUsers") {
    return await addRecipientUsers(validateRecipientIds(userIds, "userIds"));
  }
  throw new ValidationError(
    "action must be activate, deactivate, delete, or addUsers",
  );
}
