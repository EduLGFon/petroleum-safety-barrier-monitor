'use client';
import type { FilterState } from '@/lib/types';
import { CATEGORIES } from '@/lib/constants';
import { SearchIcon, FilterIcon, CloseIcon } from './ui/Icons';
interface Props { filters:FilterState; filteredTotal:number; hasActiveFilters:boolean; onFilter:(p:Partial<FilterState>)=>void; onReset:()=>void; }
const DISP_OPTS=['Disponível','Fora de Operação','Indisponível Contingenciado','Degradado Contingenciado','Degradado','Indisponível','__NC__'];
const DISP_LABELS:Record<string,string>={'__NC__':'Não Conformes (Deg. + Indisp.)'};
const CONF_OPTS=['Conforme','Não Conforme'];
export function FilterBar({ filters, filteredTotal, hasActiveFilters, onFilter, onReset }: Props) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
      <div style={{ flex:1, minWidth:220, position:'relative' }}>
        <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex' }}>
          <SearchIcon size={13} color="var(--text-muted)"/>
        </span>
        <input type="search" placeholder="TAG, localização, categoria…" value={filters.query} onChange={e=>onFilter({query:e.target.value})}
          style={{ width:'100%', padding:'8px 12px 8px 33px', background:'var(--bg-surface)', border:filters.query?'1px solid rgba(59,130,246,.4)':'1px solid var(--border)', borderRadius:9, color:'var(--text-primary)', fontSize:13, outline:'none', boxSizing:'border-box', transition:'border .15s' }}/>
      </div>
      <Sel value={filters.disponibilidade} onChange={v=>onFilter({disponibilidade:v})} placeholder="Disponibilidade" opts={DISP_OPTS} labels={DISP_LABELS}/>
      <Sel value={filters.conformidade}    onChange={v=>onFilter({conformidade:v})}    placeholder="Conformidade"     opts={CONF_OPTS}/>
      <Sel value={filters.categoria}       onChange={v=>onFilter({categoria:v})}       placeholder="Categoria"        opts={[...CATEGORIES]}/>
      {hasActiveFilters&&(
        <button onClick={onReset} style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 11px', fontSize:11, fontWeight:600, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:9, color:'#ef4444', cursor:'pointer', whiteSpace:'nowrap' }}>
          <CloseIcon size={11} color="#ef4444"/>&nbsp;Limpar filtros
        </button>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:'auto' }}>
        <FilterIcon size={11} color="var(--text-muted)"/>
        <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{filteredTotal.toLocaleString('pt-BR')} resultado{filteredTotal!==1?'s':''}</span>
      </div>
    </div>
  );
}
function Sel({value,onChange,placeholder,opts,labels={}}:{value:string;onChange:(v:string)=>void;placeholder:string;opts:string[];labels?:Record<string,string>}) {
  const a=!!value;
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ padding:'8px 10px', fontSize:12, background:a?'rgba(59,130,246,.07)':'var(--bg-surface)', border:a?'1px solid rgba(59,130,246,.4)':'1px solid var(--border)', borderRadius:9, color:a?'var(--accent)':'var(--text-muted)', outline:'none', cursor:'pointer', fontWeight:a?600:400, transition:'all .15s' }}>
      <option value="">{placeholder}</option>
      {opts.map(o=><option key={o} value={o}>{labels[o]??o}</option>)}
    </select>
  );
}
