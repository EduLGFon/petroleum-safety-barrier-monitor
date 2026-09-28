// Criticality rank ordering - canonical ESO > A > B > C > D first,
// novel labels after by volume.
// This is why it exists: KPI rank cards (and any future rank readout)
// share one ordering policy, so new criticality values never hide or break
// the layout.
import { isCriticalRankLabel } from "../enums/codes.ts";

// Canonical rank order; anything unknown sorts after by count so future
// ranks never hide or break the readout.
export const RANK_ORDER = ["ESO", "A", "B", "C", "D"];

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

// splitRankGroups: partitions rank entries into critical (ESO/A per
// isCriticalRankLabel) vs the rest, each side canonically ordered. Novel
// ranks always land in other so they never vanish from the cards.
export function splitRankGroups(
  entries: Array<[string, number]>,
): {
  critical: Array<[string, number]>;
  other: Array<[string, number]>;
} {
  return {
    critical: orderRankEntries(
      entries.filter(([label]) => isCriticalRankLabel(label)),
    ),
    other: orderRankEntries(
      entries.filter(([label]) => !isCriticalRankLabel(label)),
    ),
  };
}
