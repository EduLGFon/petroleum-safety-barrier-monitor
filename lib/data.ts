/**
 * ══════════════════════════════════════════════════════════════════════════
 * MOCK DATA SOURCE — generates deterministic WireBarrier[] records
 * ══════════════════════════════════════════════════════════════════════════
 * This simulates what a real backend database would return: rows keyed by
 * numeric ids (see lib/enums.ts), never display strings. Swap this file for
 * a real HTTP fetch and nothing else in the app needs to change — the
 * contract is `WireBarrier[]`, resolved later by lib/resolve.ts.
 */

// Barrel re-export - split to keep files small; implementations live in ./mock/.
export * from "./mock/generator.ts";
export * from "./mock/history.ts";
export * from "./mock/tags.ts";
export * from "./mock/rng.ts";
