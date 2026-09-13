/**
 * ══════════════════════════════════════════════════════════════════════════
 * ENUM RESOLVERS — numeric ⇄ string mapping for every domain constant
 * ══════════════════════════════════════════════════════════════════════════
 * A real backend/API exchanges compact integer codes instead of strings
 * (smaller payloads, locale-independent, safe to rename display labels
 * without a migration). Each domain gets:
 *   - a `*_CODES` map:   id -> string
 *   - a `*_IDS` map:     string -> id   (reverse lookup, built automatically)
 *   - `toXId` / `fromXId` helper functions
 *
 * When wiring a real API, the wire format uses these ids. The UI always
 * works with the resolved string via `fromXId`, so components never need
 * to change.
 */

// Barrel re-export - split to keep files small; implementations live in ./enums/.
export * from "./enums/taxonomy.ts";
export * from "./enums/context.ts";
export * from "./enums/codes.ts";
