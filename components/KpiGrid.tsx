'use client';
import { useEffect, useRef, useState } from 'react';
import type { KpiSnapshot } from '@/lib/types';
import { fmt, pct } from '@/lib/utils';
import { ShieldIcon, CheckCircleIcon, AlertOctagonIcon, WrenchIcon, TargetIcon, FlameIcon } from './ui/Icons';

type I = React.FC<{size?:number;color?:string;strokeWidth?:number}>;
interface Props { kpi: KpiSnapshot; location: string; }
interface C { label:string; value:string; rawNum:number; sub:string; grad:string; Icon:I; pv?:number; delay:number; }

function useAnimatedNum(target: number, dur = 700) {
  const [cur, setCur] = useState(target);
  const prev = useRef(target);
  const frame = useRef<number>(0);
  useEffect(() => {
    if (prev.current === target) return;
    const start = prev.current, end = target, t0 = performance.now();
    prev.current = target;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setCur(Math.round(start + (end - start) * e));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, dur]);
  return cur;
}

function AnimNum({ n, suffix = '' }: { n: number; suffix?: string }) {
  const v = useAnimatedNum(n);
  const prev = useRef(n);
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    if (prev.current !== n) { setAnimKey(k => k + 1); prev.current = n; }
  }, [n]);
  return (
    <span key={animKey} className="animate-num" style={{ display:'inline-block' }}>
      {v.toLocaleString('pt-BR')}{suffix}
    </span>
  );
}

export function KpiGrid({ kpi, location }: Props) {
  const t   = kpi.total || 1;
  const loc = location === 'ALL' ? 'total geral' : `em ${location}`;
  const cards: C[] = [
    { label:'Total de Barreiras', Icon:ShieldIcon,      rawNum:kpi.total,       value:'', sub:loc,                                            grad:'var(--kpi-grad-1)', delay:0    },
    { label:'Disponíveis',        Icon:CheckCircleIcon, rawNum:kpi.disponivel,  value:'', sub:pct(Math.round(kpi.disponivel/t*100))+' do inventário', grad:'var(--kpi-grad-2)', pv:Math.round(kpi.disponivel/t*100), delay:60   },
    { label:'Não Conformes',      Icon:AlertOctagonIcon,rawNum:kpi.naoConforme, value:'', sub:pct(Math.round(kpi.naoConforme/t*100))+' do inventário', grad:'var(--kpi-grad-3)', pv:Math.round(kpi.naoConforme/t*100), delay:120 },
    { label:'Contingenciadas',    Icon:WrenchIcon,      rawNum:kpi.indispCont+kpi.degrCont, value:'', sub:'Ind. + Degr. contingenciadas', grad:'var(--kpi-grad-4)', pv:Math.round((kpi.indispCont+kpi.degrCont)/t*100), delay:180 },
    { label:'% Conformidade',     Icon:TargetIcon,      rawNum:kpi.pctConforme, value:'', sub:fmt(kpi.conforme)+' conformes',           grad:'var(--kpi-grad-5)', pv:kpi.pctConforme, delay:240 },
    { label:'Críticas NC',        Icon:FlameIcon,       rawNum:kpi.criticasNC,  value:'', sub:'Críticas não conformes',                 grad:'var(--kpi-grad-6)', delay:300 },
  ];

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(148px,1fr))', gap:10, marginBottom:20 }}>
      {cards.map((c, i) => (
        <div key={c.label} className="animate-card-in lift"
          style={{ background:c.grad, borderRadius:14, padding:'14px 16px 12px', position:'relative', overflow:'hidden', boxShadow:'var(--shadow-sm)', minWidth:0, animationDelay:`${c.delay}ms`, cursor:'default' }}>
          {/* Shine */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%', background:'linear-gradient(180deg,rgba(255,255,255,.1) 0%,transparent 100%)', borderRadius:'14px 14px 0 0', pointerEvents:'none' }}/>
          {/* Progress bar */}
          {c.pv !== undefined && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:'rgba(0,0,0,.2)' }}>
              <div style={{ height:'100%', width:`${c.pv}%`, background:'rgba(255,255,255,.5)', transition:'width .8s cubic-bezier(.34,1.2,.64,1)', borderRadius:'0 3px 0 0' }}/>
            </div>
          )}
          <div style={{ marginBottom:8 }}><c.Icon size={16} color="rgba(255,255,255,.75)" strokeWidth={2}/></div>
          <div style={{ fontSize:9, fontWeight:800, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,.65)', marginBottom:4 }}>{c.label}</div>
          <div style={{ fontSize:26, fontWeight:900, color:'#fff', lineHeight:1, letterSpacing:'-0.02em', textShadow:'0 2px 8px rgba(0,0,0,.3)', marginBottom:4 }}>
            {c.label.startsWith('%')
              ? <AnimNum n={c.rawNum} suffix="%"/>
              : <AnimNum n={c.rawNum}/>
            }
          </div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', fontWeight:500 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
