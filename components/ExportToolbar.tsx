'use client';
import { useState } from 'react';
import type { Barrier } from '@/lib/types';
import { exportToExcel, exportToPDF, exportToCSV } from '@/lib/export';
import { DownloadIcon, FileSpreadsheetIcon, FilePdfIcon, FileTextIcon, CloseIcon } from './ui/Icons';
interface Props { selectedIds:Set<number>; allFiltered:Barrier[]; onSelectAll:()=>void; onClearAll:()=>void; }
type Fmt = 'xlsx'|'pdf'|'csv';
type I   = React.FC<{size?:number;color?:string;strokeWidth?:number}>;
const FMTS:{key:Fmt;Icon:I;label:string;ext:string;color:string}[]=[
  {key:'xlsx',Icon:FileSpreadsheetIcon,label:'Excel', ext:'.xlsx',color:'#16a34a'},
  {key:'pdf', Icon:FilePdfIcon,        label:'PDF',   ext:'.pdf', color:'#dc2626'},
  {key:'csv', Icon:FileTextIcon,       label:'CSV',   ext:'.csv', color:'#2563eb'},
];
export function ExportToolbar({ selectedIds, allFiltered, onSelectAll, onClearAll }: Props) {
  const [loading,setLoading]=useState<Fmt|null>(null);
  const count=selectedIds.size, hasAny=count>0;
  const allSel=count===allFiltered.length&&allFiltered.length>0, someSel=count>0&&!allSel;
  async function doExport(fmt:Fmt){
    if(!hasAny||loading)return;
    const bs=allFiltered.filter(b=>selectedIds.has(b.id));
    const name=`seacrest-barreiras-${new Date().toISOString().slice(0,10)}`;
    setLoading(fmt);
    try{
      if(fmt==='xlsx')await exportToExcel(bs,name);
      if(fmt==='pdf') await exportToPDF(bs,name);
      if(fmt==='csv')  exportToCSV(bs,name);
    }finally{setLoading(null);}
  }
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'11px 14px',marginBottom:10,
      background:hasAny?'color-mix(in srgb,var(--accent) 5%,var(--bg-elevated))':'var(--bg-elevated)',
      border:hasAny?'1px solid color-mix(in srgb,var(--accent) 30%,var(--border))':'1px solid var(--border)',
      borderRadius:11,transition:'all .25s var(--ease-std)'}}>
      {/* Checkbox + label */}
      <label style={{display:'flex',alignItems:'center',gap:9,cursor:'pointer'}}>
        <Chk checked={allSel} indeterminate={someSel} onChange={()=>allSel?onClearAll():onSelectAll()}/>
        <span style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>
          {allSel?`${allFiltered.length.toLocaleString('pt-BR')} selecionados`:someSel?`${count.toLocaleString('pt-BR')} de ${allFiltered.length.toLocaleString('pt-BR')}`:'Selecionar todos'}
        </span>
      </label>
      {someSel&&(
        <button onClick={onClearAll} style={{display:'flex',alignItems:'center',gap:4,fontSize:12,padding:'4px 9px',borderRadius:6,background:'transparent',border:'1px solid var(--border)',color:'var(--text-muted)',cursor:'pointer',transition:'all .2s'}}>
          <CloseIcon size={11} color="var(--text-muted)"/>Limpar
        </button>
      )}
      <div style={{flex:1}}/>
      {hasAny?(
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:5,marginRight:4}}>
            <DownloadIcon size={13} color="var(--text-muted)"/>
            <span style={{fontSize:13,color:'var(--text-muted)',whiteSpace:'nowrap'}}>Exportar {count.toLocaleString('pt-BR')}:</span>
          </div>
          {FMTS.map(({key,Icon,label,ext,color})=>(
            <button key={key} onClick={()=>doExport(key)} disabled={!!loading} className="lift"
              style={{display:'flex',alignItems:'center',gap:5,padding:'7px 13px',fontSize:12,fontWeight:700,borderRadius:8,cursor:loading?'wait':'pointer',
                border:`1px solid ${color}44`,background:`${color}0e`,color,
                opacity:loading&&loading!==key?0.4:1,whiteSpace:'nowrap'}}>
              {loading===key
                ? <span style={{animation:'pulse 1s infinite',fontSize:12,display:'inline-block',width:13,height:13,borderRadius:'50%',border:'2px solid currentColor',borderTopColor:'transparent',animationDuration:'.7s',animationName:'spin'}}/>
                : <Icon size={14} color={color} strokeWidth={2}/>
              }
              {label}<span style={{fontSize:10,opacity:.6}}>{ext}</span>
            </button>
          ))}
        </div>
      ):(
        <span style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>Selecione itens para exportar</span>
      )}
    </div>
  );
}
function Chk({checked,indeterminate,onChange}:{checked:boolean;indeterminate:boolean;onChange:()=>void}){
  const a=checked||indeterminate;
  return (
    <div onClick={onChange} style={{width:16,height:16,borderRadius:4,flexShrink:0,
      border:a?'2px solid var(--accent)':'2px solid var(--border)',
      background:a?'var(--accent)':'transparent',
      display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
      transition:'all .18s var(--ease-std)',
      boxShadow:a?'0 0 7px var(--glow)':'none'}}>
      {checked&&<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {indeterminate&&<div style={{width:8,height:2,background:'white',borderRadius:1}}/>}
    </div>
  );
}
