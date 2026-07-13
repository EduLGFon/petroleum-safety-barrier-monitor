import type { KpiSnapshot } from '@/lib/types';
import { fmt, pct } from '@/lib/utils';

interface Props { kpi: KpiSnapshot; location: string; }

interface CardDef {
  label:    string;
  value:    string;
  sub:      string;
  grad:     string;
  icon:     string;
  textPct?: number;
}

export function KpiGrid({ kpi, location }: Props) {
  const t         = kpi.total || 1;
  const locLabel  = location === 'ALL' ? 'total' : `em ${location}`;

  const cards: CardDef[] = [
    {
      label: 'Total de Barreiras', icon: '🛡',
      value: fmt(kpi.total), sub: locLabel,
      grad: 'var(--kpi-grad-1)',
    },
    {
      label: 'Disponíveis', icon: '✅',
      value: fmt(kpi.disponivel),
      sub: pct(Math.round(kpi.disponivel / t * 100)) + ' do inventário',
      grad: 'var(--kpi-grad-2)',
      textPct: Math.round(kpi.disponivel / t * 100),
    },
    {
      label: 'Degradadas', icon: '⚠️',
      value: fmt(kpi.degradada),
      sub: pct(Math.round(kpi.degradada / t * 100)) + ' do inventário',
      grad: 'var(--kpi-grad-3)',
      textPct: Math.round(kpi.degradada / t * 100),
    },
    {
      label: 'Fora de Operação', icon: '🔴',
      value: fmt(kpi.foraDe),
      sub: pct(Math.round(kpi.foraDe / t * 100)) + ' do inventário',
      grad: 'var(--kpi-grad-4)',
      textPct: Math.round(kpi.foraDe / t * 100),
    },
    {
      label: '% Conforme', icon: '📋',
      value: pct(kpi.pctConforme),
      sub: fmt(kpi.conforme) + ' barreiras',
      grad: 'var(--kpi-grad-5)',
      textPct: kpi.pctConforme,
    },
    {
      label: '% Não Conforme', icon: '❌',
      value: pct(kpi.pctNaoConforme),
      sub: fmt(kpi.naoConforme) + ' barreiras',
      grad: 'var(--kpi-grad-6)',
      textPct: kpi.pctNaoConforme,
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
      gap: 10, marginBottom: 20,
    }}>
      {cards.map(c => <KpiCard key={c.label} {...c} />)}
    </div>
  );
}

function KpiCard({ label, value, sub, grad, icon, textPct }: CardDef) {
  return (
    <div style={{
      background: grad,
      borderRadius: 12,
      padding: '14px 16px 12px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      minWidth: 0,
    }}>
      {/* Shine overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)',
        borderRadius: '12px 12px 0 0', pointerEvents: 'none',
      }} />
      {/* Progress bar at bottom */}
      {textPct !== undefined && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'rgba(255,255,255,0.15)',
        }}>
          <div style={{
            height: '100%', width: `${textPct}%`,
            background: 'rgba(255,255,255,0.55)',
            transition: 'width 0.6s ease',
            borderRadius: '0 3px 0 0',
          }} />
        </div>
      )}

      <div style={{ fontSize: 16, marginBottom: 6, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
        {icon}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 900, color: '#fff',
        lineHeight: 1, letterSpacing: '-0.02em',
        textShadow: '0 2px 8px rgba(0,0,0,0.3)',
        marginBottom: 4,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
        {sub}
      </div>
    </div>
  );
}
