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
  // Access-management guards. The route rewrites the generic messages to the
  // "your own account" variants when the caller is the target, so the admin
  // gets an explanation instead of only the policy.
  "cannot demote the last active admin":
    "Não é possível rebaixar o único administrador ativo",
  "cannot deactivate the last active admin":
    "Não é possível desativar o único administrador ativo",
  "cannot delete the last active admin":
    "Não é possível excluir o único administrador ativo",
  "cannot demote your own account while you are the last active admin":
    "Você é o único administrador ativo. Não é possível rebaixar sua própria conta.",
  "cannot deactivate your own account while you are the last active admin":
    "Você é o único administrador ativo. Não é possível desativar sua própria conta.",
  "cannot delete your own account while you are the last active admin":
    "Você é o único administrador ativo. Não é possível excluir sua própria conta.",
  // Validation messages that reach the admin forms after a 400 response.
  "email already exists": "Este e-mail já está cadastrado",
  "rule name already exists": "Já existe uma regra com este nome",
  "duplicate value": "Já existe um registro com este valor",
  "nothing to update": "Nenhuma alteração informada",
  "role must be admin or user": "Perfil deve ser Admin ou Usuário",
  "active must be a boolean": "Situação deve ser verdadeira ou falsa",
  "name must be a string": "Nome deve ser um texto",
  "name must not be empty": "Nome não pode ficar vazio",
  "email must be a string": "E-mail deve ser um texto",
  "invalid email address": "Endereço de e-mail inválido",
  "phone must be a string": "Telefone deve ser um texto",
  "invalid phone number": "Número de telefone inválido",
  "description must be a string": "Descrição deve ser um texto",
  "options must be an array": "As opções devem ser uma lista",
  "options must be strings": "As opções devem ser textos",
  "options must not be empty": "Informe ao menos uma opção",
  "must be a string": "Valor deve ser um texto",
  "staleDays must be a positive integer or null":
    "Dias de atraso deve ser um número inteiro positivo ou nulo",
  "urgency must be one of any, urgent, critical": "Urgência inválida",
  "priority must be an integer": "Prioridade deve ser um número inteiro",
  "priority must be between -1000 and 1000":
    "Prioridade deve estar entre -1000 e 1000",
  "author name must be a string": "Nome do autor deve ser um texto",
  "author name must not be empty": "Nome do autor não pode ficar vazio",
  "invalid admin token": "Credenciais administrativas inválidas",
  "admin token not configured": "Token administrativo não configurado",
};

// FIELD_PT: user-facing labels for the dynamic validation messages built by
// the alert-rule and barrier stores, so a field name never leaks in English.
const FIELD_PT: Record<string, string> = {
  active: "Situação",
  activeDays: "Dias ativos",
  availabilityId: "Disponibilidade",
  categoryId: "Categoria",
  categoryIds: "Categorias",
  cooldownMinutes: "Pausa entre alertas",
  criticalityId: "Criticidade",
  criticalityIds: "Criticidades",
  criticalOnly: "Somente críticas",
  description: "Descrição",
  email: "E-mail",
  fromStatusIds: "Status de origem",
  groupingId: "Agrupamento",
  groupingIds: "Agrupamentos",
  includeRecovery: "Incluir recuperação",
  locationId: "Localidade",
  locationIds: "Localidades",
  maxPerDay: "Máximo de alertas por dia",
  name: "Nome",
  notifyImmediate: "Notificação imediata",
  onlyNoActionPlan: "Somente sem plano de ação",
  onTransition: "Somente na transição",
  options: "Opções",
  ownerId: "Responsável",
  ownerIds: "Responsáveis",
  password: "Senha",
  phone: "Telefone",
  priority: "Prioridade",
  quietEndHour: "Fim do silêncio",
  quietStartHour: "Início do silêncio",
  role: "Perfil",
  staleDays: "Dias de atraso",
  staleRepeatDays: "Repetição de atraso",
  toStatusId: "Status de destino",
  toStatusIds: "Status de destino",
  typologyId: "Tipologia",
  typologyIds: "Tipologias",
  urgency: "Urgência",
  validFrom: "Início da validade",
  validTo: "Fim da validade",
};

function fieldPt(field: string): string {
  return FIELD_PT[field] ?? "Campo";
}

