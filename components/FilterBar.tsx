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
  'Disponível','Fora de Operação',
  'Indisponível Contingenciado','Degradado Contingenciado',
  'Degradado','Indisponível',
];
const CONF_OPTS = ['Conforme','Não Conforme'];

export function FilterBar({ filters, filteredTotal, hasActiveFilters, onFilter, onReset }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
      {/* Search */}
      <div style={{ flex:1, minWidth:220, position:'relative' }}>
        <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex', transition:'transform .2s var(--ease-out)', ...(focused?{transform:'translateY(-50%) scale(1.1)'}:{}) }}>
          <SearchIcon size={14} color={focused||filters.query?'var(--accent)':'var(--text-muted)'}/>
        </span>
        <input type="search" placeholder="TAG, localização, categoria…"
          value={filters.query} onChange={e=>onFilter({query:e.target.value})}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{
            width:'100%', padding:'9px 12px 9px 34px', fontSize:14,
            background:'var(--bg-surface)',
            border: focused||filters.query ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
            borderRadius:9, color:'var(--text-primary)', outline:'none',
            boxSizing:'border-box',
            boxShadow: focused ? '0 0 0 3px var(--glow)' : 'none',
            transition:'border .2s, box-shadow .2s',
          }}/>
      </div>

      <Sel value={filters.disponibilidade} onChange={v=>onFilter({disponibilidade:v})} placeholder="Disponibilidade" opts={DISP_OPTS}/>
      <Sel value={filters.conformidade}    onChange={v=>onFilter({conformidade:v})}    placeholder="Conformidade"    opts={CONF_OPTS}/>
      <Sel value={filters.categoria}       onChange={v=>onFilter({categoria:v})}       placeholder="Categoria"       opts={[...CATEGORIES]}/>

      {hasActiveFilters && (
        <button onClick={onReset} className="lift animate-filter-on"
          style={{ display:'flex', alignItems:'center', gap:5, padding:'9px 12px', fontSize:13,
            fontWeight:600, background:'rgba(239,68,68,.07)', border:'1.5px solid rgba(239,68,68,.22)',
            borderRadius:9, color:'#ef4444', cursor:'pointer', whiteSpace:'nowrap' }}>
          <CloseIcon size={12} color="#ef4444"/>Limpar filtros
        </button>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:'auto' }}>
        <FilterIcon size={12} color={hasActiveFilters?'var(--accent)':'var(--text-muted)'}/>
        <span style={{ fontSize:13, color: hasActiveFilters?'var(--accent)':'var(--text-muted)', fontWeight:hasActiveFilters?600:400, whiteSpace:'nowrap', transition:'color .2s' }}>
          {filteredTotal.toLocaleString('pt-BR')} resultado{filteredTotal!==1?'s':''}
        </span>
      </div>
    </div>
  );
}

function Sel({value,onChange,placeholder,opts}:{value:string;onChange:(v:string)=>void;placeholder:string;opts:string[]}) {
  const a = !!value;
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      className={a?'animate-filter-on':''}
      style={{
        padding:'9px 10px', fontSize:13,
        background: a ? 'color-mix(in srgb,var(--accent) 7%,var(--bg-surface))' : 'var(--bg-surface)',
        border: a ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
        borderRadius:9, color: a ? 'var(--accent)' : 'var(--text-muted)',
        outline:'none', cursor:'pointer', fontWeight: a ? 700 : 400,
        boxShadow: a ? '0 0 0 3px var(--glow)' : 'none',
        transition:'all .2s var(--ease-std)',
      }}>
      <option value="">{placeholder}</option>
      {opts.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}
