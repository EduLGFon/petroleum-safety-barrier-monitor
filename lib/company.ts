// Company branding - resolves the operator name shown across the UI.
// This is why it exists: no company identification is hardcoded anywhere;
// set COMPANY_NAME in the environment (see .env.example) and every brand
// line, title and export header follows. Empty string means unbranded.
export function getCompanyName(): string {
  try {
    if (typeof Deno !== "undefined") {
      return Deno.env.get("COMPANY_NAME")?.trim() ?? "";
    }
  } catch {
    // Env access denied - fall through to unbranded.
  }
  return "";
}

// Prefixes `rest` with the company name ("Name · rest"), or returns `rest`
// unchanged when unbranded.
export function withBrand(company: string, rest: string): string {
  return company ? `${company} · ${rest}` : rest;
}
