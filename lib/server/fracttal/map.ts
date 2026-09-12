// Fracttal -> app barrier mapping (P3). Pure label-to-id resolution.
// This is why it exists: upstream rows arrive as taxonomy labels, but the DB
// contract is numeric enum ids (lib/enums.ts). The mapper resolves labels
// exactly and SKIPS (with a reason) anything unmapped — never guesses a
// plausible id — per the mapped/unmapped discipline set in docs/FRACTTAL.md.
import type { FracttalAsset } from "./types.ts";

// DISPONIBILIDADE_INDISPONIVEL / DISPONIVEL: reference the two stable ids the
// provisional availablity rule can emit (docs/FRACTTAL.md mapping draft).
export const DISPONIBILIDADE_DISPONIVEL = 0;
export const DISPONIBILIDADE_INDISPONIVEL = 5;

// IMPORT_DEFAULTS: fields Fracttal does not carry, given stable documented
// application defaults (review team decision, not silent guess).
export const IMPORT_DEFAULTS = {
  tipologiaId: 3, // 'Base Operacional'
  agrupamentoId: 0, // 'Sistemas de Alívio'
  locDescId: 0, // 'Próx. ao Separador de Teste'
  donoId: null as number | null,
};

// MapContext: label -> numeric id lookups. The sync service builds these
// from the seeded lookup tables; tests inject fixtures.
export interface MapContext {
  locationIds: Record<string, number>;
  categoriaIds: Record<string, number>;
  criticidadeIds: Record<string, number>;
}

// SyncBarrierInput: one fully-resolved row ready for the upsert planner.
export interface SyncBarrierInput {
  externalCode: string;
  tag: string;
  locationId: number;
  tipologiaId: number;
  locDescId: number;
  criticidadeId: number;
  categoriaId: number;
  agrupamentoId: number;
  donoId: number | null;
  disponibilidadeId: number;
  comentarios: string;
  planoAcao: string;
  sourceUpdatedAt: string | null;
}

export type MappedRow =
  | { ok: true; input: SyncBarrierInput }
  | { ok: false; reason: string };

// disponibilidadeFromAsset: provisional rule — an asset not available is
// 'Indisponível', otherwise 'Disponível'. Contingent/degraded buckets need a
// secondary signal (work orders) and are UNMAPPED for now.
export function disponibilidadeFromAsset(a: FracttalAsset): number {
  return a.available === false
    ? DISPONIBILIDADE_INDISPONIVEL
    : DISPONIBILIDADE_DISPONIVEL;
}

// mapAsset: resolve one upstream row to a SyncBarrierInput, or a skip reason.
export function mapAsset(asset: FracttalAsset, ctx: MapContext): MappedRow {
  const code = (asset.code ?? "").trim();
  if (code === "") return { ok: false, reason: "empty external_code" };

  const locationCode = (asset.location_code ?? "").trim().toUpperCase();
  const locationId = locationCode !== ""
    ? ctx.locationIds[locationCode]
    : undefined;
  if (locationId === undefined) {
    return {
      ok: false,
      reason: `unknown location '${locationCode || "<none>"}'`,
    };
  }

  // Categoria: prefer the most specific groups_1 label (tenant taxonomy);
  // fall back to groups_description. Unknown labels are listed, not forced.
  const categoriaLabel =
    (asset.groups_1_description ?? asset.groups_description ?? "")
      .trim();
  const categoriaId = categoriaLabel !== ""
    ? ctx.categoriaIds[categoriaLabel]
    : undefined;
  if (categoriaId === undefined) {
    return { ok: false, reason: `unmapped categoria '${categoriaLabel}'` };
  }

  // Criticidade: 'Crítico'/'Não Crítica' exact labels; anything else skips.
  const prioridadeLabel = (asset.priorities_description ?? "").trim();
  const criticidadeId = prioridadeLabel !== ""
    ? ctx.criticidadeIds[prioridadeLabel]
    : undefined;
  if (criticidadeId === undefined) {
    return { ok: false, reason: `unmapped criticidade '${prioridadeLabel}'` };
  }

  return {
    ok: true,
    input: {
      externalCode: code,
      tag: code, // upstream code doubles as the display tag initially
      locationId,
      tipologiaId: IMPORT_DEFAULTS.tipologiaId,
      locDescId: IMPORT_DEFAULTS.locDescId,
      criticidadeId,
      categoriaId,
      agrupamentoId: IMPORT_DEFAULTS.agrupamentoId,
      donoId: IMPORT_DEFAULTS.donoId,
      disponibilidadeId: disponibilidadeFromAsset(asset),
      comentarios: "",
      planoAcao: "",
      sourceUpdatedAt: null,
    },
  };
}
