/**
 * ══════════════════════════════════════════════════════════════════════════
 * MOCK DATA SOURCE — generates deterministic WireBarrier[] records
 * ══════════════════════════════════════════════════════════════════════════
 * This simulates what a real backend database would return: rows keyed by
 * numeric ids (see lib/enums.ts), never display strings. Swap this file for
 * a real HTTP fetch and nothing else in the app needs to change — the
 * contract is `WireBarrier[]`, resolved later by lib/resolve.ts.
 */

import type { WireBarrier, WireStatusHistoryEntry } from './wireTypes';
import type { Disponibilidade } from './types';
import { LOCATION_DIST_BY_ID, SIM_DATE } from './constants';
import {
  toLocationId, toCategoriaId, toAgrupamentoId, toTipologiaId,
  toDonoId, toLocDescId, toAuthorId, toDisponibilidadeId,
  CATEGORIA_CODES, TIPOLOGIA_CODES, AGRUPAMENTO_CODES,
  DONO_CODES, LOC_DESC_CODES, AUTHOR_CODES,
} from './enums';
import { isConforme } from './constants';

// ─── Seeded PRNG ──────────────────────────────────────────────────────────

function createRng(seed: number) {
  let s = seed >>> 0;
  const next = (): number => {
    s = Math.imul(s ^ (s >>> 13), s | 7) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = Math.imul(s ^ (s >>> 5),  s | 3) >>> 0;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    int:  (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo)),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
  };
}
type Rng = ReturnType<typeof createRng>;

// ─── TAG prefixes per category (display-level constant, not an enum-worthy domain) ──

const TAG_PREFIX: Record<string,string> = {
  'Válvula de Alívio de Pressão':'PSV','Alarmes de Emergência e Sirene':'OA',
  'Sistema de Detecção de Gás':'GD','Sistema de Combate a Incêndio':'FW',
  'Válvula de Bloqueio de Emergência':'EBV','Sistema de Intertravamento (SIS)':'SIS',
  'Detector de Fumaça':'FD','Dispositivo de Corte de Energia':'ESD',
  'Sistema de Ventilação de Emergência':'VE','Detector de H₂S':'H2S',
};

function buildTag(catId: number, rng: Rng, locCode: string): string {
  const catName = CATEGORIA_CODES[catId];
  const prefix  = TAG_PREFIX[catName] ?? 'B';
  const num     = String(rng.int(1000, 9999));
  const suffix  = rng.pick(['A','B','C',''] as const);
  return suffix ? `${prefix}-${num}-${locCode}-${suffix}` : `${prefix}-${num}-${locCode}`;
}

function addDays(b: Date, d: number): Date { const x = new Date(b); x.setDate(x.getDate()+d); return x; }
function fmtISO(d: Date): string { return d.toISOString().split('T')[0]; }

// ─── Status distribution (id-keyed) ──────────────────────────────────────
// 0=Disponível 1=Fora de Op. 2=Indisp.Cont. 3=Degr.Cont. 4=Degradado 5=Indisponível

const STATUS_DIST: [number, number][] = [
  [0, 0.52], [1, 0.14], [2, 0.08], [3, 0.07], [4, 0.12], [5, 0.07],
];

function pickStatusId(r: number): number {
  let cum = 0;
  for (const [id, p] of STATUS_DIST) { cum += p; if (r < cum) return id; }
  return 0;
}

const HISTORY_NOTES_BY_STATUS_ID: Record<number, readonly string[]> = {
  0: [
    'Equipamento retornou ao serviço após manutenção corretiva.',
    'Inspeção de rotina concluída — dentro dos parâmetros operacionais.',
    'Comissionamento realizado com sucesso pela equipe técnica.',
  ],
  1: [
    'Parada programada para manutenção preventiva.',
    'Isolamento para execução de trabalho seguro na vizinhança.',
    'Aguardando janela de manutenção na próxima parada geral.',
  ],
  2: [
    'Plano de contingência ativado — operação via sistema redundante.',
    'Indisponibilidade contingenciada conforme procedimento operacional.',
    'Contingência definida pelo time de engenharia. Monitoramento intensificado.',
  ],
  3: [
    'Degradação controlada com contingência ativa. Peça em pedido.',
    'Atuador com resposta lenta — contingência ativada conforme procedimento.',
    'Sensor fora da faixa. Contingência operacional aplicada.',
  ],
  4: [
    'Leitura instável detectada em inspeção de campo. Sem contingência definida.',
    'Sinal intermitente registrado. Monitoramento intensificado.',
    'Falha parcial identificada. Equipe de instrumentação notificada.',
  ],
  5: [
    'Falha total. Aguardando peça sobressalente para reparo.',
    'Intertravamento ativado por falha de segurança. Sem contingência.',
    'Bloqueio de emergência ativado. Análise de causa raiz em andamento.',
  ],
};

