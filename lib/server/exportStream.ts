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

// closeSource: closes the row source so the database cursor is released.
// A failing cleanup must never mask the error that caused it.
async function closeSource<T>(iter: AsyncIterator<T>): Promise<void> {
  try {
    await iter.return?.(undefined);
  } catch {
    // Ignore cleanup failures; the source error is what matters.
  }
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
  // The client can hang up while a pull is in flight (the database is still
  // answering). The cancel flag is what keeps the two apart: after it is
  // set, no chunk is enqueued and no close is attempted, so the late pull
  // cannot write to a cancelled controller and throw.
  let cancelled = false;

  const enqueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    chunks: string[],
  ) => {
    for (const chunk of chunks) {
      // After a hang-up nothing is written to the controller any more.
      if (cancelled) return;
      if (chunk) controller.enqueue(encoder.encode(chunk));
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed || cancelled) return;
      try {
        // First pull: the head needs the first batch, so the file starts with
        // real data (and the empty scope still gets a head plus a tail).
        if (!started) {
          started = true;
          const first = await iter.next();
          // The client may have hung up while the batch was fetched.
          if (cancelled) return;
          const batch = first.done ? [] : first.value;
          const head = plan.head ? await plan.head(batch) : [];
          if (cancelled) return;
          enqueue(controller, head);
          if (first.done) {
            closed = true;
            const tail = plan.tail ? await plan.tail() : [];
            if (cancelled) return;
            enqueue(controller, tail);
            controller.close();
            return;
          }
          offset = batch.length;
          const rendered = plan.render(batch, 0);
          if (cancelled) return;
          controller.enqueue(encoder.encode(rendered));
          return;
        }
        const next = await iter.next();
        if (cancelled) return;
        if (next.done) {
          closed = true;
          const tail = plan.tail ? await plan.tail() : [];
          if (cancelled) return;
          enqueue(controller, tail);
          controller.close();
          return;
        }
        const at = offset;
        offset += next.value.length;
        const rendered = plan.render(next.value, at);
        if (cancelled) return;
        controller.enqueue(encoder.encode(rendered));
      } catch (e) {
        // A throwing batch (DB failure) must release the generator, or the
        // cursor leaks and the socket hangs instead of erroring.
        closed = true;
        await closeSource(iter);
        // After a hang-up there is nobody left to read the failure, and
        // throwing here would surface as an unhandled rejection.
        if (cancelled) return;
        throw e;
      }
    },
    // Client hung up mid-export: let the generator release its iterator.
    async cancel() {
      cancelled = true;
      closed = true;
      await closeSource(iter);
    },
  });
}

// chunkStream: a byte stream over an async generator (the .xlsx and .pdf
// writers produce their bytes that way).
// Why the cancel handshake: the client can hang up while a pull is in
// flight - the database is still answering. The cancel then waits for that
// pull instead of racing it: the generator is closed exactly once, the
// controller is never touched after the cancel, and a failure that arrives
// late is dropped instead of surfacing as an unhandled rejection on a dead
// connection.
export function chunkStream<T>(chunks: AsyncGenerator<T>): ReadableStream<T> {
  let cancelled = false;
  let finished = false;
  return new ReadableStream<T>({
    async pull(controller) {
      if (cancelled || finished) return;
      try {
        const { value, done } = await chunks.next();
        // The client may have hung up while the chunk was produced.
        if (cancelled) return;
        if (done) {
          finished = true;
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (e) {
        finished = true;
        await closeSource(chunks);
        if (cancelled) return;
        throw e;
      }
    },
    async cancel() {
      cancelled = true;
      await closeSource(chunks);
    },
  });
}
