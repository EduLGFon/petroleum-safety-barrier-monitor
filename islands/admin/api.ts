// Admin API helper - shared fetch + error envelope parser for admin tabs.
// This is why it exists: Users, Rules, and Recipients tabs each had a copy
// of the same fetch wrapper; one helper keeps auth errors consistent and
// maps English wire errors to pt-BR UI strings at the boundary.
import { toPtError } from "../../lib/api/error-pt.ts";

// api: same-origin JSON fetch; throws a localized Error on non-OK status.
export async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = await res.json() as { error?: string };
      if (data.error) message = toPtError(data.error);
    } catch {
      // Keep the status fallback when the body is not JSON.
    }
    throw new Error(message);
  }
  return await res.json();
}
