// Admin API client - same-origin JSON fetch for the settings admin tab.
// This is why it exists: Users, Recipients, and Rules managers share one
// fetch wrapper so auth errors stay consistent and English wire errors map
// to pt-BR UI strings at the boundary.
import { toPtError } from "./error-pt.ts";

// api: same-origin JSON fetch; throws a localized Error on non-OK status.
export async function adminApi(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
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
