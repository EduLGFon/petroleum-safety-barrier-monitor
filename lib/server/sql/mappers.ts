// Barrier row mappers - DB rows to wire contract plus shared SELECT fragments.
// This is why it exists: single place for column list, history join and row
// mapping so list/get stay consistent with no drift.
import type { WireBarrier } from "../../wireTypes.ts";

// Row shape returned by the shared SELECT.
export interface BarrierRow {
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

export interface HistoryEntry {
  date: string;
  statusId: number;
  authorId: number;
  note: string;
}

// Normalizes DB json (array or string) to HistoryEntry[]; [] on garbage.
export function toHistory(value: unknown): HistoryEntry[] {
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

// Maps a BarrierRow to the WireBarrier contract.
export function toWireBarrier(r: BarrierRow): WireBarrier {
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
export const SELECT_COLUMNS = `
  b.id, b.tag, b.tipologia_id, b.location_id, b.loc_desc_id, b.criticidade_id,
  b.categoria_id, b.agrupamento_id, coalesce(b.dono_id, -1) as dono_id,
  b.disponibilidade_id, b.comentarios, b.plano_acao,
  to_char(b.status_since, 'YYYY-MM-DD') as status_since,
  coalesce(h.history, '[]'::json) as status_history
`;

export const HISTORY_JOIN = `
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
