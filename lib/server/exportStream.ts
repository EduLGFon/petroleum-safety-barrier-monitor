// Export byte streaming - turns a batch of rows into a ReadableStream.
// This is why it exists: CSV, .xls and the print report all need the same
// skeleton (static head, row chunks, static tail) but render rows
// differently. Keeping that skeleton here means the head can still adapt to
// the first batch (column widths), the tail can carry the summary, and no
// format has to buffer the whole export to emit it.
import type { Barrier } from "../types.ts";

export interface RowStreamPlan {
  // Static chunks before the rows, computed from the first batch so the
  // header can adapt to real data (column widths, row count). May be async.
  head?: (first: Barrier[]) => string[] | Promise<string[]>;
  // Rows of one batch plus its offset in the whole export; sheet breaks and
  // zebra striping both need that offset.
  render: (batch: Barrier[], offset: number) => string;
  // Static chunks after the last row (summaries, closing markup).
  tail?: () => string[] | Promise<string[]>;
}

// textStream: head (from the first batch), then one chunk per batch, then the
// tail, encoded as UTF-8. The consumer's pull() drives the generator, so
// back-pressure reaches the database: rows are only fetched when the socket
// asks for the next chunk. A cancelled stream closes the generator.
export function textStream(
  batches: AsyncIterable<Barrier[]>,
  plan: RowStreamPlan,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iter = batches[Symbol.asyncIterator]();
  let started = false;
  let offset = 0;
  let closed = false;

  const enqueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    chunks: string[],
  ) => {
    for (const chunk of chunks) {
      if (chunk) controller.enqueue(encoder.encode(chunk));
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      // First pull: the head needs the first batch, so the file starts with
      // real data (and the empty scope still gets a head plus a tail).
      if (!started) {
        started = true;
        const first = await iter.next();
        const batch = first.done ? [] : first.value;
        enqueue(
          controller,
          plan.head ? await plan.head(batch) : [],
        );
        if (first.done) {
          closed = true;
          enqueue(controller, plan.tail ? await plan.tail() : []);
          controller.close();
          return;
        }
        offset = batch.length;
        controller.enqueue(encoder.encode(plan.render(batch, 0)));
        return;
      }
      const next = await iter.next();
      if (next.done) {
        closed = true;
        enqueue(controller, plan.tail ? await plan.tail() : []);
        controller.close();
        return;
      }
      const at = offset;
      offset += next.value.length;
      controller.enqueue(encoder.encode(plan.render(next.value, at)));
    },
    // Client hung up mid-export: let the generator release its iterator.
    async cancel() {
      closed = true;
      await iter.return?.(undefined);
    },
  });
}
