// Barriers repository - every SQL statement the API routes need.
// This is why it exists: single place for barrier queries against the
// Deno-native pool. All values are bound as $1/$2 args; ORDER BY uses a
// fixed whitelist so client input can never become SQL.
import type {
  BarriersQuery,
  BarriersResponse,
  WireBarrier,
  WireKpiSnapshot,
} from "../../wireTypes.ts";
import { queryRows } from "../db.ts";

// Maps frontend SortableColumn values (lib/types.ts) to fixed SQL.
// Never derive this from user input.
const SORTABLE: Record<string, string> = {
  id: "b.id",
  tag: "b.tag",
  criticidade: "b.criticidade_id",
  categoria: "b.categoria_id",
  disponibilidade: "b.disponibilidade_id",
  conformidade: "b.conformidade_id",
  statusSince: "b.status_since",
};

function resolveOrderBy(sortCol?: string, sortDir?: string): string {
  const col = SORTABLE[sortCol ?? "id"] ?? SORTABLE.id;
  const dir = sortDir === "desc" ? "desc" : "asc";
  // Safe: both parts come from fixed strings above and a two-value check.
  return `${col} ${dir}`;
}

// Row shape returned by the shared SELECT.
interface BarrierRow {
  id: number;
  tag: string;
  tipologia_id: number;
  location_id: number;
  loc_desc_id: number;
  criticidade_id: number;
  categoria_id: number;
  agrupamento_id: number;
  dono_id: number; // coalesced to -1 in SQL when NULL
  disponibilidade_id: number;
  comentarios: string;
  plano_acao: string;
  status_since: string; // YYYY-MM-DD via to_char
  status_history: unknown; // json array (parsed object or string)
}

interface HistoryEntry {
  date: string;
  statusId: number;
  authorId: number;
  note: string;
}

