// Fracttal fixture anonymizer - redacts tenant-identifying data.
// This is why it exists: fixtures are committed to the repo and replayed for
// P3 tests, so any free-text field that may carry visible names/labels is
// nulled before a capture lands on disk. Structural fields that drive the
// mapping (types, groups, priorities, availability) survive; a wide raw
// capture would add private field redaction here before it is committed.
import type { FracttalAsset } from "./types.ts";

// FREE_TEXT_KEYS: brief free text that may embed asset names/people labels.
const FREE_TEXT_KEYS = new Set<string>([
  "description",
  "parent_description",
]);

// ALLOWLIST: the only keys that may survive into a committed fixture.
// Anything upstream adds (new free-text columns, tenant notes) is dropped
// by default instead of leaking into the repo; extend this list deliberately
// when the mapping starts consuming a new field.
const ALLOWLIST = new Set<string>([
  "id",
  "code",
  "active",
  "available",
  "id_type_item",
  "description",
  "location_code",
  "id_parent",
  "items_types_description",
  "groups_description",
  "groups_1_description",
  "groups_2_description",
  "priorities_description",
  "parent_description",
  "units_description",
  "is_serial_control",
  "initial_date_out_of_service",
  "last_final_date_available",
  "field_1",
  "field_2",
  "field_3",
  "field_4",
  "field_5",
  "field_6",
  "notes",
  "id_group_task",
  "groups_tasks_description",
]);

// anonymizeAsset: allowlist-copies the structural mapping envelope, nulls
// free text, and rewrites codes to "anon-<suffix>" so they stay stable per
// capture without leaking tenant codes. Unknown keys are dropped.
export function anonymizeAsset(asset: FracttalAsset): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(asset)) {
    if (!ALLOWLIST.has(key)) continue;
    if (FREE_TEXT_KEYS.has(key)) {
      out[key] = null;
      continue;
    }
    if (key === "code") {
      const suffix = String(value).split("-").at(-1) ?? String(value);
      out[key] = `anon-${suffix}`;
      continue;
    }
    out[key] = value;
  }
  return out;
}
