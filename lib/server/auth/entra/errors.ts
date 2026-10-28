// Entra error codes - stable internal reasons and public login codes.
// This is why it exists: provider errors must never reach the browser, and
// every failure path must map to one of a small set of safe public codes.
export type EntraFailureReason =
  | "disabled"
  | "misconfigured"
  | "discovery_failed"
  | "token_request_failed"
  | "invalid_signature"
  | "invalid_claims"
  | "flow_expired"
  | "flow_replayed"
  | "binding_mismatch"
  | "unknown_user"
  | "inactive_user"
  | "unavailable"
  | "failed";

export type PublicSsoCode =
  | "denied"
  | "expired"
  | "no_access"
  | "unavailable"
  | "failed"
  | "disabled";

export function publicCodeForReason(reason: EntraFailureReason): PublicSsoCode {
  switch (reason) {
    case "disabled":
      return "disabled";
    case "flow_expired":
    case "flow_replayed":
    case "binding_mismatch":
      return "expired";
    case "unknown_user":
    case "inactive_user":
      return "no_access";
    case "discovery_failed":
    case "token_request_failed":
    case "unavailable":
      return "unavailable";
    default:
      return "failed";
  }
}

export function sanitizeError(err: unknown): { name: string; code?: string } {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      code: typeof code === "string" ? code : undefined,
    };
  }
  return { name: typeof err };
}
