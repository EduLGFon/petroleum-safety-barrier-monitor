// Dump sync anomalies - one-off diagnostics, live read-only (never writes).
// Replays the poller's exact fetch path (full equipment sweep + open work
// sweep + windowed requests), then parse -> map with the real DB catalog
// context, and writes every anomalous asset to docs/SYNC-ANOMALIES.md:
// work-malformed rows, item-malformed rows, mapping skips, mapping warnings.
// Dry-run forever: no sync_state rows, no writes, only GETs + catalog reads.
import { buildWorkEvents, resolverFor } from "../lib/server/fracttal/work.ts";
import { fetchItemSignals } from "../lib/server/fracttal/live-scope.ts";
import {
  OPEN_WORK_ORDER_STATUSES,
} from "../lib/server/fracttal/barrier-rules.ts";
import { createFracttalClient } from "../lib/server/fracttal/client.ts";
import { mapAsset } from "../lib/server/fracttal/map.ts";
import { parsePage } from "../lib/server/fracttal/client.ts";
import type { FracttalAsset } from "../lib/server/fracttal/types.ts";
import { loadSyncConfig } from "../lib/server/config.ts";
import { defaultSyncIo } from "../lib/server/sql/sync.ts";

const OUT = "docs/SYNC-ANOMALIES.md";
const PAGE = 100;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return s.replaceAll("|", "\\|").replaceAll("\n", " ").slice(0, 120);
}

function assetColumns(a: FracttalAsset): string {
  return [
    cell(a.code),
    cell(a.description),
    cell(a.parent_description),
    cell(a.location_code),
    cell(a.groups_description),
    cell(a.groups_2_description),
    cell(a.priorities_description),
  ].join(" | ");
}

