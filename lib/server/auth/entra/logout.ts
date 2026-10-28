// Entra logout URL - best-effort end-session redirect.
// This is why it exists: local logout is the security boundary, while the IdP
// session may remain. The URL is built only from configured values.
import { type AuthConfig } from "../../config.ts";

import { buildLogoutUrl as buildUrl } from "./client.ts";

export function buildEntraLogoutUrl(config: AuthConfig): string | null {
  return buildUrl(config);
}
