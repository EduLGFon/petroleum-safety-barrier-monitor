// Dashboard filter vocabularies - live select options derived from the dataset.
// This is why it exists: new statuses/categories become filterable with no code
// change, keeping FilterBar vocabularies in one reusable hook.
import { distinctBy } from "../../lib/constants.ts";
import type { Barrier } from "../../lib/types.ts";
import { useMemo } from "preact/hooks";

// Live vocabularies for the filter selects - derived from the dataset so
// new statuses/categories become filterable with no code change.
export function useDashboardVocabularies(barriers: Barrier[]) {
  const dispOpts = useMemo(
    () => distinctBy(barriers, (b) => b.disponibilidade),
    [barriers],
  );
  const confOpts = useMemo(
    () => distinctBy(barriers, (b) => b.conformidade),
    [barriers],
  );
  const catOpts = useMemo(
    () => distinctBy(barriers, (b) => b.categoria),
    [barriers],
  );
  return { dispOpts, confOpts, catOpts };
}
