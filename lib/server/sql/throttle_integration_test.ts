// DB throttle + KPI other-field + resolver labels integration.
// Needs a real Postgres: skipped when DATABASE_URL is unset so
// `deno task test` stays green without a database.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { getResolverLabels } from "./vocabularies.ts";

import { checkDbThrottle } from "./throttle.ts";

import { getKpi } from "./barriers.ts";

import { queryRows } from "../db.ts";

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
