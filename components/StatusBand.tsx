'use client';
import type { KpiSnapshot } from '@/lib/types';
import { DISP_COLORS } from '@/lib/constants';

const SEGMENTS = [
  { key: 'Disponível',       label: 'Disponível'       },
  { key: 'Fora de Operação', label: 'Fora de Operação' },
  { key: 'Degradada',        label: 'Degradada'        },
  { key: 'Em Manutenção',    label: 'Em Manutenção'    },
] as const;

interface Props {
  kpi: KpiSnapshot;
  activeFilter: string;
  onFilter: (key: string) => void;
}

export function StatusBand({ kpi, activeFilter, onFilter }: Props) {
  const counts: Record<string, number> = {
    'Disponível': kpi.disponivel,
    'Fora de Operação': kpi.foraDe,
    'Degradada': kpi.degradada,
    'Em Manutenção': kpi.emManutencao,
  };
  const total = kpi.total || 1;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8,
      }}>
        Disponibilidade — clique para filtrar
      </div>

      <div style={{
        display: 'flex', gap: 4, height: 64,
        background: 'var(--bg-elevated)',
        borderRadius: 12, padding: 4,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {SEGMENTS.map(seg => {
          const count    = counts[seg.key] ?? 0;
          const ptPct    = Math.round((count / total) * 100);
          const cfg      = DISP_COLORS[seg.key];
          const isActive = activeFilter === seg.key;
          const isDimmed = !!activeFilter && !isActive;

          return (
            <button key={seg.key}
              onClick={() => onFilter(isActive ? '' : seg.key)}
              title={`Filtrar: ${seg.key}`}
              aria-pressed={isActive}
              style={{
                flex: Math.max(count, 1),
                background: cfg.grad,
                border: isActive ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent',
                borderRadius: 9,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 1, padding: '0 6px',
                opacity: isDimmed ? 0.18 : 1,
                transition: 'opacity 0.2s, border 0.15s, transform 0.15s',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                overflow: 'hidden', minWidth: 54,
                boxShadow: isActive ? `0 0 16px ${cfg.solid}66` : 'none',
              }}>
              {/* Shine */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
                background: 'linear-gradient(180deg,rgba(255,255,255,0.12) 0%,transparent 100%)',
                pointerEvents: 'none', borderRadius: '9px 9px 0 0',
              }} />
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
              }}>
                {seg.label}
              </span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                {count.toLocaleString('pt-BR')}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                {ptPct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
