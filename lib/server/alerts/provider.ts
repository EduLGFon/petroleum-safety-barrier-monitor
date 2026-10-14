// Alert provider client - generic upstream delivery over HTTPS+JSON.
// This is why it exists: local SMTP digest is retired; detection stays
// local (rules, watermark, dedup) while delivery, retry, templates and
// opt-out belong to the provider. One barrier event maps to one POST;
// the second channel (messaging) fires only for the uncontained
// unavailable landing, never for contained or degraded landings.
export interface ProviderConfig {
  baseUrl: string;
  token: string;
  companyId: number;
}

export type Situacao = "violada" | "degradada" | "normalizada" | "teste";

export interface ProviderMapping {
  situacao: Situacao;
  despacharAgora: boolean;
  withMessaging: boolean;
  send: boolean;
}

// mapLanding: compliance-driven table (ids mirror availability_statuses).
// 5 Indisponivel (non-compliant) -> violada + messaging + immediate.
// 4 Degradado (non-compliant) -> degradada, email only, queued.
// 2/3 contained (compliant) -> degradada low, email only, queued.
// 0 Available (compliant) -> normalizada (caller must ensure the previous
// state was non-compliant). 1 Out of operation -> suppress (planned stop).
// Unknown ids fail closed to degradada email-only so novel statuses notify.
export function mapLanding(statusId: number): ProviderMapping {
  if (statusId === 5) {
    return {
      situacao: "violada",
      despacharAgora: true,
      withMessaging: true,
      send: true,
    };
  }
  if (statusId === 4) {
    return {
      situacao: "degradada",
      despacharAgora: false,
      withMessaging: false,
      send: true,
    };
  }
  if (statusId === 2 || statusId === 3) {
    return {
      situacao: "degradada",
      despacharAgora: false,
      withMessaging: false,
      send: true,
    };
  }
  if (statusId === 0) {
    return {
      situacao: "normalizada",
      despacharAgora: false,
      withMessaging: false,
      send: true,
    };
  }
  if (statusId === 1) {
    return {
      situacao: "degradada",
      despacharAgora: false,
      withMessaging: false,
      send: false,
    };
  }
  return {
    situacao: "degradada",
    despacharAgora: false,
    withMessaging: false,
    send: true,
  };
}

export function providerConfigFromEnv(
  get: (name: string) => string | undefined = (n) => Deno.env.get(n),
): ProviderConfig {
  const baseUrl = (get("ALERT_PROVIDER_BASE_URL") ?? "").replace(/\/+$/, "");
  const token = get("ALERT_PROVIDER_TOKEN") ?? "";
  if (!baseUrl) throw new Error("ALERT_PROVIDER_BASE_URL is not set");
  if (!token) throw new Error("ALERT_PROVIDER_TOKEN is not set");
  const companyId = Number(get("ALERT_PROVIDER_COMPANY_ID") ?? "1") || 1;
  return { baseUrl, token, companyId };
}

export interface ProviderRecipient {
  email: string;
  name?: string;
  phone?: string;
}

export interface ProviderBarrierRef {
  id: number;
  codigo: string;
  nome: string;
  local: string;
  tipo: string;
}

export interface ProviderPayload {
  alerta_id: string;
  company_id: number;
  situacao: Situacao;
  barreira: ProviderBarrierRef;
  titulo: string;
  mensagem: string;
  ocorrido_em: string;
  link?: string;
  canais: string[];
  destinatarios: Array<{ canal: string; valor: string; nome?: string }>;
  dados_extra?: Record<string, string>;
  despachar_agora: boolean;
}

// buildAlertaId: stable per (barrier, date, status) so retries reuse it.
export function buildAlertaId(
  barrierId: number,
  transitionDate: string,
  statusId: number,
): string {
  const day = transitionDate.slice(0, 10).replace(/-/g, "");
  return `BAR-${barrierId}-${day}-${statusId}`.slice(0, 120);
}

