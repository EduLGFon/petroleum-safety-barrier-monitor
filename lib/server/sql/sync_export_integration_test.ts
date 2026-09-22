// Fixture -> upsert -> GET-layer + export assertions (P4 acceptance).
// Needs a real Postgres: skipped with a log line when DATABASE_URL is unset
// so `deno task test` stays green without a database. When set, it inserts
// two uniquely-coded rows, reads them back through the same functions the
// routes call, checks the export totals, then removes its own rows.
import { streamExportCsv, streamToText } from "../exportCsv.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import { getKpi, listBarriers } from "./barriers.ts";

import { resolveBarriers } from "../../resolve.ts";

import { runSync } from "../fracttal/sync.ts";

import { defaultSyncIo } from "./sync.ts";

import { getChartData } from "./chart.ts";

import { queryRows } from "../db.ts";

async function cleanup(scope: string): Promise<void> {
  await queryRows(
    `delete from barrier_status_history
     where barrier_id in (select id from barriers where external_code like 'P4T-%')`,
  );
  await queryRows(`delete from barriers where external_code like 'P4T-%'`);
  await queryRows(`delete from sync_state where scope = $1`, [scope]);
}

Deno.test("fixture rows land, read back, export totals match", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const scope = `p4test:${Date.now()}`;
  // Real lookup labels so the raw rows map instead of skip (live-shaped:
  // category in groups_description, polo ignored in groups_1).
  const locs = await queryRows<{ code: string }>(
    "select code from locations order by code limit 2",
  );
  const cats = await queryRows<{ label: string }>(
    "select label from categories limit 1",
  );
  const crits = await queryRows<{ label: string }>(
    "select label from criticality_levels limit 1",
  );
  assertStrictEquals(locs.length > 0 && cats.length > 0, true);
  const raw = (n: number, code: string, available: boolean) => ({
    id: 910000 + n,
    code,
    id_type_item: 2,
    location_code: locs[0]!.code,
    groups_description: cats[0]!.label,
    groups_1_description: "Polo Cricaré",
    priorities_description: crits[0]!.label,
    available,
  });

  await cleanup(scope);
  // Reconcile retires scoped-absent locals: on a populated DB those are real
  // barriers sharing the fixture's location, so the test restores every row
  // its own plan deleted (proves the drill retires zero rows net).
  let retiredIds: number[] = [];
  try {
    const result = await runSync(
      () =>
        Promise.resolve([
          raw(1, "P4T-EQ-001", true),
          raw(2, "P4T-EQ-002", false),
        ]),
      { scope, dryRun: false, io: defaultSyncIo },
    );
    retiredIds = result.plan.entries.flatMap((e) =>
      e.kind === "delete" ? [e.local.id] : []
    );
    assertStrictEquals(result.plan.counts.inserts, 2);

    const list = await listBarriers({ query: "P4T-EQ", page: 1, pageSize: 25 });
    assertStrictEquals(list.total, 2);
    assertStrictEquals(list.items.length, 2);

    const kpi = await getKpi(undefined);
    assertStrictEquals(typeof kpi.total, "number");
    assertStrictEquals(kpi.total >= 2, true);

    const chart = await getChartData(undefined);
    assertStrictEquals(Array.isArray(chart), true);

    const csv = await streamToText(
      streamExportCsv(resolveBarriers(list.items)),
    );
    const lines = csv.split("\r\n");
    const resumoIdx = lines.indexOf("RESUMO");
    assertStrictEquals(resumoIdx, 4); // header + 2 data rows + blank
    const totalLine = lines.slice(resumoIdx).find((l: string) =>
      l.includes("Total")
    );
    assertStrictEquals(totalLine?.includes('"2"'), true);
  } finally {
    if (retiredIds.length > 0) {
      await queryRows(
        `update barriers set deleted_at = null where id = any($1)`,
        [retiredIds],
      );
    }
    await cleanup(scope);
  }
});

Deno.test("station moves reconcile as updates, not delete+insert", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const scope = `p4test-move:${Date.now()}`;
  const locs = await queryRows<{ code: string }>(
    "select code from locations order by code limit 2",
  );
  const cats = await queryRows<{ label: string }>(
    "select label from categories limit 1",
  );
  const crits = await queryRows<{ label: string }>(
    "select label from criticality_levels limit 1",
  );
  if (locs.length < 2 || cats.length === 0) {
    console.log("skip: need two stations and one category");
    return;
  }
  const rawAt = (code: string, loc: string) => ({
    id: 920000,
    code,
    id_type_item: 2,
    location_code: loc,
    groups_description: cats[0]!.label,
    groups_1_description: "Polo Cricaré",
    priorities_description: crits[0]!.label,
    available: true,
  });

  await cleanup(scope);
  // Reconcile retires scoped-absent locals on both runs; every retired row
  // is restored below so the drill retires zero rows net.
  const retiredIds: number[] = [];
  const retire = (entries: Array<{ kind: string; local?: { id: number } }>) => {
    for (const e of entries) {
      if (e.kind === "delete" && e.local) retiredIds.push(e.local.id);
    }
  };
  try {
    const first = await runSync(
      () => Promise.resolve([rawAt("P4T-MOVE-001", locs[0]!.code)]),
      { scope, dryRun: false, io: defaultSyncIo },
    );
    retire(first.plan.entries);
    assertStrictEquals(first.plan.counts.inserts, 1);

    // Same asset, other station: the code arm of loadLocal must match it so
    // the plan updates instead of deleting the old row and stillbirthing
    // the "insert" on the UNIQUE constraint.
    const second = await runSync(
      () => Promise.resolve([rawAt("P4T-MOVE-001", locs[1]!.code)]),
      { scope, dryRun: false, io: defaultSyncIo },
    );
    retire(second.plan.entries);
    const moved = second.plan.entries.filter((e) =>
      e.kind === "update" && e.input.externalCode === "P4T-MOVE-001"
    );
    const reborn = second.plan.entries.filter((e) =>
      e.kind === "insert" && e.input.externalCode === "P4T-MOVE-001"
    );
    const killed = second.plan.entries.filter((e) =>
      e.kind === "delete" && e.local.externalCode === "P4T-MOVE-001"
    );
    assertStrictEquals(moved.length, 1);
    assertStrictEquals(reborn.length, 0);
    assertStrictEquals(killed.length, 0);

    const row = await queryRows<
      { location_id: number; deleted_at: string | null }
    >(
      `select location_id, deleted_at from barriers where external_code = $1`,
      ["P4T-MOVE-001"],
    );
    assertStrictEquals(row.length, 1);
    const locB = await queryRows<{ id: number }>(
      `select id from locations where code = $1`,
      [locs[1]!.code],
    );
    assertStrictEquals(row[0]!.location_id, locB[0]!.id);
    assertStrictEquals(row[0]!.deleted_at, null);
  } finally {
    if (retiredIds.length > 0) {
      await queryRows(
        `update barriers set deleted_at = null where id = any($1)`,
        [retiredIds],
      );
    }
    await cleanup(scope);
  }
});
