/**
 * ══════════════════════════════════════════════════════════════════════════
 * RESOLVE — converts wire (numeric-id) records into domain objects the UI uses
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  fromAgrupamentoId,
  fromAuthorId,
  fromCategoriaId,
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

export function resolveBarriers(items: WireBarrier[]): Barrier[] {
  return items.map(resolveBarrier);
}

/** KPI snapshots are already numeric on the wire — pass-through with type narrowing.
 *  Dynamic buckets ride along untouched when a future backend sends them. */
export function resolveKpi(w: WireKpiSnapshot): KpiSnapshot {
  const { byDisponibilidade, byConformidade, byCriticidade, ...fixed } = w as
    & WireKpiSnapshot
    & Partial<KpiSnapshot>;
  return {
    ...fixed,
    ...(byDisponibilidade ? { byDisponibilidade } : {}),
    ...(byConformidade ? { byConformidade } : {}),
    ...(byCriticidade ? { byCriticidade } : {}),
  };
}
