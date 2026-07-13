/**
 * ══════════════════════════════════════════════════════════════════════════
 * RESOLVE — converts wire (numeric-id) records into domain objects the UI uses
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { Barrier, StatusHistoryEntry } from './types';
import type { WireBarrier, WireStatusHistoryEntry, WireKpiSnapshot } from './wireTypes';
import type { KpiSnapshot } from './types';
import {
  fromLocationId, fromDisponibilidadeId, fromCriticidadeId,
  fromCategoriaId, fromAgrupamentoId, fromTipologiaId,
  fromDonoId, fromLocDescId, fromAuthorId,
} from './enums';
import { isConforme } from './constants';

export function resolveHistoryEntry(w: WireStatusHistoryEntry): StatusHistoryEntry {
  return {
    date:   w.date,
    status: fromDisponibilidadeId(w.statusId),
    author: fromAuthorId(w.authorId),
    note:   w.note,
  };
}

export function resolveBarrier(w: WireBarrier): Barrier {
  const disponibilidade = fromDisponibilidadeId(w.disponibilidadeId);
  return {
    id:              w.id,
    tag:             w.tag,
    tipologia:       fromTipologiaId(w.tipologiaId),
    instalacao:      fromLocationId(w.locationId),
    locDesc:         fromLocDescId(w.locDescId),
    criticidade:     fromCriticidadeId(w.criticidadeId),
    categoria:       fromCategoriaId(w.categoriaId),
    agrupamento:     fromAgrupamentoId(w.agrupamentoId),
    dono:            fromDonoId(w.donoId),
    disponibilidade,
    // Conformidade is always DERIVED from disponibilidade — never trusted
    // from the wire — so the two values can never disagree.
    conformidade:    isConforme(disponibilidade) ? 'Conforme' : 'Não Conforme',
    comentarios:     w.comentarios,
    planoAcao:       w.planoAcao,
    statusSince:     w.statusSince,
    statusHistory:   w.statusHistory.map(resolveHistoryEntry),
  };
}

export function resolveBarriers(items: WireBarrier[]): Barrier[] {
  return items.map(resolveBarrier);
}

/** KPI snapshots are already numeric on the wire — pass-through with type narrowing */
export function resolveKpi(w: WireKpiSnapshot): KpiSnapshot {
  return { ...w };
}
