// Password hashing - PBKDF2-SHA256 over WebCrypto, no dependencies.
// This is why it exists: user logins need a salted, iterated digest without
// pulling a Node/npm bcrypt build into a Deno-only workspace. Stored format
// is `pbkdf2$iterations$salt_b64$hash_b64` so parameters stay auditable.
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

// toBase64: binary-safe base64 for salt and hash bytes.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// fromBase64: inverse of toBase64, throws on malformed input.
function fromBase64(raw: string): Uint8Array {
  const binary = atob(raw);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// constantTimeEqualBytes: avoids leaking hash bytes through timing.
function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// deriveKey: one PBKDF2-SHA256 pass over the password and salt.
async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

// hashPassword: creates a storable digest for a new or reset password.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

// verifyPassword: checks a login attempt against a stored digest. Returns
// false (never throws) on malformed hashes so a corrupt row cannot crash
// the login route.
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;
    const salt = fromBase64(parts[2]!);
    const expected = fromBase64(parts[3]!);
    const actual = await deriveKey(password, salt, iterations);
    return constantTimeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

// validateNewPassword: policy gate for registration and resets.
export function validateNewPassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 12) {
    throw new Error("password must be at least 12 characters");
  }
  if (raw.length > 256) {
    throw new Error("password must be at most 256 characters");
  }
  return raw;
}
