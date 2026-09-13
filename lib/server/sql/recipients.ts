// Alert recipients SQL - CRUD for the urgent digest audience.
// This is why it exists: the send path must read recipients from the
// database (not env), but only admins may change them - the routes guard
// with P4 checkAdminAuth while this module stays a thin validated store.
import { queryRows } from "../db.ts";

export interface AlertRecipient {
  id: number;
  email: string;
  name: string;
  active: boolean;
  created_at: string;
}

// normalizeEmail: trims, lowercases, caps length. Throws on anything that
// is not plausibly an address - the route turns this into a 400.
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("email must be a string");
  const email = raw.trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid email address");
  }
  return email;
}

// normalizeName: trims and caps free text; empty stays empty.
export function normalizeName(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error("name must be a string");
  return raw.trim().slice(0, 200);
}

export async function listRecipients(
  activeOnly = false,
): Promise<AlertRecipient[]> {
  return await queryRows<AlertRecipient>(
    `select id, email, name, active, created_at::text
     from alert_recipients
     ${activeOnly ? "where active" : ""}
     order by id`,
  );
}

export async function createRecipient(
  email: string,
  name: string,
): Promise<AlertRecipient> {
  const rows = await queryRows<AlertRecipient>(
    `insert into alert_recipients (email, name)
     values ($1, $2)
     on conflict (email) do update set name = excluded.name
     returning id, email, name, active, created_at::text`,
    [normalizeEmail(email), normalizeName(name)],
  );
  return rows[0]!;
}

export async function updateRecipient(
  id: number,
  patch: { name?: unknown; active?: unknown },
): Promise<AlertRecipient | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    args.push(normalizeName(patch.name));
    sets.push(`name = $${args.length}`);
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
     returning id, email, name, active, created_at::text`,
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
