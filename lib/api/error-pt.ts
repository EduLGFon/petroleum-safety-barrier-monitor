// API error localization - English wire errors to pt-BR UI strings.
// This is why it exists: API and logs stay English per agents.md, but users
// see Portuguese; this boundary keeps raw English out of PT screens.
const PT_BY_EN: Record<string, string> = {
  "invalid credentials": "Credenciais inválidas",
  "email and password are required": "Informe e-mail e senha",
  "current and new passwords are required": "Informe a senha atual e a nova",
  "current password is incorrect": "Senha atual incorreta",
  "new password must differ": "A nova senha deve ser diferente da atual",
  "password must be at least 12 characters": "A senha deve ter 12+ caracteres",
  "password must be at most 256 characters":
    "A senha deve ter 256 caracteres no máximo",
  "session required": "Sessão necessária",
  "not authenticated": "Sessão expirada, entre novamente",
  "invalid session": "Sessão expirada, entre novamente",
  "admin only": "Acesso restrito ao administrador",
  "not found": "Não encontrado",
  "Invalid barrier id": "Barreira inválida",
  "Barrier not found": "Barreira não encontrada",
  "Invalid user id": "Usuário inválido",
  "User not found": "Usuário não encontrado",
  "Invalid recipient id": "Destinatário inválido",
  "Recipient not found": "Destinatário não encontrado",
  "Invalid rule id": "Regra inválida",
  "Rule not found": "Regra não encontrada",
  "No sync change found": "Nenhuma mudança de sincronização encontrada",
  "Invalid JSON body": "Requisição inválida",
  "Unknown field": "Campo desconhecido",
  "format must be csv, xlsx or pdf": "Formato deve ser csv, xlsx ou pdf",
  "statusId is a required non-negative integer": "Status inválido",
  "authorId is required (or log in so it derives from your user)":
    "Autor obrigatório",
  "note must be a string": "Observação inválida",
  "staleDays must be a positive integer":
    "Dias de atraso deve ser um inteiro positivo",
  "too many requests": "Muitas tentativas, aguarde um minuto",
  "export rate limit exceeded":
    "Limite de exportação excedido, aguarde um minuto",
  "Auth store unreachable": "Banco indisponível, tente novamente",
  "Server misconfigured": "Servidor mal configurado",
  "Failed to fetch barriers": "Falha ao carregar barreiras",
  "Failed to fetch barrier": "Falha ao carregar barreira",
  "Failed to fetch deleted barriers": "Falha ao carregar barreiras excluídas",
  "Failed to update barrier": "Falha ao atualizar barreira",
  "Failed to update barrier status": "Falha ao atualizar status",
  "Failed to resolve author": "Falha ao identificar autor",
  "Failed to fetch KPI snapshot": "Falha ao carregar indicadores",
  "Failed to fetch chart data": "Falha ao carregar gráfico",
  "Failed to fetch vocabularies": "Falha ao carregar vocabulários",
  "Failed to fetch option sets": "Falha ao carregar opções",
  "Failed to save option set": "Falha ao salvar opções",
  "Failed to fetch sync status": "Falha ao carregar status da sincronização",
  "Failed to fetch sync changes": "Falha ao carregar mudanças",
  "Failed to fetch sync runs": "Falha ao carregar execuções",
  "Failed to fetch sync detail": "Falha ao carregar detalhe",
  "Failed to build export": "Falha ao gerar exportação",
  "Failed to fetch users": "Falha ao carregar usuários",
  "Failed to create user": "Falha ao criar usuário",
  "Failed to update user": "Falha ao atualizar usuário",
  "Failed to delete user": "Falha ao excluir usuário",
  "Failed to fetch rules": "Falha ao carregar regras",
  "Failed to create rule": "Falha ao criar regra",
  "Failed to update rule": "Falha ao atualizar regra",
  "Failed to delete rule": "Falha ao excluir regra",
  "Failed to preview rule": "Falha ao pré-visualizar regra",
  "Failed to fetch recipients": "Falha ao carregar destinatários",
  "Failed to create recipient": "Falha ao criar destinatário",
  "Failed to update recipient": "Falha ao atualizar destinatário",
  "Failed to delete recipient": "Falha ao excluir destinatário",
  "Failed to fetch lookups": "Falha ao carregar opções",
  "Login failed": "Falha no login",
  "Logout failed": "Falha ao sair",
  "Password change failed": "Falha ao trocar senha",
};

// toPtError: maps a known English API error to pt-BR; unknown messages pass
// through with an "Erro" prefix when they already look localized.
export function toPtError(message: string): string {
  if (PT_BY_EN[message]) return PT_BY_EN[message];
  if (/^(Erro|Falha|Não|Nenhum)/.test(message)) return message;
  return message;
}