function toHistory(value: unknown): HistoryEntry[] {
  if (Array.isArray(value)) return value as HistoryEntry[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toWireBarrier(r: BarrierRow): WireBarrier {
  return {
    id: r.id,
    tag: r.tag,
    tipologiaId: r.tipologia_id,
    locationId: r.location_id,
    locDescId: r.loc_desc_id,
    criticidadeId: r.criticidade_id,
    categoriaId: r.categoria_id,
    agrupamentoId: r.agrupamento_id,
    donoId: r.dono_id,
    disponibilidadeId: r.disponibilidade_id,
    comentarios: r.comentarios,
    planoAcao: r.plano_acao,
    statusSince: r.status_since,
    statusHistory: toHistory(r.status_history),
  };
}

// Shared column list + lateral history aggregation (one row per barrier).
const SELECT_COLUMNS = `
  b.id, b.tag, b.tipologia_id, b.location_id, b.loc_desc_id, b.criticidade_id,
  b.categoria_id, b.agrupamento_id, coalesce(b.dono_id, -1) as dono_id,
  b.disponibilidade_id, b.comentarios, b.plano_acao,
  to_char(b.status_since, 'YYYY-MM-DD') as status_since,
  coalesce(h.history, '[]'::json) as status_history
`;

const HISTORY_JOIN = `
  left join lateral (
    select json_agg(
      json_build_object(
        'date',     to_char(bsh.date, 'YYYY-MM-DD'),
        'statusId', bsh.status_id,
        'authorId', bsh.author_id,
        'note',     bsh.note
      ) order by bsh.date asc
    ) as history
    from barrier_status_history bsh
    where bsh.barrier_id = b.id
  ) h on true
`;

// Builds WHERE text plus bound args. Placeholders are numbered from $1.
function buildWhere(q: BarriersQuery): { text: string; args: unknown[] } {
  const conds: string[] = [];
  const args: unknown[] = [];
  const push = (text: string, value: unknown) => {
    args.push(value);
    conds.push(`${text}$${args.length}`);
  };
  if (q.locationId !== undefined && q.locationId !== 0) {
    push("and b.location_id = ", q.locationId);
  }
  if (q.disponibilidadeId !== undefined) {
    push("and b.disponibilidade_id = ", q.disponibilidadeId);
  }
  if (q.conformidadeId !== undefined) {
    push("and b.conformidade_id = ", q.conformidadeId);
  }
  if (q.categoriaId !== undefined) {
    push("and b.categoria_id = ", q.categoriaId);
  }
  if (q.query) {
    args.push(`%${q.query}%`, `%${q.query}%`);
    const a = args.length - 1;
    const b = args.length;
    conds.push(`and (b.tag ilike $${a} or loc.code ilike $${b})`);
  }
  return {
    text: conds.length > 0 ? `where true ${conds.join(" ")}` : "",
    args,
  };
}

export async function listBarriers(
  q: BarriersQuery,
): Promise<BarriersResponse> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100_000, Math.max(1, q.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const where = buildWhere(q);
  const orderBy = resolveOrderBy(q.sortCol, q.sortDir);
  const limitIdx = where.args.length + 1;
  const offsetIdx = where.args.length + 2;

  const [rows, countRows] = await Promise.all([
    queryRows<BarrierRow>(
      `select ${SELECT_COLUMNS} from barriers b
       join locations loc on loc.id = b.location_id
       ${HISTORY_JOIN} ${where.text}
       order by ${orderBy} limit $${limitIdx} offset $${offsetIdx}`,
      [...where.args, pageSize, offset],
    ),
    queryRows<{ count: string }>(
      `select count(*)::text as count from barriers b
       join locations loc on loc.id = b.location_id ${where.text}`,
      where.args,
    ),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  return {
    items: rows.map(toWireBarrier),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getBarrierById(id: number): Promise<WireBarrier | null> {
  const rows = await queryRows<BarrierRow>(
    `select ${SELECT_COLUMNS} from barriers b
     ${HISTORY_JOIN} where b.id = $1`,
    [id],
  );
  return rows[0] ? toWireBarrier(rows[0]) : null;
}

export async function getKpi(locationId?: number): Promise<WireKpiSnapshot> {
  const scoped = locationId !== undefined && locationId !== 0;
  const rows = await queryRows<{
    total: string;
    disponivel: string;
    fora_de_op: string;
    indisp_cont: string;
    degr_cont: string;
    degradado: string;
    indisponivel: string;
    conforme: string;
    nao_conforme: string;
    criticas_nc: string;
  }>(
    `select
       count(*)::text as total,
       count(*) filter (where b.disponibilidade_id = 0)::text as disponivel,
       count(*) filter (where b.disponibilidade_id = 1)::text as fora_de_op,
       count(*) filter (where b.disponibilidade_id = 2)::text as indisp_cont,
       count(*) filter (where b.disponibilidade_id = 3)::text as degr_cont,
       count(*) filter (where b.disponibilidade_id = 4)::text as degradado,
       count(*) filter (where b.disponibilidade_id = 5)::text as indisponivel,
       count(*) filter (where b.conformidade_id = 0)::text as conforme,
       count(*) filter (where b.conformidade_id = 1)::text as nao_conforme,
       count(*) filter (where b.conformidade_id = 1 and b.criticidade_id = 1)::text as criticas_nc
     from barriers b ${scoped ? "where b.location_id = $1" : ""}`,
    scoped ? [locationId] : [],
  );

  const r = rows[0];
  const total = Number(r?.total ?? 0);
  const conforme = Number(r?.conforme ?? 0);

  return {
    total,
    disponivel: Number(r?.disponivel ?? 0),
    foraDeOp: Number(r?.fora_de_op ?? 0),
    indispCont: Number(r?.indisp_cont ?? 0),
    degrCont: Number(r?.degr_cont ?? 0),
    degradado: Number(r?.degradado ?? 0),
    indisponivel: Number(r?.indisponivel ?? 0),
    conforme,
    naoConforme: Number(r?.nao_conforme ?? 0),
    criticasNC: Number(r?.criticas_nc ?? 0),
    pctConforme: total > 0 ? Math.round((conforme / total) * 100) : 0,
  };
}

// The one write path: calls record_status_change() (see db/schema.sql),
// which updates disponibilidade_id + status_since and appends history.
// Never UPDATE disponibilidade_id directly from application code.
export async function transitionBarrierStatus(
  barrierId: number,
  statusId: number,
  authorId: number,
  note = "",
): Promise<WireBarrier | null> {
  await queryRows("select record_status_change($1, $2, $3, $4)", [
    barrierId,
    statusId,
    authorId,
    note,
  ]);
  return getBarrierById(barrierId);
}
