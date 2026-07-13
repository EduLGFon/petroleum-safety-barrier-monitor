'use client';
import { useEffect, useCallback, useState, type ReactNode } from 'react';
import type { Barrier } from '@/lib/types';
import { DISP_COLORS, CONF_COLORS, CRIT_COLORS } from '@/lib/constants';
import { Badge } from './ui/Badge';
import { daysSince, humanDuration, fmtDate } from '@/lib/utils';
import { CloseIcon, InfoIcon, HistoryIcon, ClockIcon, UserIcon, BuildingIcon, MapPinIcon, TagIcon, LayersIcon, ShieldCheckIcon, CalendarIcon, AlertTriangleIcon } from './ui/Icons';
interface Props { barrier:Barrier|null; onClose:()=>void; }
export function BarrierModal({ barrier, onClose }: Props) {
  const [tab, setTab]=useState<'details'|'history'>('details');
  const key  = useCallback((e:KeyboardEvent)=>{ if(e.key==='Escape')onClose(); },[onClose]);
  useEffect(()=>{ document.addEventListener('keydown',key); return()=>document.removeEventListener('keydown',key); },[key]);
  useEffect(()=>{ document.body.style.overflow=barrier?'hidden':''; if(barrier)setTab('details'); return()=>{document.body.style.overflow='';}; },[barrier]);
  const isOpen=!!barrier;
  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:990,background:'rgba(0,0,0,.55)',backdropFilter:'blur(6px)',opacity:isOpen?1:0,pointerEvents:isOpen?'auto':'none',transition:'opacity .28s var(--ease-std)'}}/>
      <div role="dialog" aria-modal="true"
        style={{position:'fixed',inset:0,zIndex:991,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:isOpen?'auto':'none',padding:16}}
        onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div className={isOpen?'animate-scale-in':''} style={{
          width:'100%',maxWidth:580,maxHeight:'90dvh',
          background:'var(--bg-surface)',borderRadius:20,border:'1px solid var(--border)',
          display:'flex',flexDirection:'column',overflow:'hidden',
          boxShadow:'var(--shadow-lg)',
          opacity:isOpen?1:0,transform:isOpen?'scale(1)':'scale(0.96)',
          transition:'opacity .25s var(--ease-out),transform .25s var(--ease-out)',
        }}>
          {barrier&&<Content b={barrier} onClose={onClose} tab={tab} setTab={setTab}/>}
        </div>
      </div>
    </>
  );
}
function Content({b,onClose,tab,setTab}:{b:Barrier;onClose:()=>void;tab:'details'|'history';setTab:(t:'details'|'history')=>void}){
  const dc=DISP_COLORS[b.disponibilidade],cc=CONF_COLORS[b.conformidade],crc=CRIT_COLORS[b.criticidade];
  const isNC=b.conformidade==='Não Conforme';
  const ncDays=isNC&&b.statusSince?daysSince(b.statusSince):0;
  return (
    <>
      {/* Header */}
      <div style={{padding:'20px 22px 16px',background:'var(--bg-elevated)',borderBottom:'1px solid var(--border)',position:'relative',overflow:'hidden',flexShrink:0}}>
        <div style={{position:'absolute',top:-40,right:-20,width:180,height:180,borderRadius:'50%',background:`radial-gradient(circle,${dc?.solid??'#3b82f6'}18 0%,transparent 70%)`,pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:`linear-gradient(90deg,${dc?.solid??'#3b82f6'},transparent)`,pointerEvents:'none'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <TagIcon size={11} color="var(--text-muted)" strokeWidth={2}/>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--text-muted)'}}>Barreira #{b.id} · {b.instalacao}</span>
            </div>
            <div style={{fontFamily:'ui-monospace,"Cascadia Code",Menlo,monospace',fontSize:21,fontWeight:800,color:'var(--text-primary)',wordBreak:'break-all',lineHeight:1.2}}>
              {b.tag}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:5,marginTop:5}}>
              <MapPinIcon size={11} color="var(--text-muted)" strokeWidth={2}/>
              <span style={{fontSize:13,color:'var(--text-muted)'}}>{b.locDesc}</span>
            </div>
          </div>
          <button onClick={onClose} className="lift" style={{width:34,height:34,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-surface)',border:'1.5px solid var(--border)',borderRadius:9,cursor:'pointer'}}>
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5}/>
          </button>
        </div>
        <div style={{display:'flex',gap:6,marginTop:14,flexWrap:'wrap'}}>
          <Badge label={b.disponibilidade} {...dc}/>
          <Badge label={b.conformidade}    {...cc}/>
          <Badge label={b.criticidade}     {...crc} size="sm"/>
        </div>
        {isNC&&b.statusSince&&(
          <div style={{marginTop:12,padding:'10px 14px',background:'var(--alert-nc-bg)',border:'1px solid var(--alert-nc-border)',borderRadius:10,display:'flex',alignItems:'center',gap:10}}>
            <AlertTriangleIcon size={16} color="var(--alert-nc-text)" strokeWidth={2}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--alert-nc-text)'}}>
                {humanDuration(ncDays)} sem contingenciamento
              </div>
              <div style={{fontSize:12,color:'var(--alert-nc-sub)',marginTop:2}}>
                Não conforme desde {fmtDate(b.statusSince)}
                {!b.planoAcao?' · Sem plano de ação definido':''}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--bg-elevated)',flexShrink:0}}>
        {(['details','history'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'11px 20px',fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:'transparent',color:tab===t?'var(--accent)':'var(--text-muted)',borderBottom:tab===t?'2px solid var(--accent)':'2px solid transparent',transition:'all .2s',marginBottom:-1}}>
            {t==='details'?<><InfoIcon size={14} color={tab===t?'var(--accent)':'var(--text-muted)'} strokeWidth={2}/> Detalhes</>:<><HistoryIcon size={14} color={tab===t?'var(--accent)':'var(--text-muted)'} strokeWidth={2}/> Histórico</>}
          </button>
        ))}
      </div>
      {/* Body */}
      <div style={{overflowY:'auto',flex:1}}>
        {tab==='details'?<Details b={b}/>:<History b={b}/>}
      </div>
    </>
  );
}
function Details({b}:{b:Barrier}){
  const dc=DISP_COLORS[b.disponibilidade],cc=CONF_COLORS[b.conformidade],crc=CRIT_COLORS[b.criticidade];
  return (
    <div style={{padding:'20px 22px'}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px 20px',marginBottom:22}}>
        <FR Icon={BuildingIcon}   label="Instalação"  value={b.instalacao}/>
        <FR Icon={BuildingIcon}   label="Tipologia"   value={b.tipologia}/>
        <FR Icon={LayersIcon}     label="Categoria"   value={b.categoria}   full/>
        <FR Icon={LayersIcon}     label="Agrupamento" value={b.agrupamento} full/>
        <FR Icon={ShieldCheckIcon}label="Criticidade" value={b.criticidade} accent={crc?.solid}/>
        <FR Icon={UserIcon}       label="Dono" value={b.dono||'Não informado'} accent={!b.dono?'var(--text-muted)':undefined} italic={!b.dono}/>
      </div>
      <Div/>
      <Sec>Status Atual</Sec>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 20px',marginBottom:22}}>
        <div><Lbl>Disponibilidade</Lbl><Badge label={b.disponibilidade} {...dc}/></div>
        <div><Lbl>Conformidade</Lbl><Badge label={b.conformidade} {...cc}/></div>
        {b.statusSince&&(
          <div style={{gridColumn:'1 / -1',display:'flex',alignItems:'center',gap:8}}>
            <ClockIcon size={14} color="var(--text-muted)" strokeWidth={2}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:b.conformidade==='Não Conforme'?'var(--alert-nc-text)':'var(--text-secondary)'}}>
                {b.conformidade==='Não Conforme'?`${humanDuration(daysSince(b.statusSince))} sem contingenciamento`:`${humanDuration(daysSince(b.statusSince))} neste status`}
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginTop:1}}>desde {fmtDate(b.statusSince)}</div>
            </div>
          </div>
        )}
      </div>
      <Div/>
      <Sec>Comentários</Sec>
      <Txt value={b.comentarios||'Sem comentários registrados.'} muted={!b.comentarios}/>
      <Div/>
      <Sec>Plano de Ação</Sec>
      <Txt value={b.planoAcao||'Nenhum plano definido.'} muted={!b.planoAcao} accent={b.planoAcao?'#f59e0b':undefined}/>
    </div>
  );
}
function History({b}:{b:Barrier}){
  const history=[...b.statusHistory].reverse();
  return (
    <div style={{padding:'20px 22px'}}>
      <Sec>Histórico de Status</Sec>
      <div style={{position:'relative',marginTop:8}}>
        <div style={{position:'absolute',left:13,top:0,bottom:0,width:2,background:'linear-gradient(180deg,var(--accent) 0%,var(--border) 100%)',borderRadius:1}}/>
        {history.map((entry,i)=>{
          const cfg=DISP_COLORS[entry.status], isFirst=i===0;
          return (
            <div key={i} style={{display:'flex',gap:16,marginBottom:i<history.length-1?22:0,position:'relative'}}>
              <div style={{width:28,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center'}}>
                <div style={{width:14,height:14,borderRadius:'50%',background:isFirst?cfg?.solid??'var(--accent)':'var(--bg-elevated)',border:`2.5px solid ${cfg?.solid??'var(--border)'}`,boxShadow:isFirst?`0 0 10px ${cfg?.solid??'var(--accent)'}55`:'none',marginTop:3,zIndex:1,flexShrink:0}}/>
              </div>
              <div style={{flex:1,minWidth:0,padding:'10px 14px',background:isFirst?cfg?.bg??'var(--bg-elevated)':'var(--bg-elevated)',border:`1px solid ${isFirst?cfg?.border??'var(--border)':'var(--border)'}`,borderRadius:10,boxShadow:isFirst?'var(--shadow-sm)':'none'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:7}}>
                  <Badge label={entry.status} {...(cfg??{solid:'#94a3b8',bg:'transparent',border:'var(--border)'})} size="sm"/>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <CalendarIcon size={11} color="var(--text-muted)" strokeWidth={2}/>
                    <span style={{fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{fmtDate(entry.date)}</span>
                  </div>
                </div>
                <p style={{margin:0,fontSize:13,color:'var(--text-secondary)',lineHeight:1.6}}>{entry.note}</p>
                <div style={{display:'flex',alignItems:'center',gap:5,marginTop:7}}>
                  <UserIcon size={11} color="var(--text-muted)" strokeWidth={2}/>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>{entry.author}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function FR({Icon,label,value,accent,italic,full}:{Icon:React.FC<{size?:number;color?:string;strokeWidth?:number}>;label:string;value:string;accent?:string;italic?:boolean;full?:boolean}){
  return (
    <div style={{gridColumn:full?'1 / -1':undefined}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
        <Icon size={10} color="var(--text-muted)" strokeWidth={2}/>
        <span style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{label}</span>
      </div>
      <div style={{fontSize:14,color:accent??'var(--text-secondary)',fontWeight:accent?700:400,fontStyle:italic?'italic':'normal',lineHeight:1.45}}>{value||'—'}</div>
    </div>
  );
}
function Sec({children}:{children:ReactNode}){return <div style={{fontSize:11,fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>{children}</div>;}
function Lbl({children}:{children:ReactNode}){return <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>{children}</div>;}
function Div(){return <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'18px 0'}}/>;}
function Txt({value,muted,accent}:{value:string;muted?:boolean;accent?:string}){
  return <p style={{margin:0,fontSize:14,color:accent??(muted?'var(--text-muted)':'var(--text-secondary)'),lineHeight:1.65,fontStyle:muted?'italic':'normal',fontWeight:accent?600:400}}>{value}</p>;
}
