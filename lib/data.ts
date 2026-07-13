import type { Barrier, Disponibilidade, StatusHistoryEntry } from './types';
import { LOCATION_DIST,CATEGORIES,AGRUPAMENTOS,TIPOLOGIAS,DONOS,LOC_DESCS,AUTHORS,HISTORY_NOTES,COMMENTS,ACTION_PLANS,SIM_DATE,isConforme } from './constants';

function createRng(seed: number) {
  let s = seed >>> 0;
  const next = (): number => {
    s = Math.imul(s^(s>>>13),s|7)>>>0;
    s = (s^(s>>>17))>>>0;
    s = Math.imul(s^(s>>>5),s|3)>>>0;
    return (s>>>0)/4294967296;
  };
  return { next, int:(lo:number,hi:number)=>lo+Math.floor(next()*(hi-lo)), pick:<T>(a:readonly T[])=>a[Math.floor(next()*a.length)], bool:(p=0.5)=>next()<p };
}
type Rng = ReturnType<typeof createRng>;

const TAG_PREFIX: Record<string,string> = {
  'Válvula de Alívio de Pressão':'PSV','Alarmes de Emergência e Sirene':'OA',
  'Sistema de Detecção de Gás':'GD','Sistema de Combate a Incêndio':'FW',
  'Válvula de Bloqueio de Emergência':'EBV','Sistema de Intertravamento (SIS)':'SIS',
  'Detector de Fumaça':'FD','Dispositivo de Corte de Energia':'ESD',
  'Sistema de Ventilação de Emergência':'VE','Detector de H₂S':'H2S',
};

function buildTag(cat:string,rng:Rng,loc:string):string {
  const p=TAG_PREFIX[cat]??'B', n=String(rng.int(1000,9999));
  const s=rng.pick(['A','B','C','']as const);
  return s?`${p}-${n}-${loc}-${s}`:`${p}-${n}-${loc}`;
}

function addDays(b:Date,d:number):Date { const x=new Date(b);x.setDate(x.getDate()+d);return x; }
function fmt(d:Date):string { return d.toISOString().split('T')[0]; }

const STATUS_DIST:[Disponibilidade,number][]=[
  ['Disponível',0.52],['Fora de Operação',0.14],
  ['Indisponível Contingenciado',0.08],['Degradado Contingenciado',0.07],
  ['Degradado',0.12],['Indisponível',0.07],
];
function pickStatus(r:number):Disponibilidade {
  let c=0; for(const[s,p]of STATUS_DIST){c+=p;if(r<c)return s;} return 'Disponível';
}

function generateHistory(rng:Rng,current:Disponibilidade):{history:StatusHistoryEntry[];statusSince:string}{
  const n=rng.int(2,5), span=rng.int(120,400), step=Math.floor(span/n);
  let cursor=addDays(SIM_DATE,-span);
  const all:Disponibilidade[]=STATUS_DIST.map(([s])=>s);
  const entries:StatusHistoryEntry[]=[];
  let prev:Disponibilidade=rng.pick(['Disponível','Disponível','Fora de Operação']as const);
  for(let i=0;i<n-1;i++){
    entries.push({date:fmt(cursor),status:prev,author:rng.pick(AUTHORS),note:rng.pick(HISTORY_NOTES[prev]??HISTORY_NOTES['Disponível'])});
    cursor=addDays(cursor,rng.int(step-10,step+20));
    prev=rng.pick(all.filter(s=>s!==prev)as Disponibilidade[]);
  }
  const since=addDays(SIM_DATE,-rng.int(3,90));
  const statusSince=fmt(since);
  entries.push({date:statusSince,status:current,author:rng.pick(AUTHORS),note:rng.pick(HISTORY_NOTES[current]??HISTORY_NOTES['Disponível'])});
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  return {history:entries,statusSince};
}

let _cache:Barrier[]|null=null;
export function getBarriers():Barrier[]{
  if(_cache)return _cache;
  const rng=createRng(0xdeadbeef);
  const barriers:Barrier[]=[];
  let id=1;
  for(const loc of LOCATION_DIST){
    for(let i=0;i<loc.count;i++){
      const cat=rng.pick(CATEGORIES);
      const disp=pickStatus(rng.next());
      const conf=isConforme(disp)?'Conforme' as const:'Não Conforme' as const;
      const{history,statusSince}=generateHistory(rng,disp);
      const isNC=conf==='Não Conforme';
      barriers.push({
        id, tag:buildTag(cat,rng,loc.code),
        tipologia:rng.pick(TIPOLOGIAS), instalacao:loc.code,
        locDesc:rng.pick(LOC_DESCS),
        criticidade:rng.bool(0.78)?'Crítica':'Não Crítica',
        categoria:cat, agrupamento:rng.pick(AGRUPAMENTOS),
        dono:rng.bool(0.65)?rng.pick(DONOS):'',
        disponibilidade:disp, conformidade:conf,
        comentarios:rng.bool(0.15)?rng.pick(COMMENTS):'',
        planoAcao:isNC&&rng.bool(0.4)?rng.pick(ACTION_PLANS):'',
        statusSince, statusHistory:history,
      });
      id++;
    }
  }
  _cache=barriers;
  return barriers;
}
