// API error localization - English wire errors to pt-BR UI strings.
// This is why it exists: API and logs stay English per agents.md, but users
// see Portuguese; this boundary keeps raw English out of PT screens.
const PT_BY_EN: Record<string, string> = {
  "invalid credentials": "Credenciais inválidas",
  "email and password are required": "Informe e-mail e senha",
  "Failed to fetch users": "Falha ao carregar usuários",
  "Failed to fetch rules": "Falha ao carregar regras",
  "Failed to fetch recipients": "Falha ao carregar destinatários",
  "Failed to fetch lookups": "Falha ao carregar opções",
};

// toPtError: maps a known English API error to pt-BR; unknown messages pass
// through with an "Erro" prefix when they already look localized.
export function toPtError(message: string): string {
  if (PT_BY_EN[message]) return PT_BY_EN[message];
  if (/^(Erro|Falha|Não|Nenhum)/.test(message)) return message;
  return message;
}
