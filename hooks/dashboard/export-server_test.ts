// Tests for the server export client - what the dashboard sends to
// /api/export (format, selection) and how the answer is consumed: always one
// file download, never a preview.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

import { setupDom } from "../../scripts/test-dom.ts";

import type { Fmt } from "../../lib/export/format.ts";
import { exportFromServer } from "./export-server.ts";

import type { BarriersQuery } from "../../lib/wireTypes.ts";

interface Seen {
  url: string;
  method: string;
  body: { format?: string; ids?: number[] };
}

const QUERY: BarriersQuery = {
  locationId: 2,
  criticalOnly: true,
  sortCol: "tag",
  sortDir: "desc",
};

// Harness: stubs fetch and object URLs, and records downloads by filename.
function harness(
  respond: (seen: Seen) => Response,
): {
  seen: Seen[];
  downloads: string[];
  // Mutable counter: the client calls onExpired() on a dead session.
  expired: { count: number };
  fetch: typeof globalThis.fetch;
} {
  setupDom();
  const seen: Seen[] = [];
  const expired = { count: 0 };
  const clicks: string[] = [];
  URL.createObjectURL = () => "blob:stub";
  URL.revokeObjectURL = () => {};
  const doc = document;
  const originalCreate = doc.createElement.bind(doc);
  doc.createElement = ((tag: string) => {
    const el = originalCreate(tag);
    if (tag === "a") {
      const anchor = el as HTMLAnchorElement;
      anchor.click = () => clicks.push(anchor.getAttribute("download") ?? "");
    }
    return el;
  }) as typeof doc.createElement;
  return {
    seen,
    downloads: clicks,
    expired,
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      const req = seen[seen.length] = {
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : {},
      };
      return Promise.resolve(respond(req));
    },
  };
}

// okResponse: a minimal 200 with the headers the client reads.
function okResponse(
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status: 200, headers });
}

async function run(
  kind: Fmt,
  h: ReturnType<typeof harness>,
  ids: number[] = [],
): Promise<void> {
  await exportFromServer({
    baseUrl: "http://x.test",
    kind,
    ids,
    filename: "barreiras-2026-09-27",
    query: QUERY,
    onExpired: () => {
      h.expired.count++;
    },
  });
}

Deno.test("exportFromServer posts the selection with the scope filters", async () => {
  const h = harness(() => okResponse("csv"));
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    await run("csv", h, [7, 8, 9]);
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.seen.length, 1);
  const call = h.seen[0]!;
  assert(call.method === "POST", "selection must travel in the body");
  // The filters stay in the query string, the ids in the body: an 18k-id
  // selection would never fit a URL.
  assert(call.url.includes("locationId=2"), call.url);
  assert(call.url.includes("criticalOnly=true"), call.url);
  assert(call.url.includes("sortDir=desc"), call.url);
  assertEquals(call.body.ids, [7, 8, 9]);
  assertEquals(call.body.format, "csv");
});

Deno.test("exportFromServer downloads every format as one file", async () => {
  const h = harness(() => okResponse("payload"));
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    for (const kind of ["csv", "xlsx", "html"] as Fmt[]) {
      await run(kind, h, [1]);
    }
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.downloads, [
    "barreiras-2026-09-27.csv",
    "barreiras-2026-09-27.xlsx",
    "barreiras-2026-09-27.html",
  ]);
});

Deno.test("exportFromServer downloads a large report in one request", async () => {
  // The report used to print part by part through the print dialog, whose
  // live preview froze the tab on a large selection. One request, one file.
  const h = harness((seen) =>
    okResponse(`<html>rows for ${seen.body.format}</html>`, {
      "x-export-total": "4500",
    })
  );
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    await run("html", h, [1, 2]);
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.seen.length, 1);
  assertEquals(h.seen[0]!.body.format, "html");
  assertEquals(h.downloads, ["barreiras-2026-09-27.html"]);
  // Nothing is ever mounted into the page DOM for a preview.
  assertStrictEquals(document.getElementById("print-report"), null);
});

Deno.test("exportFromServer surfaces the route refusal", async () => {
  const h = harness(() =>
    new Response(JSON.stringify({ error: "Exportação comporta até 200.000" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  );
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    await assertRejects(
      () => run("csv", h, [1]),
      Error,
      "Exportação comporta até 200.000",
    );
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.expired.count, 0);
});

Deno.test("exportFromServer sends a dead session to login", async () => {
  const h = harness(() => new Response("{}", { status: 401 }));
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    await assertRejects(() => run("xlsx", h, [1]), Error, "Sessão expirada");
  } finally {
    globalThis.fetch = original;
  }
  assertStrictEquals(h.expired.count, 1);
});
