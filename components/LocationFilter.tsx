'use client';
import { LOCATIONS } from '@/lib/constants';
import type { Barrier } from '@/lib/types';

interface Props {
  selected: string;
  allBarriers: Barrier[];
  onChange: (code: string) => void;
}

export function LocationFilter({ selected, allBarriers, onChange }: Props) {
  return (
    <nav aria-label="Filtro por instalação" style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20,
    }}>
      {LOCATIONS.map(loc => {
        const count = loc.code === 'ALL'
          ? allBarriers.length
          : allBarriers.filter(b => b.instalacao === loc.code).length;
        const isActive = selected === loc.code;

        return (
          <button key={loc.code}
            onClick={() => onChange(loc.code)}
            aria-pressed={isActive}
            title={loc.tipo}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px',
              fontSize: 12, fontWeight: isActive ? 700 : 500,
              borderRadius: 10,
              border: isActive ? '1px solid transparent' : '1px solid var(--border)',
              background: isActive
                ? 'linear-gradient(135deg, var(--accent), var(--accent-2))'
                : 'var(--bg-surface)',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.18s',
              boxShadow: isActive ? '0 3px 12px var(--glow)' : 'var(--shadow-sm)',
              whiteSpace: 'nowrap',
            }}>
            {loc.name}
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px',
              borderRadius: 5,
              background: isActive ? 'rgba(255,255,255,0.22)' : 'var(--bg-elevated)',
              color: isActive ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
            }}>
              {count.toLocaleString('pt-BR')}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
