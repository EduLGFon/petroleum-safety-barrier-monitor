// Export batches - the shape every export builder consumes.
// Why it exists: the CSV, .xlsx and print-report builders all take an async
// iterable of row batches so a streaming export never holds the whole
// selection; the server feeds it database pages and the browser feeds it
// slices of the in-memory list. Splitting the rows in one place keeps both
// callers (and the tests) on the same contract.
import type { Barrier } from "../types.ts";

// batchesOf: yields the rows in slices of `size`, the way the database pages
// them. One batch in flight at a time: the consumer decides when the next
// slice is produced.
export function batchesOf(
  barriers: Barrier[],
  size = 500,
): AsyncIterable<Barrier[]> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let at = 0; at < barriers.length; at += size) {
        yield barriers.slice(at, at + size);
      }
    },
  };
}
