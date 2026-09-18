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
