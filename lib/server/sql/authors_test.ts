// Pagination tests for listAuthors - DB-free via a pool stub.
import { assert, assertEquals } from "jsr:@std/assert@^1";

import { listAuthors } from "./authors.ts";

function installPool(
  respond: (text: string, args: unknown[]) => { rows: unknown[] },
): () => void {
  const globals = globalThis as unknown as { __barrierPool?: unknown };
  const previous = globals.__barrierPool;
  globals.__barrierPool = {
    connect: () =>
      Promise.resolve({
        queryObject: (text: string, args: unknown[] = []) =>
          Promise.resolve(respond(text, args)),
        release: () => {},
      }),
    end: () => Promise.resolve(),
  };
  return () => {
    globals.__barrierPool = previous;
  };
}

Deno.test("listAuthors passes limit and offset to the query", async () => {
  const seen: Array<{ text: string; args: unknown[] }> = [];
  const restore = installPool((text, args) => {
    seen.push({ text, args });
    return { rows: [{ id: 1, name: "Risk Owner" }] };
  });
  try {
    const rows = await listAuthors(5, 10);
    assertEquals(rows.length, 1);
    assertEquals(seen.length, 1);
    assertEquals(seen[0]?.args, [5, 10]);
    assert(seen[0]?.text.includes("limit $1"), "limit placeholder");
    assert(seen[0]?.text.includes("offset $2"), "offset placeholder");
  } finally {
    restore();
  }
});

Deno.test("listAuthors without pagination keeps the unbounded query", async () => {
  const seen: Array<{ text: string; args: unknown[] }> = [];
  const restore = installPool((text, args) => {
    seen.push({ text, args });
    return { rows: [] };
  });
  try {
    await listAuthors();
    assertEquals(seen.length, 1);
    assertEquals(seen[0]?.args, []);
    assert(!seen[0]?.text.includes("limit"), "no limit clause");
  } finally {
    restore();
  }
});
