// DB throttle + KPI other-field + resolver labels integration.
// Needs a real Postgres: skipped when DATABASE_URL is unset so
// `deno task test` stays green without a database.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { getResolverLabels } from "./vocabularies.ts";

import {
  checkDbThrottle,
  THROTTLE_UPSERT_SQL,
  throttleDecision,
} from "./throttle.ts";

import { getKpi } from "./barriers.ts";

import { queryRows } from "../db.ts";

Deno.test("throttleDecision maps the count and DB retry to the decision", () => {
  assertEquals(
    throttleDecision({ count: "1", retry_after_ms: 0 }, 2, 60_000),
    { allowed: true, retryAfterMs: 0 },
  );
  assertEquals(
    throttleDecision({ count: "3", retry_after_ms: "5432.4" }, 2, 60_000),
    { allowed: false, retryAfterMs: 5433 },
  );
  assertEquals(
    throttleDecision(undefined, 2, 60_000),
    { allowed: false, retryAfterMs: 60_000 },
  );
  assertEquals(
    throttleDecision({ count: "3", retry_after_ms: "not-a-number" }, 2, 60_000),
    { allowed: false, retryAfterMs: 0 },
  );
});

Deno.test("throttle upsert computes the window on the database clock", () => {
  assert(THROTTLE_UPSERT_SQL.includes("values ($1, $2, 1, now() +"));
  assert(
    THROTTLE_UPSERT_SQL.includes(
      "then now() + ($3::int * interval '1 millisecond')",
    ),
  );
  assert(THROTTLE_UPSERT_SQL.includes("retry_after_ms"));
});

Deno.test("db throttle enforces shared limit", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const key = `test:${Date.now()}`;
  const first = await checkDbThrottle("test-bucket", key, 2, 60_000);
  assert(first.allowed);
  const second = await checkDbThrottle("test-bucket", key, 2, 60_000);
  assert(second.allowed);
  const third = await checkDbThrottle("test-bucket", key, 2, 60_000);
  assert(!third.allowed);
  await queryRows(
    `delete from throttle_buckets where bucket = 'test-bucket' and key = $1`,
    [key],
  );
});

Deno.test("db throttle window starts from database now()", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const key = `clock:${Date.now()}`;
  await checkDbThrottle("test-bucket", key, 10, 60_000);
  try {
    const rows = await queryRows<{ remaining_ms: string }>(
      `select (extract(epoch from (reset_at - now())) * 1000)::int::text as remaining_ms
         from throttle_buckets
        where bucket = 'test-bucket' and key = $1`,
      [key],
    );
    const remainingMs = Number(rows[0]?.remaining_ms);
    assert(
      remainingMs > 55_000 && remainingMs <= 60_000,
      `expected ~60000 ms of DB-time window, got ${remainingMs}`,
    );
  } finally {
    await queryRows(
      `delete from throttle_buckets where bucket = 'test-bucket' and key = $1`,
      [key],
    );
  }
});

Deno.test("getKpi other field reconciles with total", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const kpi = await getKpi({});
  assertStrictEquals(
    kpi.available + kpi.outOfService + kpi.contingencyOutage +
      kpi.degradedContingency + kpi.degraded + kpi.unavailable + kpi.other,
    kpi.total,
  );
});

Deno.test("getResolverLabels covers all taxonomy dimensions", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const labels = await getResolverLabels();
  assert(labels.locations !== undefined);
  assert(labels.categories !== undefined);
  assert(labels.typologies !== undefined);
  assert(labels.groupings !== undefined);
  assert(labels.owners !== undefined);
  assert(labels.locDescs !== undefined);
  assert(labels.authors !== undefined);
});
