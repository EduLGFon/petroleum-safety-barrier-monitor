// Admin auth - single ADMIN_TOKEN today, shaped to grow into a users table.
// This is why it exists: the PATCH status path writes via
// record_status_change(), so it must not be callable by anyone with curl.
// Reads stay open (dashboard decision, documented in docs/API.md); writes
// and future admin routes go through checkAdminAuth. Fail-closed: no token
// configured means every write is denied, never silently allowed.
export type AdminRole = "admin";

export type AdminAuthResult =
  | { ok: true; role: AdminRole }
  | { ok: false; message: string };

export type TokenGetter = () => string | undefined;

const defaultToken: TokenGetter = () => Deno.env.get("ADMIN_TOKEN");

// constantTimeEqual: avoids leaking the token prefix through timing. Cheap
// insurance for a bearer secret compared byte-by-byte.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// checkAdminAuth: Bearer token against ADMIN_TOKEN. The result carries a
// role (not just a boolean) so a future users-table lookup can return
// richer identities without changing call sites.
export function checkAdminAuth(
  req: Request,
  getToken: TokenGetter = defaultToken,
): AdminAuthResult {
  const configured = getToken();
  if (!configured) {
    return { ok: false, message: "admin token not configured" };
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (!match || !constantTimeEqual(match[1]!, configured)) {
    return { ok: false, message: "invalid admin token" };
  }
  return { ok: true, role: "admin" };
}
