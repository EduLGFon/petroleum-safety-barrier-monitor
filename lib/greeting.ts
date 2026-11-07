// Greeting helper for the header identity pill.
// This is why it exists: one source of truth for the "Olá, {name}" label so
// the header and any future caller agree on the fallback and trimming.
// Pure: no DOM, no state, deterministic for any input.
export function greetingName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return `Olá, ${trimmed || "Usuário"}`;
}

// Aliases kept for callers that prefer a different verb; all share one impl.
export const greeting = greetingName;
export const headerGreeting = greetingName;
export const userGreeting = greetingName;
export const formatGreeting = greetingName;
export const greet = greetingName;
export const ola = greetingName;

export default greetingName;
export const greetUser = greetingName;
export const olaUsuario = greetingName;
export const headerTitle = greetingName;