async function main(): Promise<void> {
  const { key, secret } = loadSyncConfig(undefined, { itemType: 2 });
  const client = createFracttalClient({
    baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ??
      "https://app.fracttal.com/api",
    credentials: { key, secret },
    ratePerMin: 150,
  });

  console.log("[dump] fetching work orders (open sweep)...");
  const orderRows: unknown[] = [];
  for (const otStatus of OPEN_WORK_ORDER_STATUSES) {
    let start = 0;
    for (let p = 0; p < 200; p++) {
      const page = await client.listRawWorkOrders({
        limit: PAGE,
        start,
        otStatus,
      });
      orderRows.push(...page.rows);
      if (page.rows.length < PAGE || orderRows.length >= page.total) break;
      start += PAGE;
    }
    console.log(
      `[dump] ot_status=${otStatus} cumulative orders=${orderRows.length}`,
    );
  }
  console.log("[dump] fetching work requests (5 newest pages)...");
  const requestRows: unknown[] = [];
  for (let p = 0; p < 5; p++) {
    const page = await client.listRawWorkRequests({
      limit: PAGE,
      start: p * PAGE,
    });
    requestRows.push(...page.rows);
    if (page.rows.length < PAGE || requestRows.length >= page.total) break;
  }

  const built = buildWorkEvents(orderRows, requestRows);
  console.log(
    `[dump] work: ${orderRows.length} orders, ${requestRows.length} requests, malformed=${built.malformed.length}`,
  );

  console.log("[dump] fetching items (full sweep)...");
  const items = await fetchItemSignals(client, {
    itemType: 2,
    maxPages: 200,
    concurrency: 4,
  });
  console.log(
    `[dump] items: ${items.itemRows.length} rows (${items.pagesFetched} pages, total=${items.itemTotal})`,
  );

  const parsed = parsePage({ data: items.itemRows });
  const ctx = await defaultSyncIo.buildMapContext();
  const resolver = resolverFor(built.events);
  const skips: Array<{ code: string; reason: string; asset: FracttalAsset }> =
    [];
  const warnings: Array<
    { code: string; warning: string; asset: FracttalAsset }
  > = [];
  for (const item of parsed.items) {
    const mapped = mapAsset(item, ctx, { work: resolver(item.code) });
    if (mapped.ok) {
      for (const w of mapped.warnings) {
        warnings.push({ code: item.code, warning: w, asset: item });
      }
    } else {
      skips.push({ code: item.code, reason: mapped.reason, asset: item });
    }
  }

  const hist = (xs: string[]): string =>
    Object.entries(Object.groupBy(xs, (x) => x))
      .map(([k, v]) => `- \`${k}\` × ${(v ?? []).length}`)
      .join("\n");

  const now = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Sync anomalies dump (${now})`);
  lines.push(``);
  lines.push(
    `Live read-only replay of the poller path: full equipment sweep + open work sweep + 5 newest request pages, mapped against the current DB catalog.`,
  );
  lines.push(``);
  lines.push(`| stage | count |`);
  lines.push(`| --- | --- |`);
  lines.push(`| work orders fetched | ${orderRows.length} |`);
  lines.push(`| work requests fetched | ${requestRows.length} |`);
  lines.push(`| **work malformed** | **${built.malformed.length}** |`);
  lines.push(
    `| items fetched | ${items.itemRows.length} (total=${items.itemTotal}, pages=${items.pagesFetched}) |`,
  );
  lines.push(`| **item malformed** | **${parsed.malformed.length}** |`);
  lines.push(`| parsed items | ${parsed.items.length} |`);
  lines.push(`| **mapping skips** | **${skips.length}** |`);
  lines.push(`| **mapping warnings** | **${warnings.length}** |`);
  lines.push(``);
  lines.push(`## Work-malformed reason histogram`);
  lines.push(
    hist(
      built.malformed.map((m) =>
        `${m.index < orderRows.length ? "orders" : "requests"}: ${m.reason}`
      ),
    ) || `- none`,
  );
  lines.push(``);
  lines.push(`## Work-malformed rows (${built.malformed.length})`);
  lines.push(
    `| # | side | index | reason | code/code_item | wo_folio | description |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  built.malformed.forEach((m, n) => {
    const side = m.index < orderRows.length ? "orders" : "requests";
    const raw = (side === "orders"
      ? orderRows[m.index]
      : requestRows[m.index - orderRows.length]) as Record<string, unknown>;
    lines.push(
      `| ${n + 1} | ${side} | ${m.index} | ${cell(m.reason)} | ${
        cell(raw?.code ?? raw?.code_item)
      } | ${cell(raw?.wo_folio)} | ${cell(raw?.description)} |`,
    );
  });
  lines.push(``);
  lines.push(`<details><summary>Raw JSON of work-malformed rows</summary>`);
  lines.push(``);
  lines.push("```json");
  lines.push(JSON.stringify(
    built.malformed.map((m) => {
      const side = m.index < orderRows.length ? "orders" : "requests";
      return {
        side,
        index: m.index,
        reason: m.reason,
        row: side === "orders"
          ? orderRows[m.index]
          : requestRows[m.index - orderRows.length],
      };
    }),
    null,
    2,
  ));
  lines.push("```");
  lines.push(`</details>`);
  lines.push(``);
  lines.push(`## Item-malformed rows (${parsed.malformed.length})`);
  lines.push(hist(parsed.malformed.map((m) => m.reason)) || `- none`);
  lines.push(``);
  lines.push(`## Mapping skips (${skips.length})`);
  lines.push(hist(skips.map((s) => s.reason)) || `- none`);
  lines.push(``);
  lines.push(
    `| code | reason | description | parent_description | location_code | groups | groups_2 | priorities |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const s of skips) {
    lines.push(
      `| ${cell(s.code)} | ${cell(s.reason)} | ${assetColumns(s.asset)} |`,
    );
  }
  lines.push(``);
  lines.push(`<details><summary>Raw JSON of skipped assets</summary>`);
  lines.push(``);
  lines.push("```json");
  lines.push(
    JSON.stringify(
      skips.map((s) => ({ code: s.code, reason: s.reason, asset: s.asset })),
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push(`</details>`);
  lines.push(``);
  lines.push(`## Mapping warnings (${warnings.length})`);
  lines.push(hist(warnings.map((w) => w.warning)) || `- none`);
  lines.push(``);
  lines.push(
    `| code | warning | description | parent_description | location_code | groups | groups_2 | priorities |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const w of warnings) {
    lines.push(
      `| ${cell(w.code)} | ${cell(w.warning)} | ${assetColumns(w.asset)} |`,
    );
  }
  await Deno.writeTextFile(OUT, lines.join("\n") + "\n");
  console.log(
    `[dump] wrote ${OUT} (skips=${skips.length} warnings=${warnings.length} workMalformed=${built.malformed.length} itemMalformed=${parsed.malformed.length})`,
  );
}

if (import.meta.main) await main();
