// Unit tests for scripts/check-migration-order.ts - index-after-column rule.
// This is why it exists: an index placed before its ALTER TABLE stanza
// migrates clean databases but fails pre-existing ones; fixtures pin both
// the violation shape and the real db/schema.sql staying green.
import { checkSchemaOrder } from "./check-migration-order.ts";

import { assertEquals } from "jsr:@std/assert@^1";

Deno.test("checkSchemaOrder passes columns declared in CREATE TABLE", () => {
  const violations = checkSchemaOrder(`
    create table if not exists barriers (
      id integer generated always as identity primary key,
      tag text not null
    );
    create index if not exists idx_barriers_tag on barriers using btree (tag);
  `);
  assertEquals(violations, []);
});

Deno.test("checkSchemaOrder passes an index after its ALTER stanza", () => {
  const violations = checkSchemaOrder(`
    create table if not exists barriers (id integer primary key);
    alter table barriers add column if not exists is_active boolean;
    create index if not exists idx_barriers_is_active on barriers(is_active);
  `);
  assertEquals(violations, []);
});

Deno.test("checkSchemaOrder flags an index before its ALTER even when CREATE TABLE declares it", () => {
  // The exact is_active failure shape: the column rides in CREATE TABLE
  // (so clean databases migrate fine) but the table predates it in the
  // wild, where CREATE TABLE is a no-op and only the later ALTER adds it.
  const violations = checkSchemaOrder(`
    create table if not exists barriers (
      id integer primary key,
      is_active boolean not null default true
    );
    create index if not exists idx_barriers_is_active on barriers(is_active);
    alter table barriers add column if not exists is_active boolean;
  `);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].index, "idx_barriers_is_active");
  assertEquals(violations[0].table, "barriers");
  assertEquals(violations[0].column, "is_active");
});

Deno.test("checkSchemaOrder flags unknown columns and multi-column lists", () => {
  const violations = checkSchemaOrder(`
    create table if not exists barrier_status_history (
      id integer primary key,
      barrier_id integer not null
    );
    create index if not exists idx_history_barrier
      on barrier_status_history(barrier_id, missing_col);
  `);
  assertEquals(violations.length, 1);
  assertEquals(violations[0].column, "missing_col");
});

Deno.test("checkSchemaOrder skips expression index items without alarming", () => {
  const violations = checkSchemaOrder(`
    create table if not exists barriers (id integer primary key);
    create index if not exists idx_barriers_lower
      on barriers(lower(tag));
  `);
  assertEquals(violations, []);
});

Deno.test("checkSchemaOrder keeps the real schema green", async () => {
  const text = await Deno.readTextFile(
    new URL("../db/schema.sql", import.meta.url),
  );
  assertEquals(checkSchemaOrder(text), []);
});
