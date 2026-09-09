// Deterministic mock WireBarrier dataset generator with cache - split from lib/data.ts to keep files small; why: assembles the full mock API payload from rng/tags/history pieces.
import {
  AGRUPAMENTO_CODES,
  CATEGORIA_CODES,
  DONO_CODES,
  LOC_DESC_CODES,
  TIPOLOGIA_CODES,
} from "../enums.ts";
import { ACTION_PLANS, COMMENTS, generateHistory } from "./history.ts";
import { LOCATION_DIST_BY_ID } from "../constants.ts";
import type { WireBarrier } from "../wireTypes.ts";
import { createRng } from "./rng.ts";
import { buildTag } from "./tags.ts";

// ─── Status distribution (id-keyed) ──────────────────────────────────────
// 0=Disponível 1=Fora de Op. 2=Indisp.Cont. 3=Degr.Cont. 4=Degradado 5=Indisponível

const STATUS_DIST: [number, number][] = [
  [0, 0.52],
  [1, 0.14],
  [2, 0.08],
  [3, 0.07],
  [4, 0.12],
  [5, 0.07],
];
export { STATUS_DIST };

// Picks a status id from STATUS_DIST cumulative probabilities.
export function pickStatusId(r: number): number {
  let cum = 0;
  for (const [id, p] of STATUS_DIST) {
    cum += p;
    if (r < cum) return id;
  }
  return 0;
}

// ─── Generator ────────────────────────────────────────────────────────────

let _cache: WireBarrier[] | null = null;

// Generates (once, cached) the deterministic mock WireBarrier[] dataset.
export function getWireBarriers(): WireBarrier[] {
  if (_cache) return _cache;

  const rng = createRng(0xdeadbeef);
  const barriers: WireBarrier[] = [];
  let id = 1;

  const catCount = Object.keys(CATEGORIA_CODES).length;
  const tipoCount = Object.keys(TIPOLOGIA_CODES).length;
  const agrCount = Object.keys(AGRUPAMENTO_CODES).length;
  const donoCount = Object.keys(DONO_CODES).length;
  const locDescCount = Object.keys(LOC_DESC_CODES).length;

  for (const loc of LOCATION_DIST_BY_ID) {
    const locCode = loc.code; // e.g. 'FAL' — used only for TAG text, not stored

    for (let i = 0; i < loc.count; i++) {
      const catId = rng.int(0, catCount);
      const dispId = pickStatusId(rng.next());
      const { history, statusSince } = generateHistory(rng, dispId);

      const hasDono = rng.bool(0.65);
      const isNC = ![0, 1, 2, 3].includes(dispId); // matches isConforme logic by id
      const hasAction = isNC && rng.bool(0.4);

      barriers.push({
        id,
        tag: buildTag(catId, rng, locCode),
        tipologiaId: rng.int(0, tipoCount),
        locationId: loc.id,
        locDescId: rng.int(0, locDescCount),
        criticidadeId: rng.bool(0.78) ? 1 : 0, // 1=Crítica 0=Não Crítica
        categoriaId: catId,
        agrupamentoId: rng.int(0, agrCount),
        donoId: hasDono ? rng.int(0, donoCount) : -1,
        disponibilidadeId: dispId,
        comentarios: rng.bool(0.15) ? rng.pick(COMMENTS) : "",
        planoAcao: hasAction ? rng.pick(ACTION_PLANS) : "",
        statusSince,
        statusHistory: history,
      });
      id++;
    }
  }

  _cache = barriers;
  return barriers;
}
