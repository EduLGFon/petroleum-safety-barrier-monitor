// Barrier row mappers - DB rows to wire contract plus shared SELECT fragments.
// This is why it exists: single place for column list, history join and row
// mapping so list/get stay consistent with no drift.
import type { WireBarrier } from "../../wireTypes.ts";

// Row shape returned by the shared SELECT.
export interface BarrierRow {
  id: number;
  tag: string;
  typology_id: number;
  location_id: number;
  loc_desc_id: number;
  criticality_id: number;
  category_id: number;
  grouping_id: number;
  owner_id: number; // coalesced to -1 in SQL when NULL
  availability_id: number;
  comments: string;
  action_plan: string;
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
    typologyId: r.typology_id,
    locationId: r.location_id,
    locDescId: r.loc_desc_id,
    criticalityId: r.criticality_id,
    categoryId: r.category_id,
    groupingId: r.grouping_id,
    ownerId: r.owner_id,
    availabilityId: r.availability_id,
    comments: r.comments,
    actionPlan: r.action_plan,
    statusSince: r.status_since,
    statusHistory: toHistory(r.status_history),
  };
}

// Shared column list + lateral history aggregation (one row per barrier).
export const SELECT_COLUMNS = `
  b.id, b.tag, b.typology_id, b.location_id, b.loc_desc_id, b.criticality_id,
  b.category_id, b.grouping_id, coalesce(b.owner_id, -1) as owner_id,
  b.availability_id, b.comments, b.action_plan,
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
