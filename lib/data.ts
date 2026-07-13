import type { Barrier, Disponibilidade, Conformidade, StatusHistoryEntry } from './types';
import {
  LOCATION_DIST, CATEGORIES, AGRUPAMENTOS, TIPOLOGIAS,
  DONOS, LOC_DESCS, AUTHORS, HISTORY_NOTES, COMMENTS, ACTION_PLANS, SIM_DATE,
} from './constants';

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────

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
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
  };
}

type Rng = ReturnType<typeof createRng>;

// ─── TAG prefix per category ──────────────────────────────────────────────────

const TAG_PREFIX: Record<string, string> = {
  'Válvula de Alívio de Pressão':       'PSV',
  'Alarmes de Emergência e Sirene':     'OA',
  'Sistema de Detecção de Gás':         'GD',
  'Sistema de Combate a Incêndio':      'FW',
  'Válvula de Bloqueio de Emergência':  'EBV',
  'Sistema de Intertravamento (SIS)':   'SIS',
  'Detector de Fumaça':                 'FD',
  'Dispositivo de Corte de Energia':    'ESD',
  'Sistema de Ventilação de Emergência':'VE',
  'Detector de H₂S':                   'H2S',
};

function buildTag(cat: string, rng: Rng, locCode: string): string {
  const prefix  = TAG_PREFIX[cat] ?? 'B';
  const num     = String(rng.int(1000, 9999));
  const suffix  = rng.pick(['A', 'B', 'C', 'D', ''] as const);
  return suffix ? `${prefix}-${num}-${locCode}-${suffix}` : `${prefix}-${num}-${locCode}`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Status history generation ────────────────────────────────────────────────

function generateHistory(
  rng: Rng,
  currentStatus: Disponibilidade,
): { history: StatusHistoryEntry[]; degradedSince?: string; lastContingency?: string } {
  const numEntries = rng.int(2, 5);

  // Work backwards from SIM_DATE
  // Most recent event: 3–60 days ago
  const mostRecentDate = addDays(SIM_DATE, -rng.int(3, 60));

  // Oldest event: 180–400 days ago
  const spanDays = rng.int(180, 400);
  let cursor     = addDays(SIM_DATE, -spanDays);

  const allStatuses: Disponibilidade[] = ['Disponível', 'Fora de Operação', 'Degradada', 'Em Manutenção'];

  const entries: StatusHistoryEntry[] = [];

  // Generate intermediate entries (not current)
  let prevStatus: Disponibilidade = rng.pick(['Disponível', 'Disponível', 'Fora de Operação'] as const);
  const stepDays = Math.floor(spanDays / numEntries);

  for (let i = 0; i < numEntries - 1; i++) {
    entries.push({
      date:   formatDate(cursor),
      status: prevStatus,
      author: rng.pick(AUTHORS),
      note:   rng.pick(HISTORY_NOTES[prevStatus] ?? HISTORY_NOTES['Disponível']),
    });
    cursor     = addDays(cursor, rng.int(stepDays - 10, stepDays + 30));
    prevStatus = rng.pick(allStatuses.filter(s => s !== prevStatus) as Disponibilidade[]);
  }

  // Final (most recent) entry = current status
  entries.push({
    date:   formatDate(mostRecentDate),
    status: currentStatus,
    author: rng.pick(AUTHORS),
    note:   rng.pick(HISTORY_NOTES[currentStatus] ?? HISTORY_NOTES['Disponível']),
  });

  // Sort chronologically (oldest first)
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const degradedSince = currentStatus === 'Degradada'
    ? entries.filter(e => e.status === 'Degradada').at(-1)?.date
    : undefined;

  // 40% of degraded barriers have a contingency plan set after degradation
  let lastContingency: string | undefined;
  if (currentStatus === 'Degradada' && degradedSince && rng.bool(0.40)) {
    const contDate = addDays(new Date(degradedSince), rng.int(1, 10));
    if (contDate < SIM_DATE) lastContingency = formatDate(contDate);
  }

  return { history: entries, degradedSince, lastContingency };
}

// ─── Status distributions ─────────────────────────────────────────────────────

function pickDisp(r: number): Disponibilidade {
  if (r < 0.48) return 'Disponível';
  if (r < 0.77) return 'Fora de Operação';
  if (r < 0.95) return 'Degradada';
  return 'Em Manutenção';
}

function pickConf(r: number): Conformidade {
  if (r < 0.60) return 'Conforme';
  if (r < 0.90) return 'Não Conforme';
  return 'Não avaliado';
}

// ─── Generator ───────────────────────────────────────────────────────────────

let _cache: Barrier[] | null = null;

export function getBarriers(): Barrier[] {
  if (_cache) return _cache;

  const rng      = createRng(0xdeadbeef);
  const barriers: Barrier[] = [];
  let   id       = 1;

  for (const loc of LOCATION_DIST) {
    for (let i = 0; i < loc.count; i++) {
      const cat  = rng.pick(CATEGORIES);
      const disp = pickDisp(rng.next());
      const conf = pickConf(rng.next());

      const { history, degradedSince, lastContingency } = generateHistory(rng, disp);

      barriers.push({
        id,
        tag:             buildTag(cat, rng, loc.code),
        tipologia:       rng.pick(TIPOLOGIAS),
        instalacao:      loc.code,
        locDesc:         rng.pick(LOC_DESCS),
        criticidade:     rng.bool(0.78) ? 'Barreira Crítica' : 'Barreira Relevante',
        categoria:       cat,
        agrupamento:     rng.pick(AGRUPAMENTOS),
        dono:            rng.bool(0.65) ? rng.pick(DONOS) : '',
        disponibilidade: disp,
        conformidade:    conf,
        comentarios:     rng.bool(0.18) ? rng.pick(COMMENTS) : '',
        planoAcao:       (conf === 'Não Conforme' && rng.bool(0.55)) ? rng.pick(ACTION_PLANS) : '',
        degradedSince,
        lastContingency,
        statusHistory:   history,
      });

      id++;
    }
  }

  _cache = barriers;
  return barriers;
}
