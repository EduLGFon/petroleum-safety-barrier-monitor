/**
 * ══════════════════════════════════════════════════════════════════════════
 * UNIFIED API CLIENT — single entry point that feeds the entire dashboard
 * ══════════════════════════════════════════════════════════════════════════
 * Barrel over lib/api/*: types, query conversion, mock and HTTP adapters.
 * Every consumer reads data exclusively through this module (`api.*`).
 *
 * Active adapter is controlled by `PUBLIC_API_MODE`:
 *   - "mock" (default) -> mockAdapter
 *   - "http"            -> httpAdapter, using PUBLIC_API_BASE_URL
 *
 * To go live: set PUBLIC_API_MODE=http and PUBLIC_API_BASE_URL to
 * your backend root. No other file in the app needs to change.
 */
export type { BarriersApi, DomainQuery } from "./api/types.ts";
import { httpAdapterFactory } from "./api/http.ts";
import type { BarriersApi } from "./api/types.ts";
export { toWireQuery } from "./api/query.ts";
import { mockAdapter } from "./api/mock.ts";

// Reads env on the server via Deno. On the client (island) Deno is absent,
// so this falls back to undefined and the mock adapter is used by default.
function getEnv(key: string): string | undefined {
  try {
    if (typeof Deno !== "undefined") return Deno.env.get(key);
  } catch {
    // --deny-env or non-Deno runtime: fall through to default.
  }
  return undefined;
}

const API_MODE = (getEnv("PUBLIC_API_MODE") ?? "mock") as
  | "mock"
  | "http";
const API_BASE_URL = getEnv("PUBLIC_API_BASE_URL") ?? "";

export const api: BarriersApi = API_MODE === "http" && API_BASE_URL
  ? httpAdapterFactory(API_BASE_URL)
  : mockAdapter;

/** Always the in-memory mock, regardless of API_MODE — useful for tests/debugging */
export const mockApi = mockAdapter;
