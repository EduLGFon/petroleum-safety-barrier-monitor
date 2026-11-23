// Static migration guard for station access backfills.
// This is why it exists: db/schema.sql is re-runnable and runs on every
// `deno task db:migrate`; an unconditional membership/location backfill there
// silently undoes an admin's removals. The regression is visible in the SQL
// text, so this test needs no Postgres and cannot self-skip. A live
// double-migrate assertion belongs to a DB integration suite; there is none
// in this unit (no database available).
import { assert, assertFalse, assertStringIncludes } from "jsr:@std/assert@^1";

const schemaUrl = new URL("./schema.sql", import.meta.url);

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
    /insert\s+into\s+access_group_locations\b/i.test(sql),
    "db:migrate must not re-grant station locations to 'Acesso geral'",
  );
  assertFalse(
    /insert\s+into\s+user_access_groups\b/i.test(sql),
    "db:migrate must not re-add users to 'Acesso geral'",
  );
});
