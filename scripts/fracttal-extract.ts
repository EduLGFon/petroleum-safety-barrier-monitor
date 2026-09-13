// Fracttal read-only extractor - tiny prod-safe sample for the dashboard feed.
// Why it exists: operators need a quick read-only peek at live Fracttal data
// (all item types, small sample) to feed or reconcile the dashboard, without
// touching the full sync pipeline or Postgres. It only GETs /items (plus the
// unavoidable OAuth token POST inside the shared client), prints dashboard
// useful fields as JSON to stdout, and never writes files, DB rows, or upstream.
import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import { ITEM_TYPE_LABELS } from "../lib/server/fracttal/itemType.ts";

import { loadSyncConfig } from "../lib/server/config.ts";

const DEFAULT_LIMIT_PER_TYPE = 10;
const MAX_LIMIT_PER_TYPE = 25;
const SAMPLED_TYPES: ItemTypeValue[] = [1, 2, 3, 4, 5];

interface ExtractFlags {
  limitPerType: number;
  locationCode?: string;
  baseUrl?: string;
}

// parseFlags: CLI only, env stays in loadSyncConfig so creds never come from argv.
function parseFlags(argv: string[]): ExtractFlags {
  const flags: ExtractFlags = { limitPerType: DEFAULT_LIMIT_PER_TYPE };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit-per-type") {
      const n = Math.floor(Number(argv[++i]) || DEFAULT_LIMIT_PER_TYPE);
      flags.limitPerType = Math.min(MAX_LIMIT_PER_TYPE, Math.max(1, n));
    } else if (arg === "--location-code") flags.locationCode = argv[++i];
    else if (arg === "--base-url") flags.baseUrl = argv[++i];
    else if (arg === "--help") {
      console.error(
        "Usage: fracttal-extract.ts [--limit-per-type N<=25] [--location-code X] [--base-url U]",
      );
      Deno.exit(0);
    }
  }
  return flags;
}

type SlimRow = Record<string, string | number | boolean | null>;

// slimRow: keep only fields the dashboard mapping consumes (docs/FRACTTAL.md).
// Unknown/missing fields become null so upstream drift stays visible.
function slimRow(raw: unknown): SlimRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.code !== "string" || row.code === "") return null;
  const str = (k: string) => (typeof row[k] === "string" ? row[k] : null);
  const bool = (k: string) => (typeof row[k] === "boolean" ? row[k] : null);
  const num = (k: string) => (typeof row[k] === "number" ? row[k] : null);
  return {
    code: row.code,
    id: num("id"),
    id_type_item: num("id_type_item"),
    description: str("description"),
    location_code: str("location_code"),
    active: bool("active"),
    available: bool("available"),
    groups_description: str("groups_description"),
    groups_1_description: str("groups_1_description"),
    groups_2_description: str("groups_2_description"),
    priorities_description: str("priorities_description"),
    parent_description: str("parent_description"),
    units_description: str("units_description"),
    initial_date_out_of_service: str("initial_date_out_of_service"),
    last_final_date_available: str("last_final_date_available"),
  };
}

// bump: count occurrences for the census block feeding enum mapping review.
function bump(map: Record<string, number>, key: unknown): void {
  const label = typeof key === "string" && key !== "" ? key : "<none>";
  map[label] = (map[label] ?? 0) + 1;
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  let cfg;
  try {
    // Restricted env getter: this script samples all item types itself, so
    // it must not demand FRACTTAL_SYNC_ITEM_TYPE in --allow-env (least
    // privilege on the prod command line; the default item type is unused).
    const getEnv = (name: string): string | undefined =>
      name === "FRACTTAL_SYNC_ITEM_TYPE" ? undefined : Deno.env.get(name);
    cfg = loadSyncConfig(getEnv, { baseUrl: flags.baseUrl });
  } catch (err) {
    console.error(
      `[fracttal-extract] ${err instanceof Error ? err.message : err}`,
    );
    Deno.exit(2);
  }
  const client = createFracttalClient({
    baseUrl: cfg.baseUrl,
    credentials: { key: cfg.key, secret: cfg.secret },
  });

  const items: SlimRow[] = [];
  const perType: Array<
    { itemType: number; label: string; returned: number; total: number }
  > = [];
  const census = {
    byCategory: {} as Record<string, number>,
    byCriticality: {} as Record<string, number>,
    byLocation: {} as Record<string, number>,
    byAvailability: {} as Record<string, number>,
  };
  let skipped = 0;

  // Read-only fan-out: one bounded GET per item type, sequential to stay
  // far below the 200 req/min limit. No writes, no pagination beyond start=0.
  for (const itemType of SAMPLED_TYPES) {
    const { rows, total } = await client.listRawItems({
      itemType,
      locationCode: flags.locationCode,
      limit: flags.limitPerType,
      start: 0,
    });
    let kept = 0;
    for (const raw of rows) {
      const slim = slimRow(raw);
      if (!slim) {
        skipped++;
        continue;
      }
      items.push({ ...slim, _item_type_label: ITEM_TYPE_LABELS[itemType] });
      bump(census.byCategory, slim.groups_1_description);
      bump(census.byCriticality, slim.priorities_description);
      bump(census.byLocation, slim.location_code);
      bump(census.byAvailability, String(slim.available));
      kept++;
    }
    perType.push({
      itemType,
      label: ITEM_TYPE_LABELS[itemType],
      returned: kept,
      total,
    });
    console.error(
      `[fracttal-extract] type=${
        ITEM_TYPE_LABELS[itemType]
      } kept=${kept} total=${total}`,
    );
  }

  console.log(JSON.stringify(
    {
      meta: {
        fetchedAt: new Date().toISOString(),
        locationCode: flags.locationCode ?? null,
        limitPerType: flags.limitPerType,
        perType,
        returned: items.length,
        skipped,
        readOnly: true,
        anonymized: false,
        warning: "Live tenant codes - do not commit this output",
      },
      census,
      items,
    },
    null,
    2,
  ));
}

if (import.meta.main) {
  await main();
}
