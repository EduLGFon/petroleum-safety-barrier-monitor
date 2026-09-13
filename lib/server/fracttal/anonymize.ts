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

// anonymizeAsset: nulls free text, keeps the structural mapping envelope and
// rewrites codes to "anon-<suffix>" so they stay stable per capture without
// leaking tenant codes.
export function anonymizeAsset(asset: FracttalAsset): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(asset)) {
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
