'use client';
import { useState } from 'react';
import type { KpiSnapshot } from '@/lib/types';
import { DISP_COLORS } from '@/lib/constants';
import { ActivityIcon } from './ui/Icons';

const SEGS = [
  { key:'Disponível',                  short:'Disponível'    },
  { key:'Fora de Operação',            short:'Fora de Op.'   },
  { key:'Indisponível Contingenciado', short:'Indisp. Cont.' },
  { key:'Degradado Contingenciado',    short:'Degr. Cont.'   },
  { key:'Degradado',                   short:'Degradado'     },
  { key:'Indisponível',                short:'Indisponível'  },
] as const;

interface Props { kpi: KpiSnapshot; activeFilter: string; onFilter: (k: string) => void; }

export function StatusBand({ kpi, activeFilter, onFilter }: Props) {
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const counts: Record<string, number> = {
    'Disponível':                  kpi.disponivel,
    'Fora de Operação':            kpi.foraDeOp,
    'Indisponível Contingenciado': kpi.indispCont,
    'Degradado Contingenciado':    kpi.degrCont,
    'Degradado':                   kpi.degradado,
    'Indisponível':                kpi.indisponivel,
  };
  const total = kpi.total || 1;

  function handleClick(key: string) {
    setPressedKey(key);
    onFilter(activeFilter === key ? '' : key);
    setTimeout(() => setPressedKey(null), 450);
  }

  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, fontWeight:700,
                    color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:8 }}>
        <ActivityIcon size={12} color="var(--accent)" strokeWidth={2}/>
        Disponibilidade — clique para filtrar
      </div>

      <div style={{ display:'flex', gap:4, height:66, background:'var(--bg-elevated)',
                    borderRadius:14, padding:4, border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
        {SEGS.map((seg, i) => {
          const count   = counts[seg.key] ?? 0;
          const ptPct   = Math.round((count / total) * 100);
          const cfg     = DISP_COLORS[seg.key];
          const isActive= activeFilter === seg.key;
          const isDimmed= !!activeFilter && !isActive;
          const isPressed=pressedKey === seg.key;

          return (
            <button key={seg.key}
              onClick={() => handleClick(seg.key)}
              title={seg.key}
              aria-pressed={isActive}
              className={isPressed ? 'animate-pop' : ''}
              style={{
                flex:      Math.max(count, 1),
                background:cfg.grad,
                border:    isActive ? '2px solid rgba(255,255,255,.7)' : '2px solid transparent',
                borderRadius:10, cursor:'pointer',
                display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center',
                gap:1, padding:'0 5px',
                opacity:   isDimmed ? 0.14 : 1,
                transform: isActive  ? 'scale(1.04)'  : 'scale(1)',
                transition:'opacity .25s ease, transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s, border .15s',
                overflow:'hidden', minWidth:52,
                boxShadow: isActive ? `0 0 20px ${cfg.solid}66` : 'none',
                position:'relative',
                animationDelay:`${i * 45}ms`,
              }}>
              {/* Shine */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'44%',
                background:'linear-gradient(180deg,rgba(255,255,255,.14) 0%,transparent 100%)',
                pointerEvents:'none' }}/>
              {/* Active ripple ring */}
              {isActive && (
                <div style={{ position:'absolute', inset:0, borderRadius:10,
                  boxShadow:`inset 0 0 0 2px rgba(255,255,255,.4)`,
                  animation:'pulse 2s ease-in-out infinite', pointerEvents:'none' }}/>
              )}
              <span style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,.82)',
                letterSpacing:'0.07em', textTransform:'uppercase',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                maxWidth:'100%', position:'relative' }}>{seg.short}</span>
              <span style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1,
                textShadow:'0 1px 6px rgba(0,0,0,.4)', position:'relative' }}>
                {count.toLocaleString('pt-BR')}
              </span>
              <span style={{ fontSize:8, color:'rgba(255,255,255,.62)', fontWeight:600, position:'relative' }}>
                {ptPct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