const COMMENTS = [
  'Aguardando aprovação para manutenção programada.',
  'Inspeção realizada em campo — peça em pedido ao almoxarifado.',
  'Leitura instável nas últimas 48h. Monitorando.',
] as const;

const ACTION_PLANS = [
  'Substituição programada para próxima janela de manutenção.',
  'Solicitação de compra emitida — OS #47221.',
  'Aguardando liberação da área para intervenção corretiva.',
  'Avaliação de risco em andamento pelo time de engenharia.',
] as const;

// ─── History generation (id-keyed statuses/authors) ──────────────────────

function generateHistory(rng: Rng, currentStatusId: number): { history: WireStatusHistoryEntry[]; statusSince: string } {
  const numEntries = rng.int(2, 5);
  const spanDays   = rng.int(120, 400);
  const stepDays   = Math.floor(spanDays / numEntries);
  let cursor = addDays(SIM_DATE, -spanDays);

  const allIds = STATUS_DIST.map(([id]) => id);
  const entries: WireStatusHistoryEntry[] = [];

  let prevId = rng.pick([0, 0, 1]); // mostly starts Disponível/Fora de Op.

  for (let i = 0; i < numEntries - 1; i++) {
    entries.push({
      date:     fmtISO(cursor),
      statusId: prevId,
      authorId: rng.int(0, Object.keys(AUTHOR_CODES).length),
      note:     rng.pick(HISTORY_NOTES_BY_STATUS_ID[prevId] ?? HISTORY_NOTES_BY_STATUS_ID[0]),
    });
    cursor = addDays(cursor, rng.int(stepDays-10, stepDays+20));
    prevId = rng.pick(allIds.filter(id => id !== prevId));
  }

  const since = addDays(SIM_DATE, -rng.int(3, 90));
  const statusSince = fmtISO(since);

  entries.push({
    date:     statusSince,
    statusId: currentStatusId,
    authorId: rng.int(0, Object.keys(AUTHOR_CODES).length),
    note:     rng.pick(HISTORY_NOTES_BY_STATUS_ID[currentStatusId] ?? HISTORY_NOTES_BY_STATUS_ID[0]),
  });

  entries.sort((a,b) => a.date.localeCompare(b.date));
  return { history: entries, statusSince };
}

// ─── Generator ────────────────────────────────────────────────────────────

let _cache: WireBarrier[] | null = null;

export function getWireBarriers(): WireBarrier[] {
  if (_cache) return _cache;

  const rng = createRng(0xdeadbeef);
  const barriers: WireBarrier[] = [];
  let id = 1;

  const catCount = Object.keys(CATEGORIA_CODES).length;
  const tipoCount = Object.keys(TIPOLOGIA_CODES).length;
  const agrCount  = Object.keys(AGRUPAMENTO_CODES).length;
  const donoCount = Object.keys(DONO_CODES).length;
  const locDescCount = Object.keys(LOC_DESC_CODES).length;

  for (const loc of LOCATION_DIST_BY_ID) {
    const locCode = loc.code; // e.g. 'FAL' — used only for TAG text, not stored

    for (let i = 0; i < loc.count; i++) {
      const catId  = rng.int(0, catCount);
      const dispId = pickStatusId(rng.next());
      const { history, statusSince } = generateHistory(rng, dispId);

      const hasDono   = rng.bool(0.65);
      const isNC      = ![0,1,2,3].includes(dispId); // matches isConforme logic by id
      const hasAction = isNC && rng.bool(0.4);

      barriers.push({
        id,
        tag:               buildTag(catId, rng, locCode),
        tipologiaId:       rng.int(0, tipoCount),
        locationId:        loc.id,
        locDescId:         rng.int(0, locDescCount),
        criticidadeId:     rng.bool(0.78) ? 1 : 0,  // 1=Crítica 0=Não Crítica
        categoriaId:       catId,
        agrupamentoId:     rng.int(0, agrCount),
        donoId:            hasDono ? rng.int(0, donoCount) : -1,
        disponibilidadeId: dispId,
        comentarios:       rng.bool(0.15) ? rng.pick(COMMENTS) : '',
        planoAcao:         hasAction ? rng.pick(ACTION_PLANS) : '',
        statusSince,
        statusHistory:     history,
      });
      id++;
    }
  }

  _cache = barriers;
  return barriers;
}
