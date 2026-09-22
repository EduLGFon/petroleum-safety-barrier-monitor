// Fracttal station audit (read-only) - live stations vs DB catalog.
// This is why it exists: station codes drift upstream (renames, new fields,
// group tags in location_code) while the DB catalog only changes on import
// rebuilds. Before any --apply, this sweep reports per-station live-vs-DB
// counts plus every unknown station and unmapped category with sample
// codes, so the operator can tell "safe to apply" from "catalog triage
// first". It writes nothing: one equipment sweep plus DB reads only. Exit 1
// on red flags: a DB station with zero live rows (possible mass rename or
// removal), or unknown stations with barrier-scope rows (new station needing
// a catalog decision - the check order in mapAsset guarantees these passed
// the scope filter, so none is a false alarm). Bypass with a direct
// --apply once triaged; unmapped categories never block (row-level, listed).
//
//   deno run -A --env-file=.env scripts/fracttal-audit-stations.ts [--json]
//   [--pages N] [--item-type 2] [--rate-per-min 150] [--fetch-concurrency 4]
import { fetchItemSignals } from "../lib/server/fracttal/live-scope.ts";

import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import { parsePage } from "../lib/server/fracttal/client.ts";

import { defaultSyncIo } from "../lib/server/sql/sync.ts";

import { loadSyncConfig } from "../lib/server/config.ts";

import { mapAsset } from "../lib/server/fracttal/map.ts";

import { queryRows } from "../lib/server/db.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";

interface AuditFlags {
  itemType: ItemTypeValue;
  pages: number;
  ratePerMin: number;
  concurrency: number;
  json: boolean;
}

function parseFlags(argv: string[]): AuditFlags {
  const flags: AuditFlags = {
    itemType: 2,
    pages: 200,
    ratePerMin: 150,
    concurrency: 4,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--item-type") {
      flags.itemType = Number(argv[++i]) as ItemTypeValue;
    } else if (arg === "--pages") {
      flags.pages = Math.min(400, Math.max(1, Number(argv[++i]) || 200));
    } else if (arg === "--rate-per-min") {
      flags.ratePerMin = Math.max(1, Number(argv[++i]) || 150);
    } else if (arg === "--fetch-concurrency") {
      flags.concurrency = Math.max(1, Number(argv[++i]) || 4);
    } else if (arg === "--json") flags.json = true;
  }
  return flags;
}

interface StationRow {
  code: string;
  db: number;
  live: number;
}

// stationLabelOf extracts the reported label from a mapping skip reason
// (formats owned by map.ts: "unknown station 'X'", "unmapped category 'Y'").
function skipLabel(reason: string, prefix: string): string | null {
  if (!reason.startsWith(prefix)) return null;
  const match = reason.slice(prefix.length).match(/^'(.+)'$/);
  return match ? match[1]! : null;
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  const { key, secret, baseUrl, itemType } = loadSyncConfig(
    undefined,
    {
      baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ?? DEFAULT_BASE_URL,
      itemType: flags.itemType,
    },
  );
  const client = createFracttalClient({
    baseUrl,
    credentials: { key, secret },
    ratePerMin: flags.ratePerMin,
  });
  const fetched = await fetchItemSignals(client, {
    itemType: itemType as ItemTypeValue,
    maxPages: flags.pages,
    concurrency: flags.concurrency,
  });
  console.log(
    `[fracttal-audit] sweep: ${fetched.itemRows.length} rows ` +
      `(of ${fetched.itemTotal}, ${fetched.pagesFetched} pages)`,
  );

  const ctx = await defaultSyncIo.buildMapContext();
  const locations = await queryRows<{ id: number; code: string }>(
    `select id, code from locations order by code`,
  );
  const dbCounts = await queryRows<{ code: string; n: number }>(
    `select l.code as code, count(b.id)::int as n
     from barriers b join locations l on l.id = b.location_id
     where b.deleted_at is null group by l.code`,
  );
  const dbByCode = Object.fromEntries(dbCounts.map((r) => [r.code, r.n]));

  const parsed = parsePage({ data: fetched.itemRows });
  const liveById = new Map<number, number>();
  const unknownStations = new Map<string, { n: number; samples: string[] }>();
  const unmappedCategories = new Map<
    string,
    { n: number; samples: string[] }
  >();
  const tally = (
    table: Map<string, { n: number; samples: string[] }>,
    label: string,
    code: string,
  ): void => {
    const entry = table.get(label) ?? { n: 0, samples: [] };
    entry.n++;
    if (entry.samples.length < 5) entry.samples.push(code);
    table.set(label, entry);
  };
  let scopeSkips = 0;
  for (const item of parsed.items) {
    const mapped = mapAsset(item, ctx, {});
    if (mapped.ok) {
      liveById.set(
        mapped.input.locationId,
        (liveById.get(mapped.input.locationId) ?? 0) + 1,
      );
      continue;
    }
    const station = skipLabel(mapped.reason, "unknown station ");
    if (station !== null) {
      tally(unknownStations, station, item.code);
      continue;
    }
    const category = skipLabel(mapped.reason, "unmapped category ");
    if (category !== null) {
      tally(unmappedCategories, category, item.code);
      continue;
    }
    scopeSkips++;
  }

  const rows: StationRow[] = locations.map((l) => ({
    code: l.code,
    db: dbByCode[l.code] ?? 0,
    live: liveById.get(l.id) ?? 0,
  }));
  const emptyLive = rows.filter((r) => r.db > 0 && r.live === 0);
  const redFlags = [
    ...emptyLive.map((r) => `empty-live:${r.code}`),
    ...[...unknownStations.keys()].map((label) => `unknown-station:${label}`),
  ];
  const report = {
    scope: "audit:stations",
    fetchedAt: new Date().toISOString(),
    itemTotal: fetched.itemTotal,
    parsed: parsed.items.length,
    malformed: parsed.malformed.length,
    mapped: [...liveById.values()].reduce((a, b) => a + b, 0),
    scopeSkips,
    stations: rows,
    unknownStations: [...unknownStations.entries()].map(([label, e]) => ({
      label,
      count: e.n,
      samples: e.samples,
    })),
    unmappedCategories: [...unmappedCategories.entries()].map(
      ([label, e]) => ({ label, count: e.n, samples: e.samples }),
    ),
    redFlags,
  };
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`CODE                              DB   LIVE  DELTA`);
    for (const r of rows) {
      const delta = r.live - r.db;
      const flag = r.db > 0 && r.live === 0
        ? "  <-- EMPTY LIVE (investigate)"
        : "";
      console.log(
        `${r.code.padEnd(32)} ${String(r.db).padStart(5)} ${
          String(r.live).padStart(5)
        } ${String(delta).padStart(6)}${flag}`,
      );
    }
    console.log(
      `[fracttal-audit] parsed=${report.parsed} malformed=${report.malformed} ` +
        `mapped=${report.mapped} scopeSkips=${scopeSkips}`,
    );
    for (const [label, e] of unknownStations) {
      console.warn(
        `[fracttal-audit] unknown station '${label}' (${e.n} BARRIER rows, e.g. ${
          e.samples.join(",")
        }) <-- triage before applying`,
      );
    }
    for (const [label, e] of unmappedCategories) {
      console.warn(
        `[fracttal-audit] unmapped category '${label}' (${e.n} rows, e.g. ${
          e.samples.join(",")
        })`,
      );
    }
  }
  if (redFlags.length > 0) {
    console.error(
      `[fracttal-audit] HOLD (${redFlags.length}): ` + redFlags.join(", "),
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
