// Unit tests for the CSRF signal helpers.
// This is why they exist: the safe-method exemption is correct for reads but
// must not be mistaken for permission to revoke server state over a cross-site
// GET (the Entra post-logout landing).
import { isCrossSiteRequest, isSameOriginRequest } from "./csrf.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

function request(
  method: string,
  headers: Record<string, string>,
  url = "https://app.example/test",
): Request {
  return new Request(url, { method, headers });
}

Deno.test("isSameOriginRequest allows GET without any headers", () => {
  assertStrictEquals(isSameOriginRequest(request("GET", {})), true);
});

Deno.test("isCrossSiteRequest flags an explicit cross-site GET", () => {
  assertStrictEquals(
    isCrossSiteRequest(request("GET", { "sec-fetch-site": "cross-site" })),
    true,
  );
});

Deno.test("isCrossSiteRequest flags a mismatched Origin", () => {
  assertStrictEquals(
    isCrossSiteRequest(
      request("GET", {
        host: "app.example",
        origin: "https://evil.example",
      }),
    ),
    true,
  );
});

Deno.test("isCrossSiteRequest allows same-origin and unmarked GETs", () => {
  assertStrictEquals(
    isCrossSiteRequest(
      request("GET", {
        host: "app.example",
        origin: "https://app.example",
      }),
    ),
    false,
  );
  assertStrictEquals(
    isCrossSiteRequest(request("GET", { "sec-fetch-site": "same-origin" })),
    false,
  );
  assertStrictEquals(isCrossSiteRequest(request("GET", {})), false);
});
