'use client';
import { useEffect, useCallback, useState, type ReactNode } from 'react';
import type { Barrier } from '@/lib/types';
import { DISP_COLORS, CONF_COLORS, CRIT_COLORS } from '@/lib/constants';
import { Badge } from './ui/Badge';
import { daysSince, humanDuration, fmtDate } from '@/lib/utils';
import { CloseIcon, InfoIcon, HistoryIcon, ClockIcon, UserIcon, BuildingIcon, MapPinIcon, TagIcon, LayersIcon, ShieldCheckIcon, CalendarIcon, AlertTriangleIcon } from './ui/Icons';

interface Props { barrier: Barrier | null; onClose: () => void; }

export function BarrierModal({ barrier, onClose }: Props) {
  const [tab, setTab] = useState<'details'|'history'>('details');
  const handleKey = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey); }, [handleKey]);
  useEffect(() => { document.body.style.overflow = barrier ? 'hidden' : ''; if (barrier) setTab('details'); return () => { document.body.style.overflow = ''; }; }, [barrier]);
  const isOpen = !!barrier;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:990, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', opacity:isOpen?1:0, pointerEvents:isOpen?'auto':'none', transition:'opacity .25s' }}/>
      <div role="dialog" aria-modal="true" style={{ position:'fixed', inset:0, zIndex:991, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:isOpen?'auto':'none', padding:16 }} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
        <div className={isOpen?'animate-scale-in':''} style={{ width:'100%', maxWidth:580, maxHeight:'90dvh', background:'var(--bg-surface)', borderRadius:20, border:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'var(--shadow-lg)', opacity:isOpen?1:0, transform:isOpen?'scale(1)':'scale(0.93)', transition:'opacity .22s,transform .25s cubic-bezier(.34,1.2,.64,1)' }}>
          {barrier && <ModalContent barrier={barrier} onClose={onClose} tab={tab} onTabChange={setTab}/>}
        </div>
      </div>
    </>
  );
}

