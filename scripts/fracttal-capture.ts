// Fracttal capture script - bounded, anonymized fixture sampler (P2 spike).
// This is why it exists: the spike needs a realistic asset page set to review
// the field->enum mapping, but prod is off-limits to CI. The script runs only
// in a reviewed prod session with FRACTTAL_KEY/FRACTTAL_SECRET and writes an
// anonymized, small fixture to scripts/fixtures/. It never writes upstream.
//
// Safe-harbor guarantees (locked decisions):
//   - read-only client (asserts GET verbality);
//   - one location_code, default 1 page (max 100 items), capped at 10;
//   - anonymizeAsset() strips private/free-text fields before saving;
//   - tokens come from env, never from code or fixtures.
import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import { ITEM_TYPE_LABELS } from "../lib/server/fracttal/itemType.ts";

import { anonymizeAsset } from "../lib/server/fracttal/anonymize.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";

interface CaptureFlags {
  locationCode?: string;
  itemType: ItemTypeValue;
  pages: number;
  output: string;
  baseUrl: string;
}

function parseFlags(argv: string[]): CaptureFlags {
  const base: CaptureFlags = {
    itemType: 2,
    pages: 1,
    output: "scripts/fixtures/fracttal-assets-sample.json",
    baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ?? DEFAULT_BASE_URL,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--location-code") base.locationCode = argv[++i];
    else if (arg === "--pages") {
      base.pages = Math.min(10, Math.max(1, Number(argv[++i]) || 1));
    } else if (arg === "--item-type") {
      base.itemType = Number(argv[++i]) as ItemTypeValue;
    } else if (arg === "--output") base.output = argv[++i];
    else if (arg === "--base-url") base.baseUrl = argv[++i];
  }
  return base;
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  const key = Deno.env.get("FRACTTAL_KEY");
  const secret = Deno.env.get("FRACTTAL_SECRET");
  if (!key || !secret) {
    console.error(
      "[fracttal-capture] FRACTTAL_KEY/FRACTTAL_SECRET required (prod tenant, reviewed; never committed)",
    );
    Deno.exit(2);
  }
  if (!flags.locationCode) {
    console.error(
      "[fracttal-capture] --location-code <station> required (one station only)",
    );
    Deno.exit(2);
  }

  const client = createFracttalClient({
    baseUrl: flags.baseUrl,
    credentials: { key, secret },
  });

  const { items, report } = await client.collectAssets(
    {
      locationCode: flags.locationCode,
      itemType: flags.itemType,
      limit: 100,
    },
    flags.pages,
  );

  // Unmapped-value census: counts per free-form taxonomy label so the spike
  // note can list ids needing new enum rows, never guessing.
  const census: Record<string, Map<string, number>> = {};
  for (
    const key of [
      "groups_1_description",
      "groups_2_description",
      "priorities_description",
      "units_description",
    ] as const
  ) {
    const counts = new Map<string, number>();
    for (const item of items) {
      const label = item[key];
      if (label === null || label === "") continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    census[key] = counts;
  }

  const fixture = {
    meta: {
      baseUrl: flags.baseUrl,
      itemType: ITEM_TYPE_LABELS[flags.itemType],
      locationCode: "[redacted]",
      pagesCaptured: report.pagesFetched,
      rawTotal: report.rawTotal,
      collected: report.collected,
      capturedAt: new Date().toISOString(),
      anonymized: true,
    },
    census: Object.fromEntries(
      Object.entries(census).map(([k, m]) => [k, Object.fromEntries(m)]),
    ),
    items: items.map(anonymizeAsset),
  };

  await Deno.writeTextFile(
    flags.output,
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
  console.log(
    `[fracttal-capture] wrote ${report.collected} items (of ${report.rawTotal}) ` +
      `from item_type=${ITEM_TYPE_LABELS[flags.itemType]} to ${flags.output}`,
  );
  if (report.malformed) {
    console.warn(
      `[fracttal-capture] ${report.malformed.length} malformed rows skipped`,
    );
    console.warn(JSON.stringify(report.malformed, null, 2));
  }
}

if (import.meta.main) {
  await main();
}
