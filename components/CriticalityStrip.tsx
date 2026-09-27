// Criticality rank strip - compact per-rank barrier counts below the KPI cards.
// This is why it exists: the ranked ESO > A > B > C > D model needs one
// glanceable totals readout; the snapshot already carries dynamic
// byCriticality buckets, so this only orders (canonical ranks first, novel
// labels after by volume) and paints each chip with its rank color.
import { critColorFor } from "../lib/constants.ts";

import { fmt } from "../lib/utils.ts";

// Canonical rank order; anything unknown sorts after by count so future
// ranks never hide or break the strip.
const RANK_ORDER = ["ESO", "A", "B", "C", "D"];

// orderRankEntries: canonical ranks first, novel labels after by volume.
// Pure (no DOM) so the ordering contract is unit-testable.
export function orderRankEntries(
  entries: Array<[string, number]>,
): Array<[string, number]> {
  const rank = (label: string): number => {
    const known = RANK_ORDER.indexOf(label);
    return known === -1 ? RANK_ORDER.length : known;
  };
  return [...entries].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
}

export function CriticalityStrip(
  { byCriticality }: { byCriticality?: Record<string, number> },
) {
  const entries = orderRankEntries(
    Object.entries(byCriticality ?? {}).filter(([, n]) => n > 0),
  );
  if (entries.length === 0) return null;
  return (
    <div
      aria-label="Barreiras por criticidade"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: "var(--d-section)",
      }}
    >
      {entries.map(([label, n]) => {
        const c = critColorFor(label);
        return (
          <span
            key={label}
            title={`${fmt(n)} barreiras de criticidade ${label}`}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: c.solid,
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 99,
              padding: "3px 12px",
              whiteSpace: "nowrap",
            }}
          >
            {label} · {fmt(n)}
          </span>
        );
      })}
    </div>
  );
}