function ModalContent({ barrier:b, onClose, tab, onTabChange }:{ barrier:Barrier; onClose:()=>void; tab:'details'|'history'; onTabChange:(t:'details'|'history')=>void }) {
  const dc=DISP_COLORS[b.disponibilidade], cc=CONF_COLORS[b.conformidade], crc=CRIT_COLORS[b.criticidade];
  const isNC=b.conformidade==='Não Conforme';
  const ncDays=isNC&&b.statusSince?daysSince(b.statusSince):0;
  return (
    <>
      {/* Header */}
      <div style={{ padding:'20px 22px 16px', background:'var(--bg-elevated)', borderBottom:'1px solid var(--border)', position:'relative', overflow:'hidden', flexShrink:0 }}>
        <div style={{ position:'absolute', top:-40, right:-20, width:180, height:180, borderRadius:'50%', background:`radial-gradient(circle,${dc?.solid??'#3b82f6'}20 0%,transparent 70%)`, pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${dc?.solid??'#3b82f6'},transparent)`, pointerEvents:'none' }}/>
        {/* Top row */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <TagIcon size={10} color="var(--text-muted)" strokeWidth={2}/>
              <span style={{ fontSize:9, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-muted)' }}>Barreira #{b.id} · {b.instalacao}</span>
            </div>
            <div style={{ fontFamily:'ui-monospace,"Cascadia Code",Menlo,monospace', fontSize:21, fontWeight:900, color:'var(--text-primary)', wordBreak:'break-all', lineHeight:1.2, letterSpacing:'-0.01em' }}>{b.tag}</div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5 }}>
              <MapPinIcon size={10} color="var(--text-muted)" strokeWidth={2}/>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{b.locDesc}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ width:32, height:32, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:9, cursor:'pointer', color:'var(--text-muted)', transition:'all .15s' }}>
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5}/>
          </button>
        </div>
        {/* Status badges */}
        <div style={{ display:'flex', gap:6, marginTop:14, flexWrap:'wrap' }}>
          <Badge label={b.disponibilidade} {...dc}/>
          <Badge label={b.conformidade}    {...cc}/>
          <Badge label={b.criticidade}     {...crc} size="sm"/>
        </div>
        {/* NC alert */}
        {isNC && b.statusSince && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
            <AlertTriangleIcon size={16} color="#ef4444" strokeWidth={2}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#ef4444' }}>Não conforme há {humanDuration(ncDays)}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>
                Desde {fmtDate(b.statusSince)}{b.planoAcao?' · Plano de ação definido':' · Sem plano de ação / contingenciamento'}
              </div>
            </div>
            {!b.planoAcao && (
              <span style={{ padding:'3px 9px', borderRadius:5, background:'rgba(239,68,68,.15)', fontSize:9, fontWeight:800, color:'#fca5a5', textTransform:'uppercase', letterSpacing:'0.1em', whiteSpace:'nowrap' }}>Sem plano</span>
            )}
          </div>
        )}
      </div>
      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--bg-elevated)', flexShrink:0 }}>
        {(['details','history'] as const).map(t=>(
          <button key={t} onClick={()=>onTabChange(t)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'11px 20px', fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background:'transparent', color:tab===t?'var(--accent)':'var(--text-muted)', borderBottom:tab===t?'2px solid var(--accent)':'2px solid transparent', transition:'all .15s', marginBottom:-1 }}>
            {t==='details'?<><InfoIcon size={13} color={tab===t?'var(--accent)':'var(--text-muted)'} strokeWidth={2}/> Detalhes</>:<><HistoryIcon size={13} color={tab===t?'var(--accent)':'var(--text-muted)'} strokeWidth={2}/> Histórico</>}
          </button>
        ))}
      </div>
      {/* Body */}
      <div style={{ overflowY:'auto', flex:1 }}>
        {tab==='details' ? <DetailsTab b={b}/> : <HistoryTab b={b}/>}
      </div>
    </>
  );
}

function DetailsTab({ b }: { b: Barrier }) {
  const dc=DISP_COLORS[b.disponibilidade], cc=CONF_COLORS[b.conformidade], crc=CRIT_COLORS[b.criticidade];
  return (
    <div style={{ padding:'20px 22px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px 20px', marginBottom:22 }}>
        <FieldRow Icon={BuildingIcon} label="Instalação"  value={b.instalacao}/>
        <FieldRow Icon={BuildingIcon} label="Tipologia"   value={b.tipologia}/>
        <FieldRow Icon={LayersIcon}   label="Categoria"   value={b.categoria}   full/>
        <FieldRow Icon={LayersIcon}   label="Agrupamento" value={b.agrupamento} full/>
        <FieldRow Icon={ShieldCheckIcon} label="Criticidade" value={b.criticidade} accent={crc?.solid}/>
        <FieldRow Icon={UserIcon}     label="Dono da Barreira" value={b.dono||'Não informado'} accent={!b.dono?'var(--text-muted)':undefined} italic={!b.dono}/>
      </div>
      <Div/>
      <Sec>Status Atual</Sec>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 20px', marginBottom:22 }}>
        <div><Lbl>Disponibilidade</Lbl><Badge label={b.disponibilidade} {...dc}/></div>
        <div><Lbl>Conformidade</Lbl><Badge label={b.conformidade} {...cc}/></div>
        {b.statusSince&&(
          <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:8 }}>
            <ClockIcon size={13} color="var(--text-muted)" strokeWidth={2}/>
            <div>
              <Lbl>Neste status há</Lbl>
              <span style={{ fontSize:13, fontWeight:700, color:b.conformidade==='Não Conforme'?'#ef4444':'var(--text-secondary)' }}>{humanDuration(daysSince(b.statusSince))}</span>
              <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:8 }}>desde {fmtDate(b.statusSince)}</span>
            </div>
          </div>
        )}
      </div>
      <Div/>
      <Sec>Comentários</Sec>
      <TextBlk value={b.comentarios||'Sem comentários registrados.'} muted={!b.comentarios}/>
      <Div/>
      <Sec>Plano de Ação</Sec>
      <TextBlk value={b.planoAcao||'Nenhum plano definido.'} muted={!b.planoAcao} accent={b.planoAcao?'#f59e0b':undefined}/>
    </div>
  );
}

function HistoryTab({ b }: { b: Barrier }) {
  const history = [...b.statusHistory].reverse();
  return (
    <div style={{ padding:'20px 22px' }}>
      <Sec>Histórico de Status</Sec>
      <div style={{ position:'relative', marginTop:8 }}>
        <div style={{ position:'absolute', left:13, top:0, bottom:0, width:2, background:'linear-gradient(180deg,var(--accent) 0%,var(--border) 100%)', borderRadius:1 }}/>
        {history.map((entry,i)=>{
          const cfg=DISP_COLORS[entry.status];
          const isFirst=i===0;
          return (
            <div key={i} style={{ display:'flex', gap:16, marginBottom:i<history.length-1?22:0, position:'relative' }}>
              <div style={{ width:28, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
                <div style={{ width:14, height:14, borderRadius:'50%', background:isFirst?cfg?.solid??'var(--accent)':'var(--bg-elevated)', border:`2.5px solid ${cfg?.solid??'var(--border)'}`, boxShadow:isFirst?`0 0 12px ${cfg?.solid??'var(--accent)'}66`:'none', marginTop:3, zIndex:1, flexShrink:0 }}/>
              </div>
              <div style={{ flex:1, minWidth:0, padding:'10px 14px', background:isFirst?cfg?.bg??'var(--bg-elevated)':'var(--bg-elevated)', border:`1px solid ${isFirst?cfg?.border??'var(--border)':'var(--border)'}`, borderRadius:10, boxShadow:isFirst?'var(--shadow-sm)':'none' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:6 }}>
                  <Badge label={entry.status} {...(cfg??{solid:'#94a3b8',bg:'transparent',border:'var(--border)'})} size="sm"/>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <CalendarIcon size={10} color="var(--text-muted)" strokeWidth={2}/>
                    <span style={{ fontSize:10, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{fmtDate(entry.date)}</span>
                  </div>
                </div>
                <p style={{ margin:0, fontSize:12, color:'var(--text-secondary)', lineHeight:1.55 }}>{entry.note}</p>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:7 }}>
                  <UserIcon size={10} color="var(--text-muted)" strokeWidth={2}/>
                  <span style={{ fontSize:10, color:'var(--text-muted)' }}>{entry.author}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldRow({Icon,label,value,accent,italic,full}:{Icon:React.FC<{size?:number;color?:string;strokeWidth?:number}>;label:string;value:string;accent?:string;italic?:boolean;full?:boolean}) {
  return (
    <div style={{ gridColumn:full?'1 / -1':undefined }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
        <Icon size={9} color="var(--text-muted)" strokeWidth={2}/>
        <span style={{ fontSize:9, fontWeight:800, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em' }}>{label}</span>
      </div>
      <div style={{ fontSize:13, color:accent??'var(--text-secondary)', fontWeight:accent?700:400, fontStyle:italic?'italic':'normal', lineHeight:1.45 }}>{value||'—'}</div>
    </div>
  );
}
function Sec({children}:{children:ReactNode}){return <div style={{fontSize:10,fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:12}}>{children}</div>;}
function Lbl({children}:{children:ReactNode}){return <div style={{fontSize:9,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:5}}>{children}</div>;}
function Div(){return <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'18px 0'}}/>;}
function TextBlk({value,muted,accent}:{value:string;muted?:boolean;accent?:string}){return <p style={{margin:0,fontSize:13,color:accent??(muted?'var(--text-muted)':'var(--text-secondary)'),lineHeight:1.65,fontStyle:muted?'italic':'normal',fontWeight:accent?600:400}}>{value}</p>;}
