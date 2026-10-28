// Server validation - shared email/name normalizers for SQL stores.
// This is why it exists: users, recipients, and authors each had a copy of
// the same regex and length caps; one module keeps them in agreement.
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("email must be a string");
  const email = raw.trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid email address");
  }
  return email;
}

// normalizeName: trims free text; empty stays empty.
export function normalizeName(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error("name must be a string");
  return raw.trim().slice(0, 200);
}

// normalizePhone: optional second-channel number for critical-only alerts.
// Empty/null/undefined stays "" (email only). Otherwise strips to digits
// and accepts: 12-13 digits starting with 55 (full), or 10-11 digits
// (area code + number, 55 prefixed). Rejects short numbers without area
// code and non-domestic numbers. Returns digits only, capped at 13.
export function normalizePhone(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error("phone must be a string");
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const digits = trimmed.replace(/\D/g, "").slice(0, 13);
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  throw new Error("invalid phone number");
}

// parseIdParam: numeric path ids are positive safe integers, nothing else.
// Returns the id or undefined when the segment is not a valid id, so every
// route answers 400 the same way instead of hand-rolling Number() checks.
// normalizeEntraObjectId: validates and normalizes a Microsoft Entra object id.
// Object ids are GUIDs; store them lowercase to keep uniqueness predictable.
export function normalizeEntraObjectId(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("entraObjectId must be a string");
  }
  const value = raw.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  ) {
    throw new Error("entraObjectId must be a GUID");
  }
  return value;
}

export function parseIdParam(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!/^\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

export function parsePositiveId(raw: unknown, name: string): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return raw;
}

export function normalizeOptionalReference(
  raw: unknown,
  name: string,
): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error(`${name} must be a string`);
  const value = raw.trim();
  if (value.length > 2000) throw new Error(`${name} is too long`);
  return value;
}

export async function readJsonBodyCapped(
  req: Request,
  maxBytes: number,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: "invalid" | "too-large" }
> {
  const declaredBytes = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    return { ok: false, reason: "too-large" };
  }
  const reader = req.body?.getReader();
  if (!reader) return { ok: false, reason: "invalid" };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, body: parsed as Record<string, unknown> };
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: "invalid" };
}

// readJsonBody: parses a JSON object body. Returns { ok: true, body } for an
// object payload, { ok: false } for missing/non-JSON/non-object bodies, so
// routes answer 400 "Invalid JSON body" uniformly. Export-shaped routes with
// an optional body (GET without one) keep their own tolerant reader.
export async function readJsonBody(
  req: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> {
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, body: parsed as Record<string, unknown> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
