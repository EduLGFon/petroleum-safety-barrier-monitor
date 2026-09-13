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
  // Real lookup labels so the raw rows map instead of skip.
  const locs = await queryRows<{ code: string }>(
    "select code from locations limit 1",
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
    groups_1_description: cats[0]!.label,
    priorities_description: crits[0]!.label,
    available,
  });

  await cleanup(scope);
  try {
    const result = await runSync(
      () =>
        Promise.resolve([
          raw(1, "P4T-EQ-001", true),
          raw(2, "P4T-EQ-002", false),
        ]),
      { scope, dryRun: false, io: defaultSyncIo },
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
    await cleanup(scope);
  }
});
