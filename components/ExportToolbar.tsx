'use client';
import { useState } from 'react';
import type { Barrier } from '@/lib/types';
import { exportToExcel, exportToPDF, exportToCSV } from '@/lib/export';
import { DownloadIcon, FileSpreadsheetIcon, FilePdfIcon, FileTextIcon, CloseIcon } from './ui/Icons';
interface Props { selectedIds:Set<number>; allFiltered:Barrier[]; onSelectAll:()=>void; onClearAll:()=>void; }
type Fmt='xlsx'|'pdf'|'csv';
type I=React.FC<{size?:number;color?:string;strokeWidth?:number}>;
const FMTS:{key:Fmt;Icon:I;label:string;ext:string;color:string}[]=[
  {key:'xlsx',Icon:FileSpreadsheetIcon,label:'Excel',ext:'.xlsx',color:'#16a34a'},
  {key:'pdf', Icon:FilePdfIcon,        label:'PDF',  ext:'.pdf', color:'#dc2626'},
  {key:'csv', Icon:FileTextIcon,       label:'CSV',  ext:'.csv', color:'#2563eb'},
];
export function ExportToolbar({ selectedIds, allFiltered, onSelectAll, onClearAll }: Props) {
  const [loading,setLoading]=useState<Fmt|null>(null);
  const count=selectedIds.size, hasAny=count>0;
  const allSel=count===allFiltered.length&&allFiltered.length>0, someSel=count>0&&!allSel;
  async function doExport(fmt:Fmt) {
    if(!hasAny||loading)return;
    const barriers=allFiltered.filter(b=>selectedIds.has(b.id));
    const name=`seacrest-barreiras-${new Date().toISOString().slice(0,10)}`;
    setLoading(fmt);
    try { if(fmt==='xlsx')await exportToExcel(barriers,name); if(fmt==='pdf')await exportToPDF(barriers,name); if(fmt==='csv')exportToCSV(barriers,name); }
    finally { setLoading(null); }
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'10px 14px', marginBottom:10, background:hasAny?'linear-gradient(135deg,rgba(37,99,235,.07),rgba(124,58,237,.05))':'var(--bg-elevated)', border:hasAny?'1px solid rgba(59,130,246,.22)':'1px solid var(--border)', borderRadius:11, transition:'all .2s' }}>
      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
        <Chk checked={allSel} indeterminate={someSel} onChange={()=>allSel?onClearAll():onSelectAll()}/>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
          {allSel?`${allFiltered.length.toLocaleString('pt-BR')} selecionados`:someSel?`${count.toLocaleString('pt-BR')} de ${allFiltered.length.toLocaleString('pt-BR')}`:'Selecionar todos'}
        </span>
      </label>
      {someSel&&<button onClick={onClearAll} style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,padding:'4px 8px',borderRadius:6,background:'transparent',border:'1px solid var(--border)',color:'var(--text-muted)',cursor:'pointer' }}><CloseIcon size={10} color="var(--text-muted)"/>Limpar</button>}
      <div style={{ flex:1 }}/>
      {hasAny?(
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginRight:4 }}>
            <DownloadIcon size={12} color="var(--text-muted)"/>
            <span style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>Exportar {count.toLocaleString('pt-BR')}:</span>
          </div>
          {FMTS.map(({key,Icon,label,ext,color})=>(
            <button key={key} onClick={()=>doExport(key)} disabled={!!loading}
              style={{ display:'flex',alignItems:'center',gap:5,padding:'6px 12px',fontSize:11,fontWeight:700,borderRadius:8,cursor:loading?'wait':'pointer',border:`1px solid ${color}44`,background:`${color}12`,color,opacity:loading&&loading!==key?0.4:1,transition:'all .15s',whiteSpace:'nowrap' }}>
              {loading===key?<span style={{animation:'pulse 1s infinite',fontSize:11}}>...</span>:<Icon size={13} color={color} strokeWidth={2}/>}
              {label}<span style={{fontSize:9,opacity:.65}}>{ext}</span>
            </button>
          ))}
        </div>
      ):(
        <span style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic' }}>Selecione itens para exportar</span>
      )}
    </div>
  );
}
function Chk({checked,indeterminate,onChange}:{checked:boolean;indeterminate:boolean;onChange:()=>void}) {
  const a=checked||indeterminate;
  return (
    <div onClick={onChange} style={{ width:16,height:16,borderRadius:4,flexShrink:0,border:a?'2px solid var(--accent)':'2px solid var(--border)',background:a?'var(--accent)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s',boxShadow:a?'0 0 6px var(--glow)':'none' }}>
      {checked&&<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {indeterminate&&<div style={{width:8,height:2,background:'white',borderRadius:1}}/>}
    </div>
  );
}
