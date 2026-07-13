'use client';
import type { FilterState } from '@/lib/types';
import { CATEGORIES } from '@/lib/constants';

interface Props {
  filters: FilterState;
  filteredTotal: number;
  hasActiveFilters: boolean;
  onFilter: (patch: Partial<FilterState>) => void;
  onReset: () => void;
}

const DISP_OPTS = ['Disponível', 'Degradada', 'Fora de Operação', 'Em Manutenção'];
const CONF_OPTS = ['Conforme', 'Não Conforme', 'Não avaliado'];

function Select({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void;
  placeholder: string; options: string[];
}) {
  const active = !!value;
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 10px', fontSize: 12,
        background: active ? 'rgba(59,130,246,0.08)' : 'var(--bg-surface)',
        border: active ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border)',
        borderRadius: 9, color: active ? 'var(--accent)' : 'var(--text-muted)',
        outline: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400,
        transition: 'all 0.15s',
      }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function FilterBar({ filters, filteredTotal, hasActiveFilters, onFilter, onReset }: Props) {
  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap',
      alignItems: 'center', marginBottom: 12,
    }}>
      {/* Search */}
      <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none',
        }}>🔍</span>
        <input type="search"
          placeholder="TAG, localização, categoria…"
          value={filters.query}
          onChange={e => onFilter({ query: e.target.value })}
          style={{
            width: '100%', padding: '8px 12px 8px 34px',
            background: 'var(--bg-surface)',
            border: filters.query ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border)',
            borderRadius: 9, color: 'var(--text-primary)', fontSize: 13,
            outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
          }}
        />
      </div>

      <Select value={filters.disponibilidade} onChange={v => onFilter({ disponibilidade: v })}
        placeholder="Disponibilidade" options={DISP_OPTS} />
      <Select value={filters.conformidade} onChange={v => onFilter({ conformidade: v })}
        placeholder="Conformidade" options={CONF_OPTS} />
      <Select value={filters.categoria} onChange={v => onFilter({ categoria: v })}
        placeholder="Categoria" options={[...CATEGORIES]} />

      {hasActiveFilters && (
        <button onClick={onReset} style={{
          padding: '8px 12px', fontSize: 11, fontWeight: 600,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 9, color: '#ef4444', cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}>
          ✕ Limpar filtros
        </button>
      )}

      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {filteredTotal.toLocaleString('pt-BR')} resultado{filteredTotal !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
