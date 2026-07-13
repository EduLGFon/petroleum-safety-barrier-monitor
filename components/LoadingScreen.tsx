'use client';
import { useEffect, useState, useCallback } from 'react';
import { SeacrestLogo } from './ui/SeacrestLogo';

interface Props { onDone: () => void; }

export function LoadingScreen({ onDone }: Props) {
  const [progress, setProgress] = useState(0);
  const [ready,    setReady]    = useState(false);
  const [exit,     setExit]     = useState(false);

  const done = useCallback(onDone, [onDone]);

  useEffect(() => {
    const steps = 55, dur = 1500;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const t = step / steps;
      const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
      setProgress(Math.round(e * 100));
      if (step >= steps) {
        clearInterval(id);
        setReady(true);
        setTimeout(() => { setExit(true); setTimeout(done, 550); }, 300);
      }
    }, dur / steps);
    return () => clearInterval(id);
  }, [done]);

  const msg = progress < 35 ? 'Inicializando…' : progress < 65 ? 'Carregando inventário…' : progress < 90 ? 'Processando métricas…' : 'Concluído';

  return (
    <div style={{
      position:'fixed',inset:0,zIndex:9999,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:'#020c18',
      opacity:exit?0:1,
      transition:'opacity .55s cubic-bezier(0.4,0,1,1)',
      pointerEvents:exit?'none':'auto',
    }}>
      {/* Background */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(59,130,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.04) 1px,transparent 1px)',backgroundSize:'48px 48px',opacity:0.6}}/>
        <div style={{position:'absolute',top:'40%',left:'50%',transform:'translate(-50%,-50%)',width:640,height:640,borderRadius:'50%',background:'radial-gradient(circle,rgba(37,99,235,.07) 0%,transparent 60%)',animation:'orb 9s ease-in-out infinite'}}/>
      </div>

      {/* Card */}
      <div style={{
        position:'relative',display:'flex',flexDirection:'column',alignItems:'center',
        padding:'48px 56px',
        background:'rgba(9,24,40,0.82)',backdropFilter:'blur(24px)',
        border:'1px solid rgba(59,130,246,.12)',borderRadius:24,
        boxShadow:'0 32px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05)',
        minWidth:360,
        animation:'scaleIn .45s var(--ease-out) both',
      }}>
        <div style={{position:'absolute',top:0,left:'8%',right:'8%',height:1,background:'linear-gradient(90deg,transparent,rgba(59,130,246,.4),rgba(167,139,250,.3),transparent)',borderRadius:1}}/>

        {/* Logo */}
        <div style={{marginBottom:30,filter:'drop-shadow(0 4px 20px rgba(59,130,246,.28))'}}>
          <SeacrestLogo variant="icon" height={76} light/>
        </div>

        {/* Brand text */}
        <div style={{textAlign:'center',marginBottom:6}}>
          <div style={{fontSize:10,fontWeight:800,letterSpacing:'0.2em',textTransform:'uppercase',marginBottom:8,
            background:'linear-gradient(90deg,#60a5fa,#a78bfa)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>
            Seacrest Petróleo
          </div>
          <div style={{fontSize:20,fontWeight:800,letterSpacing:'-0.025em',color:'#fff',lineHeight:1.25}}>
            Monitor de Barreiras<br/>de Segurança
          </div>
        </div>

        {/* Divider */}
        <div style={{width:'100%',height:1,margin:'24px 0',background:'linear-gradient(90deg,transparent,rgba(59,130,246,.3),transparent)'}}/>

        {/* Progress */}
        <div style={{width:'100%'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600,
            color:'rgba(148,163,184,.65)',letterSpacing:'0.06em',marginBottom:8}}>
            <span style={{transition:'all .3s'}}>{msg}</span>
            <span style={{color:ready?'rgba(148,184,163,.9)':'rgba(148,163,184,.65)',transition:'color .3s'}}>{progress}%</span>
          </div>
          <div style={{width:'100%',height:4,borderRadius:2,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,
              background:'linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)',
              borderRadius:2,transition:'width .07s linear',
              boxShadow:`0 0 ${progress>90?16:8}px rgba(96,165,250,.${progress>90?7:5})`,
              position:'relative'}}>
              {progress < 100 && (
                <div style={{position:'absolute',inset:0,
                  background:'linear-gradient(90deg,transparent 30%,rgba(255,255,255,.3) 50%,transparent 70%)',
                  backgroundSize:'200% 100%',animation:'shimmer 1.4s linear infinite'}}/>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{position:'absolute',bottom:24,fontSize:10,color:'rgba(71,85,105,.55)',letterSpacing:'0.12em',textTransform:'uppercase',animation:'fadeInFast .8s .4s both'}}>
        Seacrest Petróleo · Segurança Operacional
      </div>
    </div>
  );
}
