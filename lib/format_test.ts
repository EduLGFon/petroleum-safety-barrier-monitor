// Unit tests for lib/format.ts - pt-BR date/duration guards.
import { daysSince, fmtDate, humanDuration, timeAgoPt } from "./format.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

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

Deno.test("humanDuration renders non-finite as dash", () => {
  assertStrictEquals(humanDuration(NaN), "-");
  assertStrictEquals(humanDuration(Infinity), "-");
});

Deno.test("daysSince clamps invalid and future dates to zero", () => {
  assertStrictEquals(daysSince("garbage"), 0);
  assertStrictEquals(daysSince("2999-01-01"), 0);
  assert(daysSince("2026-06-21") >= 1);
});

Deno.test("timeAgoPt renders pt-BR relative freshness", () => {
  const now = new Date("2026-09-20T12:00:00.000Z").getTime();
  assertStrictEquals(
    timeAgoPt("2026-09-20T11:55:00.000Z", now),
    "há 5 min",
  );
  assertStrictEquals(timeAgoPt("2026-09-20T10:00:00.000Z", now), "há 2 h");
  assertStrictEquals(
    timeAgoPt("2026-09-19T12:00:00.000Z", now),
    "há 1 dia",
  );
  assertStrictEquals(timeAgoPt("2026-09-20T12:00:30.000Z", now), "agora mesmo");
  assertStrictEquals(timeAgoPt("garbage", now), "agora mesmo");
});
