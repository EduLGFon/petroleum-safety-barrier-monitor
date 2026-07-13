'use client';
import type { KpiSnapshot } from '@/lib/types';
import { DISP_COLORS } from '@/lib/constants';
import { ActivityIcon } from './ui/Icons';
const SEGS=[{key:'Disponível',label:'Disponível'},{key:'Fora de Operação',label:'Fora de Op.'},{key:'Indisponível Contingenciado',label:'Indisp. Cont.'},{key:'Degradado Contingenciado',label:'Degr. Cont.'},{key:'Degradado',label:'Degradado'},{key:'Indisponível',label:'Indisponível'}] as const;
interface Props { kpi:KpiSnapshot; activeFilter:string; onFilter:(k:string)=>void; }
export function StatusBand({ kpi, activeFilter, onFilter }: Props) {
  const counts:Record<string,number>={'Disponível':kpi.disponivel,'Fora de Operação':kpi.foraDeOp,'Indisponível Contingenciado':kpi.indispCont,'Degradado Contingenciado':kpi.degrCont,'Degradado':kpi.degradado,'Indisponível':kpi.indisponivel};
  const total=kpi.total||1;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:8 }}>
        <ActivityIcon size={12} color="var(--accent)" strokeWidth={2}/> Disponibilidade — clique para filtrar
      </div>
      <div style={{ display:'flex', gap:4, height:66, background:'var(--bg-elevated)', borderRadius:14, padding:4, border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
        {SEGS.map(seg=>{
          const count=counts[seg.key]??0, p=Math.round(count/total*100);
          const cfg=DISP_COLORS[seg.key], isA=activeFilter===seg.key, isDim=!!activeFilter&&!isA;
          return (
            <button key={seg.key} onClick={()=>onFilter(isA?'':seg.key)} title={seg.key} aria-pressed={isA}
              style={{ flex:Math.max(count,1), background:cfg.grad, border:isA?'2px solid rgba(255,255,255,.65)':'2px solid transparent', borderRadius:10, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1, padding:'0 5px', opacity:isDim?0.15:1, transition:'opacity .2s,border .15s,transform .15s,box-shadow .15s', transform:isA?'scale(1.03)':'scale(1)', overflow:'hidden', minWidth:52, boxShadow:isA?`0 0 18px ${cfg.solid}55`:'none', position:'relative' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'45%', background:'linear-gradient(180deg,rgba(255,255,255,.13) 0%,transparent 100%)', pointerEvents:'none' }}/>
              <span style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,.82)', letterSpacing:'0.07em', textTransform:'uppercase', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%', position:'relative' }}>{seg.label}</span>
              <span style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1, textShadow:'0 1px 6px rgba(0,0,0,.4)', position:'relative' }}>{count.toLocaleString('pt-BR')}</span>
              <span style={{ fontSize:8, color:'rgba(255,255,255,.62)', fontWeight:600, position:'relative' }}>{p}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