// buildTitulo: "[$CRITICIDADE] $STATUS $LOCATION $NOME $CODIGO", capped.
export function buildTitulo(
  criticality: string,
  status: string,
  location: string,
  nome: string,
  codigo: string,
): string {
  const parts = [
    `[${(criticality || "?").trim()}]`,
    (status || "").trim(),
    (location || "").trim(),
    (nome || "").trim(),
    (codigo || "").trim(),
  ].filter((p) => p !== "");
  return parts.join(" ").slice(0, 180);
}

// buildMensagem: human sentence for the reader, capped at 1200.
export function buildMensagem(input: {
  oldStatus?: string;
  newStatus: string;
  since: string;
  criticality?: string;
  category?: string;
  author?: string;
  note?: string;
}): string {
  const change = input.oldStatus && input.oldStatus !== input.newStatus
    ? `${input.oldStatus} → ${input.newStatus}`
    : `segue ${input.newStatus}`;
  const bits = [change + ` desde ${input.since}`];
  if (input.criticality) bits.push(`criticidade ${input.criticality}`);
  if (input.category) bits.push(`categoria ${input.category}`);
  if (input.author) bits.push(`por ${input.author}`);
  let text = bits.join(" · ");
  if (input.note) text += `. Nota: ${input.note}`;
  return text.slice(0, 1200);
}

export interface BuildAlertInput {
  barrierId: number;
  externalCode: string;
  tag: string;
  criticality: string;
  statusLabel: string;
  locationLabel: string;
  oldStatusLabel?: string;
  transitionDate: string;
  ocorridoEm: string;
  statusId: number;
  category?: string;
  author?: string;
  note?: string;
  companyId: number;
  link?: string;
  recipients: ProviderRecipient[];
}

// buildAlertPayload: pure builder; returns null when suppressed (planned
// stop). Messaging channel is attached only for the violada landing and
// only when at least one active recipient carries a phone number.
export function buildAlertPayload(
  input: BuildAlertInput,
): ProviderPayload | null {
  const mapping = mapLanding(input.statusId);
  if (!mapping.send) return null;
  const codigo = (input.externalCode || input.tag || "").slice(0, 60);
  const titulo = buildTitulo(
    input.criticality,
    input.statusLabel,
    input.locationLabel,
    input.tag,
    codigo,
  );
  const mensagem = buildMensagem({
    oldStatus: input.oldStatusLabel,
    newStatus: input.statusLabel,
    since: input.transitionDate.slice(0, 10),
    criticality: input.criticality,
    category: input.category,
    author: input.author,
    note: input.note,
  });
  if (!mensagem) return null;
  const emailDest = input.recipients
    .filter((r) => r.email.trim() !== "")
    .map((r) => ({
      canal: "email",
      valor: r.email.trim(),
      ...(r.name ? { nome: r.name } : {}),
    }));
  const msgDest = mapping.withMessaging
    ? input.recipients
      .filter((r) => (r.phone ?? "").trim() !== "")
      .map((r) => ({
        canal: "messaging",
        valor: (r.phone ?? "").trim(),
        ...(r.name ? { nome: r.name } : {}),
      }))
    : [];
  const destinatarios = [...emailDest, ...msgDest];
  if (destinatarios.length === 0) return null;
  const canais = mapping.withMessaging && msgDest.length > 0
    ? ["email", "messaging"]
    : ["email"];
  return {
    alerta_id: buildAlertaId(
      input.barrierId,
      input.transitionDate,
      input.statusId,
    ),
    company_id: input.companyId,
    situacao: mapping.situacao,
    barreira: {
      id: input.barrierId,
      codigo,
      nome: input.tag.slice(0, 160),
      local: input.locationLabel.slice(0, 160),
      tipo: input.criticality.slice(0, 60),
    },
    titulo,
    mensagem,
    ocorrido_em: input.ocorridoEm,
    ...(input.link ? { link: input.link } : {}),
    canais,
    destinatarios: destinatarios.slice(0, 50),
    dados_extra: {
      status_inventario: input.statusLabel,
      ...(input.category ? { categoria: input.category } : {}),
    },
    despachar_agora: mapping.despacharAgora,
  };
}

