// Pure tests for field option seeding (no DB).
// This is why it exists: first read of a fresh database seeded one INSERT per
// missing field; the batched builder must stay a single statement.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { buildSeedFieldOptionsStatement } from "./field-options.ts";

import { FIELD_KEYS, SEED_DEFAULTS } from "../../field-options.ts";

Deno.test("seed builder batches all fields into one insert", () => {
  const { text, args } = buildSeedFieldOptionsStatement(["origin", "category"]);
  assertStrictEquals(
    (text.match(/insert into field_option_sets/g) ?? []).length,
    1,
  );
  assertEquals(
    text.includes("($1, $2::jsonb, 'seed'), ($3, $4::jsonb, 'seed')"),
    true,
  );
  assertEquals(text.includes("on conflict (field) do nothing"), true);
  assertEquals(args, [
    "origin",
    JSON.stringify(SEED_DEFAULTS.origin),
    "category",
    JSON.stringify(SEED_DEFAULTS.category),
  ]);
});

Deno.test("seed builder handles empty and duplicate field lists", () => {
  assertEquals(buildSeedFieldOptionsStatement([]), { text: "", args: [] });
  const { text, args } = buildSeedFieldOptionsStatement([
    "origin",
    "origin",
  ]);
  assertStrictEquals(args.length, 2);
  assertEquals(text.includes("$1"), true);
  assertEquals(text.includes("$3"), false);
});

Deno.test("seed builder keeps every field in one statement", () => {
  const { text, args } = buildSeedFieldOptionsStatement(FIELD_KEYS);
  assertStrictEquals(
    (text.match(/insert into field_option_sets/g) ?? []).length,
    1,
  );
  assertStrictEquals(args.length, FIELD_KEYS.length * 2);
  assertEquals(text.includes(`$${FIELD_KEYS.length * 2}`), true);
});
