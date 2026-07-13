'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { KpiSnapshot } from '@/lib/types';
import { fmt, pct } from '@/lib/utils';
import { ShieldIcon, CheckCircleIcon, AlertOctagonIcon, WrenchIcon, TargetIcon, FlameIcon } from './ui/Icons';

type I = React.FC<{size?:number;color?:string;strokeWidth?:number}>;
interface Props { kpi: KpiSnapshot; location: string; }
interface C { label:string; rawNum:number; isPercent?:boolean; sub:string; grad:string; Icon:I; pv?:number; delay:number; }

function useAnimatedValue(target: number, duration = 600) {
  const [cur, setCur] = useState(target);
  const prev = useRef(target);
  const raf  = useRef<number>(0);
  useEffect(() => {
    if (prev.current === target) return;
    const start = prev.current, end = target, t0 = performance.now();
    prev.current = target;
    const tick = (now: number) => {
      const p = Math.min((now-t0)/duration, 1);
      // Ease out cubic
      const e = 1 - Math.pow(1-p, 3);
      setCur(Math.round(start + (end-start)*e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return cur;
}

function AnimVal({ n, isPercent }: { n:number; isPercent?:boolean }) {
  const v = useAnimatedValue(n);
  const prev = useRef(n);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (prev.current !== n) { setKey(k=>k+1); prev.current = n; }
  }, [n]);
  return <span key={key} className="animate-num">{v.toLocaleString('pt-BR')}{isPercent?'%':''}</span>;
}

export function KpiGrid({ kpi, location }: Props) {
  const t   = kpi.total||1;
  const loc = location==='ALL'?'total geral':`em ${location}`;
  const cards: C[] = [
    { label:'Total de Barreiras', Icon:ShieldIcon,       rawNum:kpi.total,                    sub:loc,                                              grad:'var(--kpi-grad-1)', delay:0   },
    { label:'Disponíveis',        Icon:CheckCircleIcon,  rawNum:kpi.disponivel,                sub:pct(Math.round(kpi.disponivel/t*100))+' do inv.', grad:'var(--kpi-grad-2)', delay:50, pv:Math.round(kpi.disponivel/t*100) },
    { label:'Não Conformes',      Icon:AlertOctagonIcon, rawNum:kpi.naoConforme,               sub:pct(Math.round(kpi.naoConforme/t*100))+' do inv.',grad:'var(--kpi-grad-3)', delay:100,pv:Math.round(kpi.naoConforme/t*100) },
    { label:'Contingenciadas',    Icon:WrenchIcon,       rawNum:kpi.indispCont+kpi.degrCont,   sub:'Ind. + Degr. contingenciadas',                    grad:'var(--kpi-grad-4)', delay:150,pv:Math.round((kpi.indispCont+kpi.degrCont)/t*100) },
    { label:'% Conformidade',     Icon:TargetIcon,       rawNum:kpi.pctConforme, isPercent:true,sub:fmt(kpi.conforme)+' conformes',                  grad:'var(--kpi-grad-5)', delay:200,pv:kpi.pctConforme },
    { label:'Críticas NC',        Icon:FlameIcon,        rawNum:kpi.criticasNC,                sub:'Críticas não conformes',                          grad:'var(--kpi-grad-6)', delay:250 },
  ];

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:20 }}>
      {cards.map(c => (
        <div key={c.label} className="animate-card-in"
          style={{ background:c.grad, borderRadius:14, padding:'15px 17px 13px',
                   position:'relative', overflow:'hidden',
                   boxShadow:'var(--shadow-sm)', minWidth:0,
                   animationDelay:`${c.delay}ms`,
                   cursor:'default',
                   transition:'box-shadow .2s var(--ease-std), transform .2s var(--ease-std)',
          }}
          onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='var(--shadow-md), 0 0 20px var(--glow)';(e.currentTarget as HTMLDivElement).style.transform='translateY(-1px)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='var(--shadow-sm)';(e.currentTarget as HTMLDivElement).style.transform='none';}}>
          {/* Shine */}
          <div style={{position:'absolute',top:0,left:0,right:0,height:'50%',background:'linear-gradient(180deg,rgba(255,255,255,.1) 0%,transparent 100%)',borderRadius:'14px 14px 0 0',pointerEvents:'none'}}/>
          {/* Progress */}
          {c.pv!==undefined&&(
            <div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'rgba(0,0,0,.2)'}}>
              <div style={{height:'100%',width:`${c.pv}%`,background:'rgba(255,255,255,.45)',transition:'width .7s var(--ease-out)',borderRadius:'0 3px 0 0'}}/>
            </div>
          )}
          <div style={{marginBottom:8}}><c.Icon size={17} color="rgba(255,255,255,.72)" strokeWidth={1.8}/></div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(255,255,255,.6)',marginBottom:5}}>{c.label}</div>
          <div style={{fontSize:27,fontWeight:800,color:'#fff',lineHeight:1,letterSpacing:'-0.02em',textShadow:'0 2px 8px rgba(0,0,0,.28)',marginBottom:5}}>
            <AnimVal n={c.rawNum} isPercent={c.isPercent}/>
          </div>
          <div style={{fontSize:11,color:'rgba(255,255,255,.5)',fontWeight:500}}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
