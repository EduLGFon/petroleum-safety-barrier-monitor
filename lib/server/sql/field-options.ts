// Field option sets SQL - curated answer lists for sheet questions.
// This is why it exists: admins settle default options in Settings and the
// barrier editor offers them; rows seed from the GERAL extraction on first
// read so a fresh database already suggests real workbook values.
import { FIELD_KEYS, SEED_DEFAULTS } from "../../field-options.ts";

import type { FieldKey } from "../../field-options.ts";

import { queryRows } from "../db.ts";

export interface FieldOptionSet {
  field: string;
  options: string[];
  updated_at: string;
  updated_by: string;
}

// listFieldOptionSets: all rows; seeds missing fields from SEED_DEFAULTS so
// readers never see a partial registry on a fresh database.
export async function listFieldOptionSets(): Promise<FieldOptionSet[]> {
  const rows = await queryRows<FieldOptionSet>(
    "select field, options, to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS') as updated_at, updated_by from field_option_sets order by field",
  );
  const have = new Set(rows.map((r) => r.field));
  const missing = (FIELD_KEYS as readonly string[]).filter((k) => !have.has(k));
  if (missing.length > 0) {
    await seedFieldOptions(missing as FieldKey[]);
    const seeded = await queryRows<FieldOptionSet>(
      "select field, options, to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS') as updated_at, updated_by from field_option_sets order by field",
    );
    return seeded;
  }
  return rows.map((r) => ({ ...r, options: asStrings(r.options) }));
}

// upsertFieldOptionSet: replaces one field's list; returns the stored row.
export async function upsertFieldOptionSet(
  field: FieldKey,
  options: string[],
  updatedBy: string,
): Promise<FieldOptionSet> {
  const rows = await queryRows<FieldOptionSet>(
    `insert into field_option_sets (field, options, updated_by)
     values ($1, $2::jsonb, $3)
     on conflict (field) do update
       set options = excluded.options,
           updated_by = excluded.updated_by,
           updated_at = now()
     returning field, options,
       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at,
       updated_by`,
    [field, JSON.stringify(options), updatedBy],
  );
  const row = rows[0];
  if (!row) throw new Error("upsert returned no row");
  return { ...row, options: asStrings(row.options) };
}

// seedFieldOptions: inserts seed defaults for missing fields only.
export async function seedFieldOptions(fields: FieldKey[]): Promise<void> {
  for (const field of fields) {
    await queryRows(
      `insert into field_option_sets (field, options, updated_by)
       values ($1, $2::jsonb, 'seed')
       on conflict (field) do nothing`,
      [field, JSON.stringify(SEED_DEFAULTS[field])],
    );
  }
}

// asStrings: jsonb arrives as string[] via pg driver; guards the shape.
function asStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}
