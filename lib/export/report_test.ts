// Unit tests for the downloadable report - the whole selection as one
// standalone HTML file, with no page URL stamped anywhere in it.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { mkBarrier, mkCount } from "./fixture.ts";
import { buildReportDocument } from "./report.ts";

import type { Barrier } from "../types.ts";

Deno.test("buildReportDocument wraps every row in a standalone file", () => {
  const rows: Barrier[] = [
    mkBarrier(),
    mkBarrier({ id: 2, tag: "PSV-002", criticality: "A" }),
  ];
  const html = buildReportDocument(rows, "Petrobras", "barreiras-2026-09-28");
  assertStrictEquals(html.startsWith("<!DOCTYPE html>"), true);
  assertStrictEquals(
    html.includes("<title>barreiras-2026-09-28</title>"),
    true,
  );
  assertStrictEquals(html.includes("@page"), true);
  assertStrictEquals(html.includes("PSV-001"), true);
  assertStrictEquals(html.includes("PSV-002"), true);
  assertStrictEquals(html.endsWith("</body></html>"), true);
});

Deno.test("buildReportDocument escapes a hostile title and carries no URL", () => {
  const html = buildReportDocument(
    [mkBarrier({ comments: "valve http://example.com/x" })],
    "Petrobras",
    `<barreiras>"&"`,
  );
  assertStrictEquals(
    html.includes("<title>&lt;barreiras&gt;&quot;&amp;&quot;</title>"),
    true,
  );
  // Data text is preserved verbatim; only the shell must be URL-free, since a
  // barrier comment could legitimately quote a link.
  assertStrictEquals(html.includes("valve http://example.com/x"), true);
  const head = html.slice(0, html.indexOf("</head>"));
  assertStrictEquals(head.includes("http://"), false);
  assertStrictEquals(head.includes("https://"), false);
  assertStrictEquals(/localhost/i.test(head), false);
});

Deno.test("buildReportDocument covers a large selection without parts", () => {
  const html = buildReportDocument(mkCount(4_500), "Petrobras");
  assertStrictEquals(html.includes("PSV-4500"), true);
  assertStrictEquals(html.includes("parte "), false);
  assert(html.length > 1_000_000);
});
