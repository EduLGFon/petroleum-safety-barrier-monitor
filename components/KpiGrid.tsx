import type { KpiSnapshot } from '@/lib/types';
import { fmt, pct } from '@/lib/utils';
import { ShieldIcon, CheckCircleIcon, AlertOctagonIcon, WrenchIcon, TargetIcon, FlameIcon } from './ui/Icons';
type I = React.FC<{size?:number;color?:string;strokeWidth?:number}>;
interface Props { kpi:KpiSnapshot; location:string; }
interface C { label:string; value:string; sub:string; grad:string; Icon:I; pv?:number; }
export function KpiGrid({ kpi, location }: Props) {
  const t=kpi.total||1, loc=location==='ALL'?'total geral':`em ${location}`;
  const cards:C[] = [
    {label:'Total de Barreiras',Icon:ShieldIcon,   value:fmt(kpi.total),  sub:loc,                                                 grad:'var(--kpi-grad-1)'},
    {label:'Disponíveis',       Icon:CheckCircleIcon,value:fmt(kpi.disponivel),sub:pct(Math.round(kpi.disponivel/t*100))+' do inventário',grad:'var(--kpi-grad-2)',pv:Math.round(kpi.disponivel/t*100)},
    {label:'Não Conformes',     Icon:AlertOctagonIcon,value:fmt(kpi.naoConforme),sub:pct(Math.round(kpi.naoConforme/t*100))+' do inventário',grad:'var(--kpi-grad-3)',pv:Math.round(kpi.naoConforme/t*100)},
    {label:'Contingenciadas',   Icon:WrenchIcon,   value:fmt(kpi.indispCont+kpi.degrCont),sub:'Ind. + Degr. contingenciadas',        grad:'var(--kpi-grad-4)',pv:Math.round((kpi.indispCont+kpi.degrCont)/t*100)},
    {label:'% Conformidade',    Icon:TargetIcon,   value:pct(kpi.pctConforme),sub:fmt(kpi.conforme)+' conformes',                   grad:'var(--kpi-grad-5)',pv:kpi.pctConforme},
    {label:'Críticas NC',       Icon:FlameIcon,    value:fmt(kpi.criticasNC),sub:'Críticas não conformes',                          grad:'var(--kpi-grad-6)',pv:Math.round(kpi.criticasNC/t*100)},
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(148px,1fr))', gap:10, marginBottom:20 }}>
      {cards.map(c=>(
        <div key={c.label} style={{ background:c.grad, borderRadius:14, padding:'14px 16px 12px', position:'relative', overflow:'hidden', boxShadow:'var(--shadow-sm)', minWidth:0 }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%', background:'linear-gradient(180deg,rgba(255,255,255,.1) 0%,transparent 100%)', borderRadius:'14px 14px 0 0', pointerEvents:'none' }}/>
          {c.pv!==undefined&&<div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:'rgba(0,0,0,.2)' }}><div style={{ height:'100%', width:`${c.pv}%`, background:'rgba(255,255,255,.5)', transition:'width .6s ease', borderRadius:'0 3px 0 0' }}/></div>}
          <div style={{ marginBottom:7 }}><c.Icon size={16} color="rgba(255,255,255,.75)" strokeWidth={2}/></div>
          <div style={{ fontSize:9, fontWeight:800, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,.65)', marginBottom:4 }}>{c.label}</div>
          <div style={{ fontSize:26, fontWeight:900, color:'#fff', lineHeight:1, letterSpacing:'-0.02em', textShadow:'0 2px 8px rgba(0,0,0,.3)', marginBottom:4 }}>{c.value}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.55)', fontWeight:500 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
