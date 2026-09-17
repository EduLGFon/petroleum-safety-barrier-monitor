// Authors SQL - lookup for status change attribution.
// This is why it exists: PATCH /api/barriers/:id/status needs an author_id,
// but dashboard logins only know their user name. This helper resolves or
// creates the author row so the UI never asks admins to pick numeric ids.
import { queryRows } from "../db.ts";

export interface AuthorRow {
  id: number;
  name: string;
}

// normalizeAuthorName: trims and caps; throws as 400 on empty.
export function normalizeAuthorName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("author name must be a string");
  const name = raw.trim().slice(0, 200);
  if (!name) throw new Error("author name must not be empty");
  return name;
}

export async function listAuthors(): Promise<AuthorRow[]> {
  return await queryRows<AuthorRow>(
    `select id, name from authors order by name`,
  );
}

// getOrCreateAuthor: finds by exact name or inserts with the next free id.
// The authors table has no identity default (seed rows use explicit ids),
// so the insert computes max(id)+1. ON CONFLICT keeps it safe when the name
// already exists; concurrent same-name inserts may retry on a rare id race.
export async function getOrCreateAuthor(name: string): Promise<AuthorRow> {
  const clean = normalizeAuthorName(name);
  const rows = await queryRows<AuthorRow>(
    `with next as (select coalesce(max(id), 0) + 1 as nid from authors)
     insert into authors (id, name)
     select nid, $1 from next
     on conflict (name) do update set name = excluded.name
     returning id, name`,
    [clean],
  );
  return rows[0]!;
}
