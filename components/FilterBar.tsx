'use client';
import { useState } from 'react';
import type { FilterState } from '@/lib/types';
import { CATEGORIES } from '@/lib/constants';
import { SearchIcon, FilterIcon, CloseIcon } from './ui/Icons';

interface Props {
  filters: FilterState; filteredTotal: number;
  hasActiveFilters: boolean;
  onFilter: (p: Partial<FilterState>) => void; onReset: () => void;
}

const DISP_OPTS = [
  'Disponível','Fora de Operação','Indisponível Contingenciado',
  'Degradado Contingenciado','Degradado','Indisponível','__NC__',
];
const DISP_LABELS: Record<string,string> = { '__NC__': 'Não Conformes (NC)' };
const CONF_OPTS = ['Conforme','Não Conforme'];

export function FilterBar({ filters, filteredTotal, hasActiveFilters, onFilter, onReset }: Props) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>

      {/* Search */}
      <div style={{ flex:1, minWidth:220, position:'relative' }}>
        <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)',
                       pointerEvents:'none', display:'flex',
                       transition:'transform .2s cubic-bezier(.34,1.56,.64,1)',
                       ...(searchFocused ? { transform:'translateY(-50%) scale(1.1)' } : {}) }}>
          <SearchIcon size={13} color={searchFocused||filters.query?'var(--accent)':'var(--text-muted)'}/>
        </span>
        <input type="search" placeholder="TAG, localização, categoria…"
          value={filters.query}
          onChange={e => onFilter({ query: e.target.value })}
          onFocus={()=>setSearchFocused(true)}
          onBlur={()=>setSearchFocused(false)}
          style={{ width:'100%', padding:'8px 12px 8px 33px',
            background:'var(--bg-surface)',
            border: searchFocused||filters.query ? '1px solid var(--accent)' : '1px solid var(--border)',
            borderRadius:9, color:'var(--text-primary)', fontSize:13,
            outline:'none', boxSizing:'border-box',
            boxShadow: searchFocused ? '0 0 0 3px var(--glow)' : 'none',
            transition:'border .2s, box-shadow .2s',
          }}/>
      </div>

      <AnimSelect value={filters.disponibilidade} onChange={v=>onFilter({disponibilidade:v})}
        placeholder="Disponibilidade" opts={DISP_OPTS} labels={DISP_LABELS}/>
      <AnimSelect value={filters.conformidade} onChange={v=>onFilter({conformidade:v})}
        placeholder="Conformidade" opts={CONF_OPTS}/>
      <AnimSelect value={filters.categoria} onChange={v=>onFilter({categoria:v})}
        placeholder="Categoria" opts={[...CATEGORIES]}/>

      {hasActiveFilters && (
        <button onClick={onReset} className="lift"
          style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 11px', fontSize:11,
            fontWeight:600, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)',
            borderRadius:9, color:'#ef4444', cursor:'pointer', whiteSpace:'nowrap',
            animation:'filterOn .3s cubic-bezier(.34,1.56,.64,1) both',
          }}>
          <CloseIcon size={11} color="#ef4444"/>&nbsp;Limpar filtros
        </button>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:'auto' }}>
        <FilterIcon size={11} color={hasActiveFilters?'var(--accent)':'var(--text-muted)'}/>
        <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap',
                       transition:'color .2s',
                       ...(hasActiveFilters ? { color:'var(--accent)', fontWeight:600 } : {}) }}>
          {filteredTotal.toLocaleString('pt-BR')} resultado{filteredTotal!==1?'s':''}
        </span>
      </div>
    </div>
  );
}

function AnimSelect({ value, onChange, placeholder, opts, labels={} }: {
  value: string; onChange: (v:string)=>void;
  placeholder: string; opts: string[]; labels?: Record<string,string>;
}) {
  const active = !!value;
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={active ? 'animate-filter-on' : ''}
      style={{ padding:'8px 10px', fontSize:12,
        background: active ? `color-mix(in srgb, var(--accent) 8%, var(--bg-surface))` : 'var(--bg-surface)',
        border:     active ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius:9, color: active ? 'var(--accent)' : 'var(--text-muted)',
        outline:'none', cursor:'pointer', fontWeight: active ? 700 : 400,
        boxShadow: active ? '0 0 0 3px var(--glow)' : 'none',
        transition:'all .2s cubic-bezier(.4,0,.2,1)',
      }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o} value={o}>{labels[o]??o}</option>)}
    </select>
  );
}
