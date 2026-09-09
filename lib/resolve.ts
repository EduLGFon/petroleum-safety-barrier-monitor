/**
 * ══════════════════════════════════════════════════════════════════════════
 * RESOLVE — converts wire (numeric-id) records into domain objects the UI uses
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  fromAgrupamentoId,
  fromAuthorId,
  fromCategoriaId,
  fromConformidadeId,
  fromCriticidadeId,
  fromDisponibilidadeId,
  fromDonoId,
  fromLocationId,
  fromLocDescId,
  fromTipologiaId,
} from "./enums.ts";
import type {
  WireBarrier,
  WireKpiSnapshot,
  WireStatusHistoryEntry,
} from "./wireTypes.ts";
import type { Barrier, StatusHistoryEntry } from "./types.ts";
import type { KpiSnapshot } from "./types.ts";
import { isConforme } from "./constants.ts";

// Maps a wire history entry's numeric IDs to display strings; date/note pass through unchanged.
export function resolveHistoryEntry(
  w: WireStatusHistoryEntry,
): StatusHistoryEntry {
  return {
    date: w.date,
    status: fromDisponibilidadeId(w.statusId),
    author: fromAuthorId(w.authorId),
    note: w.note,
  };
}

// Maps wire numeric IDs to Barrier strings; conformidade is derived from disponibilidade, never trusted from wire.
export function resolveBarrier(w: WireBarrier): Barrier {
  const disponibilidade = fromDisponibilidadeId(w.disponibilidadeId);
  return {
    id: w.id,
    tag: w.tag,
    tipologia: fromTipologiaId(w.tipologiaId),
    instalacao: fromLocationId(w.locationId),
    locDesc: fromLocDescId(w.locDescId),
    criticidade: fromCriticidadeId(w.criticidadeId),
    categoria: fromCategoriaId(w.categoriaId),
    agrupamento: fromAgrupamentoId(w.agrupamentoId),
    dono: fromDonoId(w.donoId),
    disponibilidade,
    // Conformidade is always DERIVED from disponibilidade — never trusted
    // from the wire — so the two values can never disagree.
    conformidade: isConforme(disponibilidade) ? "Conforme" : "Não Conforme",
    comentarios: w.comentarios,
    planoAcao: w.planoAcao,
    statusSince: w.statusSince,
    statusHistory: w.statusHistory.map(resolveHistoryEntry),
  };
}

// Maps a wire array to Barrier[] via resolveBarrier; preserves order, empty in → empty out.
export function resolveBarriers(items: WireBarrier[]): Barrier[] {
  return items.map(resolveBarrier);
}

/** KPI snapshots are already numeric on the wire — pass-through with type narrowing.
 *  Dynamic buckets arrive keyed by numeric id (as string) and are translated
 *  to display-string keys here; already-string keys pass through untouched
 *  for backward compat. syncedAt rides along when present. */
export function resolveKpi(w: WireKpiSnapshot): KpiSnapshot {
  const {
    byDisponibilidade,
    byConformidade,
    byCriticidade,
    syncedAt,
    ...fixed
  } = w as WireKpiSnapshot & Partial<KpiSnapshot>;
  // Translates one numeric-id-keyed bucket to display-string keys.
  // Non-numeric keys are kept as-is so old servers keep working.
  const mapBucket = (
    bucket: Record<string, number> | undefined,
    fromId: (id: number) => string,
  ): Record<string, number> | undefined => {
    if (!bucket) return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(bucket)) {
      const n = Number(k);
      const label = k !== "" && Number.isInteger(n) ? fromId(n) : k;
      out[label] = (out[label] ?? 0) + v;
    }
    return out;
  };
  return {
    ...fixed,
    ...(byDisponibilidade
      ? {
        byDisponibilidade: mapBucket(byDisponibilidade, fromDisponibilidadeId),
      }
      : {}),
    ...(byConformidade
      ? { byConformidade: mapBucket(byConformidade, fromConformidadeId) }
      : {}),
    ...(byCriticidade
      ? { byCriticidade: mapBucket(byCriticidade, fromCriticidadeId) }
      : {}),
    ...(syncedAt ? { syncedAt } : {}),
  };
}
