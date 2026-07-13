'use client';
import { useEffect, useState } from 'react';
import { SeacrestLogo } from './ui/SeacrestLogo';
import { ShieldIcon } from './ui/Icons';
interface Props { onDone: () => void; }
export function LoadingScreen({ onDone }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'in'|'done'|'out'>('in');
  useEffect(() => {
    const steps=52, dur=1500;
    let step=0;
    const id = setInterval(() => {
      step++;
      const eased = 1-Math.pow(1-step/steps,3);
      setProgress(Math.round(eased*100));
      if(step>=steps){ clearInterval(id); setPhase('done'); setTimeout(()=>{ setPhase('out'); setTimeout(onDone,500); },220); }
    }, dur/steps);
    return () => clearInterval(id);
  }, [onDone]);
  const msg = progress<40?'Inicializando sistema…':progress<75?'Carregando barreiras…':progress<95?'Processando métricas…':'Pronto';
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#020c18 0%,#041422 45%,#061828 100%)', opacity:phase==='out'?0:1, transition:'opacity .5s ease', pointerEvents:phase==='out'?'none':'auto' }}>
      {/* Grid */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(59,130,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.04) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }}/>
      {/* Glow */}
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-60%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(37,99,235,.1) 0%,transparent 65%)', pointerEvents:'none' }}/>
      {/* Card */}
      <div className="animate-scale-in" style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 56px', background:'rgba(9,24,40,0.75)', border:'1px solid rgba(59,130,246,.18)', borderRadius:24, backdropFilter:'blur(24px)', boxShadow:'0 32px 80px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)', minWidth:360 }}>
        <div style={{ marginBottom:28 }}><SeacrestLogo variant="full" height={44} light/></div>
        <div style={{ width:'100%', height:1, marginBottom:24, background:'linear-gradient(90deg,transparent,rgba(59,130,246,.4),transparent)' }}/>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:7, background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Sistema Operacional</div>
          <div style={{ fontSize:19, fontWeight:900, letterSpacing:'-0.025em', color:'#fff', lineHeight:1.2 }}>Monitor de Barreiras<br/>de Segurança</div>
        </div>
        {/* Animated shields */}
        <div style={{ display:'flex', gap:10, marginBottom:28 }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{ animation:`pulse 1.4s ease-in-out ${i*.22}s infinite` }}>
              <ShieldIcon size={18} color={i===1?'#3b82f6':'rgba(59,130,246,.35)'} strokeWidth={i===1?2.5:1.5}/>
            </div>
          ))}
        </div>
        {/* Progress */}
        <div style={{ width:'100%' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, fontWeight:600, color:'rgba(148,163,184,.7)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6 }}>
            <span>Carregando dados</span><span>{progress}%</span>
          </div>
          <div style={{ width:'100%', height:4, borderRadius:2, background:'rgba(255,255,255,.07)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)', borderRadius:2, transition:'width .04s linear', boxShadow:'0 0 8px rgba(96,165,250,.6)' }}/>
          </div>
        </div>
        <div style={{ marginTop:14, fontSize:11, color:'rgba(100,116,139,.8)', letterSpacing:'0.05em' }}>{msg}</div>
      </div>
      <div style={{ position:'absolute', bottom:24, fontSize:10, color:'rgba(71,85,105,.7)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
        Seacrest Petróleo · Segurança Operacional
      </div>
    </div>
  );
}
