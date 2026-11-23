// Static migration guard for station access backfills.
// This is why it exists: db/schema.sql is re-runnable and runs on every
// `deno task db:migrate`; an unconditional membership/location backfill there
// silently undoes an admin's removals. The regression is visible in the SQL
// text, so this test needs no Postgres and cannot self-skip. The INSERT guard
// also matches schema-qualified and quoted spellings
// (`public.access_group_locations`, `"user_access_groups"`), so a qualified
// backfill cannot slip past a bare-table pattern. A live double-migrate
// assertion belongs to a DB integration suite; there is none in this unit
// (no database available).
import { assert, assertFalse, assertStringIncludes } from "jsr:@std/assert@^1";

const schemaUrl = new URL("./schema.sql", import.meta.url);

// Matches an INSERT into either link table with an optional schema qualifier
// and optional quoting on the schema, the table, or both.
const locationInsert =
  /insert\s+into\s+(?:(?:"public"|public)\s*\.\s*)?["']?access_group_locations["']?\b/i;
const membershipInsert =
  /insert\s+into\s+(?:(?:"public"|public)\s*\.\s*)?["']?user_access_groups["']?\b/i;

Deno.test("schema keeps the default access group row", async () => {
  const sql = await Deno.readTextFile(schemaUrl);
  assertStringIncludes(sql, "insert into access_groups (name, description)");
  assertStringIncludes(sql, "'Acesso geral'");
  assertStringIncludes(sql, "on conflict (name) do nothing");
});

Deno.test("schema never backfills access-group memberships or locations", async () => {
  const sql = await Deno.readTextFile(schemaUrl);
  // The table DDL is fine; only INSERTs would re-add removed rows.
  assert(
    /create table if not exists access_group_locations\b/i.test(sql),
    "access_group_locations table DDL must remain",
  );
  assert(
    /create table if not exists user_access_groups\b/i.test(sql),
    "user_access_groups table DDL must remain",
  );
  assertFalse(
    locationInsert.test(sql),
    "db:migrate must not re-grant station locations to 'Acesso geral'",
  );
  assertFalse(
    membershipInsert.test(sql),
    "db:migrate must not re-add users to 'Acesso geral'",
  );
});

Deno.test("schema guard catches qualified or quoted link-table inserts", () => {
  for (
    const snippet of [
      "insert into access_group_locations (group_id) values (1)",
      "INSERT INTO public.access_group_locations (group_id) values (1)",
      'insert into "access_group_locations" (group_id) values (1)',
      'insert into public."access_group_locations" values (1)',
      'insert into "public".access_group_locations values (1)',
    ]
  ) {
    assert(locationInsert.test(snippet), `must catch: ${snippet}`);
  }
  for (
    const snippet of [
      "insert into user_access_groups (group_id) values (1)",
      "INSERT INTO public.user_access_groups (group_id) values (1)",
      'insert into "user_access_groups" (group_id) values (1)',
      'insert into public."user_access_groups" values (1)',
      'insert into "public".user_access_groups values (1)',
    ]
  ) {
    assert(membershipInsert.test(snippet), `must catch: ${snippet}`);
  }
  assertFalse(
    locationInsert.test(
      "create table if not exists access_group_locations (id integer)",
    ),
    "DDL must not read as a backfill",
  );
  assertFalse(
    membershipInsert.test(
      "create table if not exists user_access_groups (id integer)",
    ),
    "DDL must not read as a backfill",
  );
});