export interface TokenRotationNotice {
  usando: string;
  valido_ate?: string;
  mensagem?: string;
}

export interface ProviderAccept {
  ok: boolean;
  duplicado: boolean;
  parcial: boolean;
  evento_id?: number;
  correlation_id?: string;
  idempotency_key?: string;
  enfileirados: number;
  fila_ids: number[];
  por_canal: Record<string, number>;
  rejeitados: Array<{ canal?: string; valor?: string; motivo?: string }>;
  avisos: string[];
  aviso_token: TokenRotationNotice | null;
  mensagem: string;
}

export interface ProviderFailure extends Error {
  status: number;
  code?: string;
  retryable: boolean;
}

function failure(
  status: number,
  code: string | undefined,
  message: string,
): ProviderFailure {
  const err = new Error(message) as ProviderFailure;
  err.status = status;
  err.code = code;
  // 422 is content: retrying never fixes it. 401 means token changed:
  // notify a human, do not loop. 5xx + network are retryable.
  err.retryable = status === 0 || (status >= 500 && status <= 599);
  return err;
}

async function postJson(
  config: ProviderConfig,
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MSGFLOW-TOKEN": config.token,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({})) as Record<
      string,
      unknown
    >;
    return { status: res.status, json };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw failure(0, "timeout", "provider request timed out");
    }
    throw failure(
      0,
      "network",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}

function toAccept(json: Record<string, unknown>): ProviderAccept {
  return {
    ok: json["ok"] === true,
    duplicado: json["duplicado"] === true,
    parcial: json["parcial"] === true,
    evento_id: typeof json["evento_id"] === "number"
      ? json["evento_id"] as number
      : undefined,
    correlation_id: typeof json["correlation_id"] === "string"
      ? json["correlation_id"] as string
      : undefined,
    idempotency_key: typeof json["idempotency_key"] === "string"
      ? json["idempotency_key"] as string
      : undefined,
    enfileirados: typeof json["enfileirados"] === "number"
      ? json["enfileirados"] as number
      : 0,
    fila_ids: Array.isArray(json["fila_ids"])
      ? json["fila_ids"] as number[]
      : [],
    por_canal: (json["por_canal"] ?? {}) as Record<string, number>,
    rejeitados: Array.isArray(json["rejeitados"])
      ? json["rejeitados"] as ProviderAccept["rejeitados"]
      : [],
    avisos: Array.isArray(json["avisos"]) ? json["avisos"] as string[] : [],
    aviso_token: (json["aviso_token"] ?? null) as TokenRotationNotice | null,
    mensagem: typeof json["mensagem"] === "string"
      ? json["mensagem"] as string
      : "",
  };
}

// postAlert: one event, one call. Throws ProviderFailure; check .retryable.
export async function postAlert(
  config: ProviderConfig,
  payload: ProviderPayload,
  timeoutMs = 65_000,
): Promise<ProviderAccept> {
  const { status, json } = await postJson(
    config,
    "/internal/api/monitor/alertas",
    payload,
    timeoutMs,
  );
  if (status === 202 || status === 200) return toAccept(json);
  throw failure(
    status,
    typeof json["erro"] === "string" ? json["erro"] as string : undefined,
    typeof json["mensagem"] === "string"
      ? json["mensagem"] as string
      : `provider refused (${status})`,
  );
}

export async function pingProvider(
  config: ProviderConfig,
  timeoutMs = 15_000,
): Promise<{ ok: boolean; pronto: boolean; rotacao?: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl}/internal/api/monitor/ping`, {
      headers: { "X-MSGFLOW-TOKEN": config.token },
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({})) as Record<
      string,
      unknown
    >;
    return {
      ok: json["ok"] === true,
      pronto: (json["pronto"] as boolean) === true,
      rotacao: json["rotacao_de_token"] ?? json["rotacao"] ?? undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
