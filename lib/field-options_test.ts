// Unit tests for lib/field-options.ts - option normalization and validation.
import {
  FIELD_KEYS,
  FIELD_LABELS,
  isFieldKey,
  MAX_OPTION_LEN,
  MAX_OPTIONS,
  normalizeOptions,
  SEED_DEFAULTS,
} from "./field-options.ts";

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";

Deno.test("isFieldKey validates known field keys", () => {
  assert(isFieldKey("opStatus"));
  assert(isFieldKey("origin"));
  assert(!isFieldKey("unknownField"));
  assert(!isFieldKey(123));
  assert(!isFieldKey(null));
});

Deno.test("every FIELD_KEY has a label and seed default array", () => {
  for (const k of FIELD_KEYS) {
    assert(typeof FIELD_LABELS[k] === "string" && FIELD_LABELS[k].length > 0);
    assert(Array.isArray(SEED_DEFAULTS[k]));
  }
});

Deno.test("normalizeOptions trims, dedupes and caps", () => {
  const normalized = normalizeOptions([
    "  Sim  ",
    "Não",
    "Sim", // duplicate
    "  ", // empty
    "Talvez",
  ]);
  assertEquals(normalized, ["Sim", "Não", "Talvez"]);
});

Deno.test("normalizeOptions enforces string types and non-empty result", () => {
  assertThrows(() => normalizeOptions("not-an-array"), Error);
  assertThrows(() => normalizeOptions([123]), Error);
  assertThrows(() => normalizeOptions(["", "   "]), Error);
});

Deno.test("normalizeOptions caps length and count", () => {
  const longStr = "a".repeat(MAX_OPTION_LEN + 50);
  const normalized = normalizeOptions([longStr]);
  assertEquals(normalized[0].length, MAX_OPTION_LEN);

  const many = Array.from(
    { length: MAX_OPTIONS + 20 },
    (_, i) => `Option ${i}`,
  );
  assertEquals(normalizeOptions(many).length, MAX_OPTIONS);
});
