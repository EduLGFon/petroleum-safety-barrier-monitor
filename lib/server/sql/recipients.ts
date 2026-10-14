// Alert recipients SQL - CRUD for the urgent digest audience.
// This is why it exists: the send path must read recipients from the
// database (not env), but only admins may change them - the routes guard
// with P4 checkAdminAuth while this module stays a thin validated store.
import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
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
