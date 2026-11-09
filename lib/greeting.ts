// Greeting helper for the header identity pill.
// This is why it exists: one source of truth for the "Olá, {name}" label so
// the header and any future caller agree on the fallback and trimming.
// Pure: no DOM, no state, deterministic for any input. Prefer the trimmed
// display name; otherwise use the email local part (the only identity that
// may still be populated); otherwise the generic "Usuário" label.
export function greetingName(
  name: string | null | undefined,
  email?: string | null,
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return `Olá, ${trimmed}`;
  const localPart = (email ?? "").split("@")[0].trim();
  return `Olá, ${localPart || "Usuário"}`;
}
