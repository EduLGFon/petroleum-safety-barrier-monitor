// Unit tests for lib/format.ts - pt-BR date/duration guards.
import { assert, assertStrictEquals } from "jsr:@std/assert";
import { daysSince, fmtDate, humanDuration } from "./format.ts";

Deno.test("fmtDate converts ISO to pt-BR", () => {
  assertStrictEquals(fmtDate("2026-06-22"), "22/06/2026");
});

Deno.test("fmtDate passes malformed input through visibly", () => {
  assertStrictEquals(fmtDate("not-a-date"), "not-a-date");
  assertStrictEquals(fmtDate(""), "");
});

Deno.test("humanDuration collapses tiny and huge spans", () => {
  assertStrictEquals(humanDuration(0), "1 dia");
  assertStrictEquals(humanDuration(1), "1 dia");
  assertStrictEquals(humanDuration(9), "1 semana");
  assertStrictEquals(humanDuration(45), "1 mês");
  assertStrictEquals(humanDuration(730), "2 anos");
});

Deno.test("humanDuration renders non-finite as em dash", () => {
  assertStrictEquals(humanDuration(NaN), "—");
  assertStrictEquals(humanDuration(Infinity), "—");
});

Deno.test("daysSince clamps invalid and future dates to zero", () => {
  assertStrictEquals(daysSince("garbage"), 0);
  assertStrictEquals(daysSince("2999-01-01"), 0);
  assert(daysSince("2026-06-21") >= 1);
});
