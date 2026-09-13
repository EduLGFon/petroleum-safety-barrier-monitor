// Route query params - strict parsers shared by API routes.
// This is why it exists: one validation policy (integers only, ISO dates,
// trimmed/capped text) instead of per-route copies drifting apart. Files
// starting with _ are never routes in Fresh, so this is import-only.

// Parses optional integer query param; undefined for missing/malformed.
// Rejects floats, negatives are left to SQL clamping per field.
export function parseIntParam(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  if (!/^-?\d+$/.test(v.trim())) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

// Parses optional ISO-date param (YYYY-MM-DD); undefined when malformed.
export function parseDateParam(v: string | null): string | undefined {
  if (v === null || v === "") return undefined;
  const date = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

// Trims free text and caps length so a pasted blob cannot become a huge LIKE.
export function parseQueryParam(v: string | null): string | undefined {
  if (v === null) return undefined;
  const trimmed = v.trim().slice(0, 200);
  return trimmed === "" ? undefined : trimmed;
}
