// Tests for the server export client - what the dashboard sends to
// /api/export (format, selection, print part) and how the answer is consumed.
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
  body: { format?: string; ids?: number[]; part?: number };
}

const QUERY: BarriersQuery = {
  locationId: 2,
  criticalOnly: true,
  sortCol: "tag",
  sortDir: "desc",
};

// Harness: stubs fetch, object URLs and print, and records what happened.
function harness(
  respond: (seen: Seen) => Response,
): {
  seen: Seen[];
  downloads: string[];
  prints: string[];
  // Mutable counter: the client calls onExpired() on a dead session.
  expired: { count: number };
  fetch: typeof globalThis.fetch;
} {
  setupDom();
  const seen: Seen[] = [];
  const prints: string[] = [];
  const expired = { count: 0 };
  const clicks: string[] = [];
  URL.createObjectURL = () => "blob:stub";
  URL.revokeObjectURL = () => {};
  const g = globalThis as unknown as Record<string, unknown>;
  g.print = () => {
    prints.push(document.title);
    // Real browsers fire afterprint when the dialog closes; the sequence
    // waits on it, so the stub closes immediately.
    globalThis.dispatchEvent(new Event("afterprint"));
  };
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
    prints,
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

Deno.test("exportFromServer downloads the streamed file", async () => {
  const h = harness(() => okResponse("payload"));
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    for (const kind of ["csv", "xlsx"] as Fmt[]) {
      await run(kind, h, [1]);
    }
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.downloads, [
    "barreiras-2026-09-27.csv",
    "barreiras-2026-09-27.xlsx",
  ]);
});

Deno.test("exportFromServer prints the PDF one part at a time", async () => {
  // 4,500 rows at 2,000 per part = 3 print jobs, each labelled with its
  // position so the saved PDFs cannot be confused.
  const h = harness((seen) =>
    okResponse(`<div>part ${seen.body.part}</div>`, {
      "x-export-total": "4500",
      "x-export-parts": "3",
    })
  );
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    await run("pdf", h, [1, 2]);
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.seen.map((s) => s.body.part), [1, 2, 3]);
  assertEquals(h.prints, [
    "barreiras-2026-09-27-parte-1-de-3",
    "barreiras-2026-09-27-parte-2-de-3",
    "barreiras-2026-09-27-parte-3-de-3",
  ]);
  // The report lands in the hidden print node, never in the app chrome.
  assertStrictEquals(document.getElementById("print-report")?.innerHTML, "");
  assertStrictEquals(
    document.body.classList.contains("printing-report"),
    false,
  );
});

Deno.test("exportFromServer prints a single part for a small selection", async () => {
  const h = harness(() =>
    okResponse("<div>only</div>", { "x-export-total": "12" })
  );
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    await run("pdf", h, [1]);
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(h.seen.length, 1);
  assertEquals(h.prints, ["barreiras-2026-09-27"]);
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
