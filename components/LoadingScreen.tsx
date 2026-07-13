'use client';
import { useEffect, useState, useCallback } from 'react';
import { SeacrestLogo } from './ui/SeacrestLogo';
import { ShieldIcon } from './ui/Icons';

interface Props { onDone: () => void; }

export function LoadingScreen({ onDone }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase,    setPhase]    = useState<'enter'|'loading'|'done'|'exit'>('enter');

  const handleDone = useCallback(onDone, [onDone]);

  useEffect(() => {
    // Stage 1: entrance animation
    const enterTimer = setTimeout(() => setPhase('loading'), 300);
    return () => clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (phase !== 'loading') return;
    const steps = 60, dur = 1600;
    let step = 0;
    const id = setInterval(() => {
      step++;
      // Easing: fast start, slow near end
      const t = step / steps;
      const eased = t < 0.6
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setProgress(Math.round(eased * 100));
      if (step >= steps) {
        clearInterval(id);
        setPhase('done');
        setTimeout(() => { setPhase('exit'); setTimeout(handleDone, 650); }, 280);
      }
    }, dur / steps);
    return () => clearInterval(id);
  }, [phase, handleDone]);

  const msg =
    progress < 30 ? 'Inicializando sistema…' :
    progress < 55 ? 'Carregando inventário…' :
    progress < 80 ? 'Processando barreiras…' :
    progress < 95 ? 'Calculando métricas…'   : 'Pronto ✓';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#020c18',
      opacity:    phase === 'exit' ? 0 : 1,
      transform:  phase === 'exit' ? 'scale(1.03)' : 'scale(1)',
      transition: 'opacity .65s ease, transform .65s ease',
      pointerEvents: phase === 'exit' ? 'none' : 'auto',
    }}>
      {/* Animated background grid */}
      <div style={{
        position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none',
      }}>
        <div style={{
          position:'absolute', inset:0,
          backgroundImage:'linear-gradient(rgba(59,130,246,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.05) 1px,transparent 1px)',
          backgroundSize:'40px 40px',
          animation:'pulse 4s ease-in-out infinite',
        }}/>
        {/* Animated radial glow orbs */}
        <div style={{ position:'absolute', top:'30%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle,rgba(37,99,235,.08) 0%,transparent 60%)', animation:'orb 8s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', top:'70%', left:'30%', transform:'translate(-50%,-50%)', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(124,58,237,.06) 0%,transparent 60%)', animation:'orb 6s ease-in-out 2s infinite' }}/>
      </div>

      {/* Main card */}
      <div style={{
        position:'relative', display:'flex', flexDirection:'column', alignItems:'center',
        padding:'52px 60px',
        background:'rgba(9,24,40,0.8)', backdropFilter:'blur(28px)',
        border:'1px solid rgba(59,130,246,.15)',
        borderRadius:28,
        boxShadow:'0 40px 100px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06)',
        minWidth:380,
        opacity:    phase === 'enter' ? 0 : 1,
        transform:  phase === 'enter' ? 'scale(.9) translateY(20px)' : 'scale(1) translateY(0)',
        transition: 'opacity .5s cubic-bezier(.34,1.2,.64,1), transform .5s cubic-bezier(.34,1.2,.64,1)',
      }}>
        {/* Top shine */}
        <div style={{ position:'absolute', top:0, left:'10%', right:'10%', height:1, background:'linear-gradient(90deg,transparent,rgba(59,130,246,.5),rgba(167,139,250,.4),transparent)', borderRadius:1 }}/>

        {/* Logo — real Seacrest waves */}
        <div style={{ marginBottom:32, filter:'drop-shadow(0 4px 24px rgba(59,130,246,.35))', animation:'pulse 3s ease-in-out infinite' }}>
          <SeacrestLogo variant="icon" height={80} light/>
        </div>

        {/* Brand text */}
        <div style={{ textAlign:'center', marginBottom:8 }}>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:6,
                        background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            Seacrest Petróleo
          </div>
          <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-0.03em', color:'#fff', lineHeight:1.2 }}>
            Monitor de Barreiras<br/>de Segurança
          </div>
        </div>

        {/* Divider */}
        <div style={{ width:'100%', height:1, margin:'24px 0', background:'linear-gradient(90deg,transparent,rgba(59,130,246,.35),transparent)' }}/>

        {/* Animated shields */}
        <div style={{ display:'flex', gap:12, marginBottom:28 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ animation:`pulse 1.6s ease-in-out ${i*.24}s infinite`,
                                   transform:`scale(${i===1?1.15:0.9})` }}>
              <ShieldIcon size={20} color={i===1?'#3b82f6':'rgba(59,130,246,.3)'} strokeWidth={i===1?2.5:1.5}/>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ width:'100%' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, fontWeight:700,
                        color:'rgba(148,163,184,.7)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:8 }}>
            <span style={{ transition:'all .3s' }}>{msg}</span>
            <span style={{
              color: progress >= 100 ? '#22c55e' : 'rgba(148,163,184,.7)',
              transition: 'color .3s',
            }}>{progress}%</span>
          </div>
          {/* Track */}
          <div style={{ width:'100%', height:5, borderRadius:3, background:'rgba(255,255,255,.06)', overflow:'hidden', position:'relative' }}>
            {/* Animated fill */}
            <div style={{
              height:'100%', width:`${progress}%`,
              background:'linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)',
              borderRadius:3,
              transition:'width .06s linear',
              boxShadow:'0 0 10px rgba(96,165,250,.7)',
              position:'relative',
            }}>
              {/* Shimmer */}
              <div style={{
                position:'absolute', inset:0,
                background:'linear-gradient(90deg,transparent 30%,rgba(255,255,255,.4) 50%,transparent 70%)',
                backgroundSize:'200% 100%',
                animation:'shimmer 1.5s linear infinite',
              }}/>
            </div>
          </div>
        </div>

        {/* Done checkmark */}
        {phase === 'done' && (
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none', animation:'pop .4s cubic-bezier(.34,1.56,.64,1)' }}>
            <div style={{ width:70, height:70, borderRadius:'50%', background:'rgba(34,197,94,.15)', border:'2px solid #22c55e', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 30px rgba(34,197,94,.5)' }}>
              <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
                <path d="M2 11L10 19L26 3" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Bottom tagline */}
      <div style={{ position:'absolute', bottom:28, fontSize:10, color:'rgba(71,85,105,.6)', letterSpacing:'0.12em', textTransform:'uppercase', animation:'fadeInFast 1s 0.5s both' }}>
        Seacrest Petróleo · Segurança Operacional
      </div>
    </div>
  );
}
