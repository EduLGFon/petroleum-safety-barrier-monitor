'use client';
import type { KpiSnapshot } from '@/lib/types';
import { DISP_COLORS } from '@/lib/constants';
import { ActivityIcon } from './ui/Icons';
const SEGS=[
  {key:'Disponível',                  short:'Disponível'},
  {key:'Fora de Operação',            short:'Fora de Op.'},
  {key:'Indisponível Contingenciado', short:'Indisp. Cont.'},
  {key:'Degradado Contingenciado',    short:'Degr. Cont.'},
  {key:'Degradado',                   short:'Degradado'},
  {key:'Indisponível',                short:'Indisponível'},
] as const;
interface Props { kpi:KpiSnapshot; activeFilter:string; onFilter:(k:string)=>void; }
export function StatusBand({ kpi, activeFilter, onFilter }: Props) {
  const counts:Record<string,number>={
    'Disponível':kpi.disponivel,'Fora de Operação':kpi.foraDeOp,
    'Indisponível Contingenciado':kpi.indispCont,'Degradado Contingenciado':kpi.degrCont,
    'Degradado':kpi.degradado,'Indisponível':kpi.indisponivel,
  };
  const total=kpi.total||1;
  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>
        <ActivityIcon size={13} color="var(--accent)" strokeWidth={2}/> Disponibilidade — clique para filtrar
      </div>
      <div style={{display:'flex',gap:4,height:68,background:'var(--bg-elevated)',borderRadius:14,padding:4,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)'}}>
        {SEGS.map((seg,i)=>{
          const count=counts[seg.key]??0, ptPct=Math.round(count/total*100);
          const cfg=DISP_COLORS[seg.key], isA=activeFilter===seg.key, isDim=!!activeFilter&&!isA;
          return (
            <button key={seg.key} onClick={()=>onFilter(isA?'':seg.key)} title={seg.key} aria-pressed={isA}
              style={{
                flex:Math.max(count,1), background:cfg.grad,
                border:isA?'2px solid rgba(255,255,255,.6)':'2px solid transparent',
                borderRadius:10, cursor:'pointer',
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                gap:1, padding:'0 5px',
                opacity:isDim?0.16:1,
                transform:isA?'scale(1.025)':'scale(1)',
                transition:'opacity .22s var(--ease-std), transform .22s var(--ease-std), box-shadow .22s var(--ease-std), border .15s',
                overflow:'hidden', minWidth:54,
                boxShadow:isA?`0 0 18px ${cfg.solid}55`:'none',
                position:'relative',
                animation:`cardAppear .3s ${i*40}ms var(--ease-out) both`,
              }}
              onMouseEnter={e=>{if(!isA)(e.currentTarget as HTMLButtonElement).style.transform='scale(1.015)';}}
              onMouseLeave={e=>{if(!isA)(e.currentTarget as HTMLButtonElement).style.transform='scale(1)';}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:'44%',background:'linear-gradient(180deg,rgba(255,255,255,.12) 0%,transparent 100%)',pointerEvents:'none'}}/>
              <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,.82)',letterSpacing:'0.07em',textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%',position:'relative'}}>{seg.short}</span>
              <span style={{fontSize:20,fontWeight:800,color:'#fff',lineHeight:1,textShadow:'0 1px 5px rgba(0,0,0,.4)',position:'relative'}}>{count.toLocaleString('pt-BR')}</span>
              <span style={{fontSize:9,color:'rgba(255,255,255,.6)',fontWeight:600,position:'relative'}}>{ptPct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
