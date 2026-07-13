'use client';
import type { CSSProperties } from 'react';
import type { Barrier, FilterState, SortableColumn } from '@/lib/types';
import { DISP_COLORS, CONF_COLORS, CRIT_COLORS } from '@/lib/constants';
import { daysSince, humanDuration } from '@/lib/utils';
import { Badge } from './ui/Badge';
import { SortIcon, ChevronUpIcon, ChevronDownIcon,
         ChevronsLeftIcon, ChevronsRightIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from './ui/Icons';

interface Props {
  rows: Barrier[]; filters: FilterState; filteredTotal: number; totalPages: number;
  selectedIds: Set<number>; onToggleSelect: (id:number) => void;
  onSort: (c:SortableColumn) => void; onPageChange: (p:number) => void; onSelect: (b:Barrier) => void;
}

const COLS: {col:SortableColumn;label:string;w?:string}[] = [
  {col:'id',             label:'#',               w:'52px'},
  {col:'tag',            label:'TAG / Identificação'},
  {col:'criticidade',    label:'Criticidade',     w:'140px'},
  {col:'categoria',      label:'Categoria'},
  {col:'disponibilidade',label:'Disponibilidade', w:'230px'},
  {col:'conformidade',   label:'Conformidade',    w:'148px'},
];

const thSt: CSSProperties = {
  padding:'10px 14px', textAlign:'left', fontSize:11,
  fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em',
  cursor:'pointer', userSelect:'none', background:'var(--bg-elevated)',
  borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', color:'var(--text-muted)',
};

export function BarriersTable({ rows, filters, filteredTotal, totalPages, selectedIds, onToggleSelect, onSort, onPageChange, onSelect }: Props) {
  return (
    <div>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:12, boxShadow:'var(--shadow-sm)' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:720 }}>
            <thead>
              <tr>
                <th style={{...thSt, width:44, cursor:'default'}}/>
                {COLS.map(c=>(
                  <th key={c.col} onClick={()=>onSort(c.col)}
                    style={{...thSt, width:c.w, color:filters.sortCol===c.col?'var(--accent)':'var(--text-muted)'}}>
                    {c.label}
                    {filters.sortCol===c.col
                      ? filters.sortDir==='asc'
                        ? <ChevronUpIcon   size={12} color="var(--accent)" strokeWidth={2.5}/>
                        : <ChevronDownIcon size={12} color="var(--accent)" strokeWidth={2.5}/>
                      : <SortIcon size={11} color="var(--border)" strokeWidth={2}/>
                    }
                  </th>
                ))}
                <th style={{...thSt, width:40, cursor:'default'}}/>
              </tr>
            </thead>
            <tbody>
              {rows.length===0 ? (
                <tr>
                  <td colSpan={COLS.length+2} style={{padding:52,textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
                    Nenhuma barreira encontrada.
                  </td>
                </tr>
              ) : rows.map((b,i)=>{
                const isSel  = selectedIds.has(b.id);
                const dc     = DISP_COLORS[b.disponibilidade]?.solid ?? '#475569';
                const isNC   = b.conformidade==='Não Conforme';
                const ncDays = isNC&&b.statusSince ? daysSince(b.statusSince) : 0;

                return (
                  <tr key={b.id}
                    style={{
                      borderBottom:'1px solid var(--border-subtle)',
                      // FIX: boxShadow on <tr> for the left color stripe — appears on ALL rows regardless of bg
                      boxShadow: `inset 3px 0 0 ${dc}`,
                      background: isSel ? 'rgba(59,130,246,.06)' : i%2===0 ? 'transparent' : 'var(--bg-stripe)',
                      cursor:'pointer',
                      transition:'background .15s var(--ease-std)',
                      animation:`rowAppear .22s ${Math.min(i*18,280)}ms var(--ease-out) both`,
                    }}
                    onMouseEnter={e=>{
                      if(!isSel)(e.currentTarget as HTMLTableRowElement).style.background='var(--bg-hover)';
                    }}
                    onMouseLeave={e=>{
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        isSel?'rgba(59,130,246,.06)':i%2===0?'transparent':'var(--bg-stripe)';
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{padding:'10px 14px'}} onClick={e=>{e.stopPropagation();onToggleSelect(b.id);}}>
                      <RowChk checked={isSel}/>
                    </td>

                    {/* # */}
                    <td onClick={()=>onSelect(b)} style={{padding:'10px 14px',fontSize:13,color:'var(--text-muted)',fontWeight:600}}>
                      {b.id}
                    </td>

                    {/* TAG + NC badge */}
                    <td onClick={()=>onSelect(b)} style={{padding:'10px 14px'}}>
                      <div style={{fontFamily:'ui-monospace,"Cascadia Code",Menlo,monospace',fontWeight:700,fontSize:13,color:'var(--text-primary)'}}>
                        {b.tag}
                      </div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{b.locDesc}</div>
                      {/* FIX 13: "X tempo sem contingenciamento" for NC items */}
                      {isNC && b.statusSince && (
                        <div style={{display:'inline-flex',alignItems:'center',gap:5,marginTop:6,
                          padding:'3px 8px',
                          background:'rgba(239,68,68,.09)',border:'1px solid rgba(239,68,68,.22)',
                          borderRadius:5,fontSize:11,fontWeight:600,color:'#ef4444',
                        }}>
                          <ClockIcon size={10} color="#ef4444" strokeWidth={2.5}/>
                          {humanDuration(ncDays)} sem contingenciamento
                        </div>
                      )}
                    </td>

                    {/* Criticidade */}
                    <td onClick={()=>onSelect(b)} style={{padding:'10px 14px'}}>
                      <Badge label={b.criticidade} {...CRIT_COLORS[b.criticidade]} size="sm"/>
                    </td>

                    {/* Categoria */}
                    <td onClick={()=>onSelect(b)} style={{padding:'10px 14px',fontSize:13,color:'var(--text-secondary)'}}>
                      {b.categoria}
                    </td>

                    {/* Disponibilidade */}
                    <td onClick={()=>onSelect(b)} style={{padding:'10px 14px'}}>
                      <Badge label={b.disponibilidade} {...DISP_COLORS[b.disponibilidade]}/>
                    </td>

                    {/* Conformidade */}
                    <td onClick={()=>onSelect(b)} style={{padding:'10px 14px'}}>
                      <Badge label={b.conformidade} {...CONF_COLORS[b.conformidade]}/>
                    </td>

                    {/* Arrow */}
                    <td onClick={()=>onSelect(b)}
                      style={{padding:'10px 12px',textAlign:'center',fontSize:16,color:'var(--text-muted)',transition:'color .15s,transform .15s'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLTableCellElement).style.color='var(--accent)';(e.currentTarget as HTMLTableCellElement).style.transform='translateX(2px)';}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLTableCellElement).style.color='var(--text-muted)';(e.currentTarget as HTMLTableCellElement).style.transform='none';}}>
                      ›
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages>1 && (
        <Pagination page={filters.page} totalPages={totalPages} total={filteredTotal} pageSize={filters.pageSize} onChange={onPageChange}/>
      )}
    </div>
  );
}

function RowChk({ checked }: { checked: boolean }) {
  return (
    <div className={checked?'animate-check':''}
      style={{width:15,height:15,borderRadius:4,flexShrink:0,
        border:checked?'2px solid var(--accent)':'2px solid var(--border)',
        background:checked?'var(--accent)':'transparent',
        display:'flex',alignItems:'center',justifyContent:'center',
        transition:'all .18s var(--ease-std)',
        boxShadow:checked?'0 0 8px var(--glow)':'none',
      }}>
      {checked&&(
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

function Pagination({page,totalPages,total,pageSize,onChange}:{page:number;totalPages:number;total:number;pageSize:number;onChange:(p:number)=>void}) {
  const from=((page-1)*pageSize)+1, to=Math.min(page*pageSize,total);
  const bs=(active:boolean,disabled:boolean):CSSProperties=>({
    minWidth:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',
    padding:'0 8px',fontSize:13,fontWeight:active?700:500,
    border:active?'1px solid transparent':'1px solid var(--border)',
    borderRadius:7,
    background:active?'linear-gradient(135deg,var(--accent),var(--accent-2))':'var(--bg-surface)',
    color:active?'#fff':disabled?'var(--border)':'var(--text-secondary)',
    cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.35:1,
    boxShadow:active?'0 2px 8px var(--glow)':'none',
    transition:'all .2s var(--ease-std)',
  });
  const pages = buildPages(page,totalPages);
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <span style={{fontSize:13,color:'var(--text-muted)'}}>
        {from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
      </span>
      <div style={{display:'flex',gap:4}}>
        <button onClick={()=>onChange(1)}        disabled={page===1}          style={bs(false,page===1)}>         <ChevronsLeftIcon  size={14}/></button>
        <button onClick={()=>onChange(page-1)}   disabled={page===1}          style={bs(false,page===1)}>         <ChevronLeftIcon   size={14}/></button>
        {pages.map((p,i)=>p==='…'
          ?<span key={`e${i}`} style={{...bs(false,true),cursor:'default'}}>…</span>
          :<button key={p} onClick={()=>onChange(p as number)} style={bs(page===p,false)}>{p}</button>
        )}
        <button onClick={()=>onChange(page+1)}   disabled={page===totalPages} style={bs(false,page===totalPages)}><ChevronRightIcon  size={14}/></button>
        <button onClick={()=>onChange(totalPages)}disabled={page===totalPages} style={bs(false,page===totalPages)}><ChevronsRightIcon size={14}/></button>
      </div>
    </div>
  );
}
function buildPages(cur:number,tot:number):(number|'…')[]{
  if(tot<=7)return Array.from({length:tot},(_,i)=>i+1);
  const r:(number|'…')[]=[1];
  if(cur>3)r.push('…');
  for(let p=Math.max(2,cur-1);p<=Math.min(tot-1,cur+1);p++)r.push(p);
  if(cur<tot-2)r.push('…');
  r.push(tot);
  return r;
}