// translateDynamic: covers messages assembled at runtime from a field name,
// a comparison limit, or a date format. Exact matches above win first.
function translateDynamic(message: string): string | undefined {
  let m: RegExpExecArray | null;

  // Kept as a safety net for older/deployed wording such as
  // "Cannot demote the first admin": the policy is always the same, so the
  // user gets the accurate Portuguese rule regardless of the wire wording.
  m = /^cannot (demote|deactivate|delete)\b/i.exec(message);
  if (m) {
    const action = m[1].toLowerCase();
    const verb = action === "demote"
      ? "rebaixar"
      : action === "deactivate"
      ? "desativar"
      : "excluir";
    if (/your own account/i.test(message)) {
      return `Você é o único administrador ativo. Não é possível ${verb} sua própria conta.`;
    }
    return `Não é possível ${verb} o único administrador ativo`;
  }

  if (/^(failed to fetch|load failed|networkerror)/i.test(message)) {
    return "Falha de conexão, tente novamente";
  }

  m = /^(.+) must be a non-negative integer or null$/.exec(message);
  if (m) {
    return `${fieldPt(m[1])}: informe um número inteiro não negativo ou nulo`;
  }
  m = /^(.+) must be a non-negative integer$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe um número inteiro não negativo`;
  m = /^(.+) must be a positive integer or null$/.exec(message);
  if (m) {
    return `${fieldPt(m[1])}: informe um número inteiro positivo ou nulo`;
  }
  m = /^(.+) must be an hour 0-23 or null$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe uma hora entre 0 e 23, ou nulo`;
  m = /^(.+) must be YYYY-MM-DD or null$/.exec(message);
  if (m) {
    return `${fieldPt(m[1])}: informe uma data no formato AAAA-MM-DD, ou nulo`;
  }
  m = /^(.+) must be a valid date$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe uma data válida`;
  m = /^(.+) must be an array of integers$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe uma lista de números inteiros`;
  m = /^(.+) must be an array or null$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe uma lista ou nulo`;
  m = /^(.+) values must be >= (-?\d+)$/.exec(message);
  if (m) {
    return `${fieldPt(m[1])}: os valores devem ser maiores ou iguais a ${m[2]}`;
  }
  m = /^(.+) values must be <= (-?\d+)$/.exec(message);
  if (m) {
    return `${fieldPt(m[1])}: os valores devem ser menores ou iguais a ${m[2]}`;
  }
  m = /^(.+) values must be non-negative$/.exec(message);
  if (m) return `${fieldPt(m[1])}: os valores não podem ser negativos`;
  m = /^(.+) must be a boolean$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe verdadeiro ou falso`;
  m = /^(.+) must be a string$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe um texto`;
  m = /^(.+) must not be empty$/.exec(message);
  if (m) return `${fieldPt(m[1])}: não pode ficar vazio`;
  m = /^(.+) must be an integer$/.exec(message);
  if (m) return `${fieldPt(m[1])}: informe um número inteiro`;
  m = /^(.+) must be between (-?\d+) and (-?\d+)$/.exec(message);
  if (m) {
    return `${fieldPt(m[1])}: informe um valor entre ${m[2]} e ${m[3]}`;
  }
  m = /^(.+) must be one of (.+)$/.exec(message);
  if (m) return `${fieldPt(m[1])}: valor inválido`;

  // Browser/fetch errors and raw driver duplicate-key messages should never
  // reach the screen, but translate them if a new call path surfaces them.
  m = /^API error (\d+): .+$/.exec(message);
  if (m) return `Erro ${m[1]} ao carregar dados`;
  if (/^HTTP \d+$/.test(message)) {
    return "Erro de comunicação com o servidor";
  }
  if (/duplicate key value violates unique constraint/i.test(message)) {
    if (/email/i.test(message)) return "Este e-mail já está cadastrado";
    if (/name/i.test(message)) return "Já existe um registro com este nome";
    return "Já existe um registro com este valor";
  }

  return undefined;
}

// PT_PREFIX: client-side messages that are already Portuguese and must pass
// through unchanged instead of hitting the generic fallback.
const PT_PREFIX =
  /^(Erro|Falha|Não|Nenhum|Nenhuma|Informe|Senha|Sessão|Usuário|Destinatário|Regra|Barreira|Acesso|Banco|Servidor|Muitas|Limite|Credenciais|Autor|Observação|Dias|Situação|Perfil|Nome|E-mail|Telefone|Categoria|Localidade|Criticidade|Tipologia|Agrupamento|Responsável|Urgência|Prioridade|Pausa|Máximo|Início|Fim|Válido|Repetição|Somente|Incluir|Notificação|Valor|Formato|As opções|Você|Já|Este|Esta|Ocorreu)\b/;

// toPtError: maps a known English API error to pt-BR. Unknown English text
// gets a safe Portuguese fallback rather than leaking implementation details;
// strings already localized by the client pass through unchanged.
export function toPtError(message: string): string {
  if (PT_BY_EN[message]) return PT_BY_EN[message];
  const dynamic = translateDynamic(message);
  if (dynamic) return dynamic;
  if (/[ãáàâäéêëíîïóôõöúûüç]/i.test(message)) return message;
  if (PT_PREFIX.test(message)) return message;
  if (/^[A-Za-z]/.test(message)) {
    return "Ocorreu um erro inesperado. Tente novamente.";
  }
  return message;
}
