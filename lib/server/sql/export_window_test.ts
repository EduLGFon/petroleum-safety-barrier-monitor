// Keyset export paging - offset and keyset walks return the identical id
// sequence for every sortable column and direction. Needs a real Postgres:
// skipped with a log line when DATABASE_URL is unset. Cleans up its own
// KST rows (restoring any the live poller retired mid-run, like the P4T
// drill) so parallel suites never observe them.
import { listBarrierWindow, listBarrierWindowAfter } from "./barriers.ts";
import type { WindowCursor } from "./barriers.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { SORTABLE } from "./where.ts";

import { queryRows } from "../db.ts";

const KST_TAG = "KST-TAG";

async function cleanup(): Promise<void> {
  await queryRows(
    `update barriers set deleted_at = null where external_code like 'KST-%'`,
  );
  await queryRows(
    `delete from barrier_status_history
     where barrier_id in (select id from barriers where external_code like 'KST-%')`,
  );
  await queryRows(`delete from barriers where external_code like 'KST-%'`);
}

Deno.test("keyset export walk matches offset walk on every sort", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const locs = await queryRows<{ id: number }>(
    "select id from locations order by code limit 2",
  );
  const cats = await queryRows<{ id: number }>(
    "select id from categories order by id limit 2",
  );
  const typs = await queryRows<{ id: number }>(
    "select id from typologies order by id limit 2",
  );
  const descs = await queryRows<{ id: number }>(
    "select id from loc_descs order by id limit 1",
  );
  const crits = await queryRows<{ id: number }>(
    "select id from criticality_levels order by id limit 2",
  );
  const grps = await queryRows<{ id: number }>(
    "select id from groupings order by id limit 1",
  );
  const owns = await queryRows<{ id: number }>(
    "select id from owners order by id limit 1",
  );
  const avails = await queryRows<{ id: number; is_compliant: boolean }>(
    "select id, is_compliant from availability_statuses order by id",
  );
  const availOk = avails.find((a) => a.is_compliant);
  const availNc = avails.find((a) => !a.is_compliant);
  if (
    locs.length < 2 || cats.length < 1 || typs.length < 2 ||
    descs.length < 1 || crits.length < 2 || grps.length < 1 ||
    owns.length < 1 || !availOk || !availNc
  ) {
    console.log("skip: need populated lookups for KST rows");
    return;
  }
  await cleanup();
  try {
    const values: string[] = [];
    const args: unknown[] = [];
    for (let i = 1; i <= 12; i++) {
      args.push(
        `KST-${i}`,
        `${KST_TAG}-${String(i).padStart(2, "0")}`,
        locs[(i - 1) % 2]!.id,
        typs[(i - 1) % 2]!.id,
        descs[0]!.id,
        crits[(i - 1) % 2]!.id,
        cats[(i - 1) % cats.length]!.id,
        grps[0]!.id,
        i % 2 === 0 ? null : owns[0]!.id,
        i % 2 === 0 ? availOk.id : availNc.id,
        `2024-01-${10 + i}`,
      );
      const b = args.length - 11;
      values.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, ` +
          `$${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}::date)`,
      );
    }
    await queryRows(
      `insert into barriers
        (external_code, tag, location_id, typology_id, loc_desc_id,
         criticality_id, category_id, grouping_id, owner_id,
         availability_id, status_since)
       values ${values.join(", ")}`,
      args,
    );
    for (const sortCol of [...Object.keys(SORTABLE), "bogus"]) {
      for (const sortDir of ["asc", "desc"] as const) {
        const q = { query: KST_TAG, sortCol, sortDir };
        const off: number[] = [];
        for (let at = 0;; at += 5) {
          const rows = await listBarrierWindow(q, 5, at);
          if (rows.length === 0) break;
          off.push(...rows.map((r) => r.id));
          if (rows.length < 5) break;
        }
        const key: number[] = [];
        let cursor: WindowCursor | null = null;
        for (;;) {
          const page = await listBarrierWindowAfter(q, 5, cursor);
          if (page.rows.length === 0) break;
          key.push(...page.rows.map((r) => r.id));
          cursor = page.cursor;
          if (page.rows.length < 5) break;
        }
        assertEquals(key, off, `${sortCol}/${sortDir}`);
        assertStrictEquals(key.length, 12, `${sortCol}/${sortDir} count`);
      }
    }
  } finally {
    await cleanup();
  }
});
