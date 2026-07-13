import type { Barrier, KpiSnapshot, CategoryConformidade, FilterState } from './types';
import { CATEGORIES, SIM_DATE } from './constants';

// ─── KPI computation ──────────────────────────────────────────────────────────

export function computeKpi(barriers: Barrier[]): KpiSnapshot {
  const total        = barriers.length;
  const disponivel   = barriers.filter(b => b.disponibilidade === 'Disponível').length;
  const degradada    = barriers.filter(b => b.disponibilidade === 'Degradada').length;
  const foraDe       = barriers.filter(b => b.disponibilidade === 'Fora de Operação').length;
  const emManutencao = barriers.filter(b => b.disponibilidade === 'Em Manutenção').length;
  const conforme     = barriers.filter(b => b.conformidade === 'Conforme').length;
  const naoConforme  = barriers.filter(b => b.conformidade === 'Não Conforme').length;
  const naoAvaliado  = barriers.filter(b => b.conformidade === 'Não avaliado').length;

  return {
    total, disponivel, degradada, foraDe, emManutencao,
    conforme, naoConforme, naoAvaliado,
    pctConforme:    total > 0 ? Math.round((conforme    / total) * 100) : 0,
    pctNaoConforme: total > 0 ? Math.round((naoConforme / total) * 100) : 0,
  };
}

// ─── Chart data ───────────────────────────────────────────────────────────────

export function computeChartData(barriers: Barrier[]): CategoryConformidade[] {
  return CATEGORIES.map(cat => {
    const s = barriers.filter(b => b.categoria === cat);
    return {
      name:           cat.length > 24 ? cat.slice(0, 24) + '…' : cat,
      Conforme:       s.filter(b => b.conformidade === 'Conforme').length,
      'Não Conforme': s.filter(b => b.conformidade === 'Não Conforme').length,
      'Não avaliado': s.filter(b => b.conformidade === 'Não avaliado').length,
    };
  });
}

// ─── Filter + sort + paginate ─────────────────────────────────────────────────

export function applyFilters(barriers: Barrier[], f: FilterState): Barrier[] {
  let d = barriers;
  if (f.query) {
    const q = f.query.toLowerCase();
    d = d.filter(b =>
      b.tag.toLowerCase().includes(q)      ||
      b.locDesc.toLowerCase().includes(q)  ||
      b.instalacao.toLowerCase().includes(q) ||
      b.categoria.toLowerCase().includes(q)
    );
  }
  if (f.disponibilidade) d = d.filter(b => b.disponibilidade === f.disponibilidade);
  if (f.conformidade)    d = d.filter(b => b.conformidade    === f.conformidade);
  if (f.categoria)       d = d.filter(b => b.categoria       === f.categoria);
  return d;
}

export function applySorting(barriers: Barrier[], f: FilterState): Barrier[] {
  if (!f.sortCol) return barriers;
  return [...barriers].sort((a, b) => {
    const av = String(a[f.sortCol]).toLowerCase();
    const bv = String(b[f.sortCol]).toLowerCase();
    const cmp = av.localeCompare(bv, 'pt-BR', { numeric: true });
    return f.sortDir === 'asc' ? cmp : -cmp;
  });
}

export function paginate<T>(arr: T[], page: number, size: number): T[] {
  return arr.slice((page - 1) * size, page * size);
}

// ─── Date utilities ───────────────────────────────────────────────────────────

/** Days between a date string and SIM_DATE */
export function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.max(0, Math.floor((SIM_DATE.getTime() - d.getTime()) / 86_400_000));
}

/** Human-readable duration in Portuguese */
export function humanDuration(days: number): string {
  if (days < 2)   return '1 dia';
  if (days < 7)   return `${days} dias`;
  if (days < 14)  return '1 semana';
  if (days < 30)  return `${Math.floor(days / 7)} semanas`;
  if (days < 60)  return '1 mês';
  if (days < 365) return `${Math.floor(days / 30)} meses`;
  const y = Math.floor(days / 365);
  return `${y} ano${y > 1 ? 's' : ''}`;
}

/** Format an ISO date to pt-BR short */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Format an ISO date to "Jun 2025" */
export function fmtDateShort(iso: string): string {
  const dt = new Date(iso + 'T12:00:00');
  return dt.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

// ─── Number formatting ────────────────────────────────────────────────────────

export function fmt(n: number): string { return n.toLocaleString('pt-BR'); }
export function pct(n: number): string { return `${n}%`; }

// ─── Default filter state ─────────────────────────────────────────────────────

export function defaultFilters(): FilterState {
  return {
    query: '', disponibilidade: '', conformidade: '', categoria: '',
    page: 1, pageSize: 25, sortCol: 'id', sortDir: 'asc',
  };
}
