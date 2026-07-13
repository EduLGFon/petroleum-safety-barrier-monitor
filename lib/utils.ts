import type { Barrier, KpiSnapshot, CategoryConformidade, FilterState } from './types';
import { CATEGORIES, SIM_DATE } from './constants';

export function computeKpi(b: Barrier[]): KpiSnapshot {
  const t=b.length;
  return {
    total:t,
    disponivel:   b.filter(x=>x.disponibilidade==='Disponível').length,
    foraDeOp:     b.filter(x=>x.disponibilidade==='Fora de Operação').length,
    indispCont:   b.filter(x=>x.disponibilidade==='Indisponível Contingenciado').length,
    degrCont:     b.filter(x=>x.disponibilidade==='Degradado Contingenciado').length,
    degradado:    b.filter(x=>x.disponibilidade==='Degradado').length,
    indisponivel: b.filter(x=>x.disponibilidade==='Indisponível').length,
    conforme:     b.filter(x=>x.conformidade==='Conforme').length,
    naoConforme:  b.filter(x=>x.conformidade==='Não Conforme').length,
    criticasNC:   b.filter(x=>x.conformidade==='Não Conforme'&&x.criticidade==='Crítica').length,
    pctConforme:  t>0?Math.round(b.filter(x=>x.conformidade==='Conforme').length/t*100):0,
  };
}

export function computeChartData(b: Barrier[]): CategoryConformidade[] {
  return CATEGORIES.map(cat=>({
    name: cat.length>26?cat.slice(0,26)+'…':cat,
    Conforme:       b.filter(x=>x.categoria===cat&&x.conformidade==='Conforme').length,
    'Não Conforme': b.filter(x=>x.categoria===cat&&x.conformidade==='Não Conforme').length,
  }));
}

export function applyFilters(b: Barrier[], f: FilterState): Barrier[] {
  let d=b;
  if(f.query){const q=f.query.toLowerCase();d=d.filter(x=>x.tag.toLowerCase().includes(q)||x.locDesc.toLowerCase().includes(q)||x.instalacao.toLowerCase().includes(q)||x.categoria.toLowerCase().includes(q));}
  if(f.disponibilidade==='__NC__'){d=d.filter(x=>x.disponibilidade==='Degradado'||x.disponibilidade==='Indisponível');}
  else if(f.disponibilidade){d=d.filter(x=>x.disponibilidade===f.disponibilidade);}
  if(f.conformidade)d=d.filter(x=>x.conformidade===f.conformidade);
  if(f.categoria)   d=d.filter(x=>x.categoria===f.categoria);
  return d;
}

export function applySorting(b: Barrier[], f: FilterState): Barrier[] {
  if(!f.sortCol)return b;
  return[...b].sort((a,x)=>{
    const av=String(a[f.sortCol]).toLowerCase(),bv=String(x[f.sortCol]).toLowerCase();
    const c=av.localeCompare(bv,'pt-BR',{numeric:true});
    return f.sortDir==='asc'?c:-c;
  });
}

export function paginate<T>(a:T[],p:number,s:number):T[]{return a.slice((p-1)*s,p*s);}

export function daysSince(d:string):number{return Math.max(0,Math.floor((SIM_DATE.getTime()-new Date(d).getTime())/86_400_000));}

export function humanDuration(days:number):string{
  if(days<2)return'1 dia';if(days<7)return`${days} dias`;
  if(days<14)return'1 semana';if(days<30)return`${Math.floor(days/7)} semanas`;
  if(days<60)return'1 mês';if(days<365)return`${Math.floor(days/30)} meses`;
  const y=Math.floor(days/365);return`${y} ano${y>1?'s':''}`;
}

export function fmtDate(iso:string):string{const[y,m,d]=iso.split('-');return`${d}/${m}/${y}`;}
export function fmt(n:number):string{return n.toLocaleString('pt-BR');}
export function pct(n:number):string{return`${n}%`;}
export function defaultFilters():FilterState{
  return{query:'',disponibilidade:'',conformidade:'',categoria:'',page:1,pageSize:25,sortCol:'id',sortDir:'asc'};
}
