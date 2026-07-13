interface LogoProps {
  variant?: 'full' | 'icon' | 'waves';
  height?:  number;
  light?:   boolean;
  theme?:   'light' | 'dark' | 'amoled';
}

/** Recreates the official Seacrest Petróleo wave logo mark */
function WaveMark({ size, bg, waveColor }: { size: number; bg: string; waveColor: string }) {
  const s = size / 100;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx={14 * s * 4} fill={bg}/>
      {/* 4 sweeping wave paths — traced from brand asset */}
      <path d="M-2 88 C 18 74, 44 54, 72 30 C 84 20, 96 14, 104 10"
        stroke={waveColor} strokeWidth="8" strokeLinecap="round" fill="none"/>
      <path d="M-2 76 C 16 64, 42 46, 70 22 C 82 12, 95 6, 104 2"
        stroke={waveColor} strokeWidth="6.5" strokeLinecap="round" fill="none"/>
      <path d="M-2 96 C 20 84, 46 64, 76 42 C 88 32, 98 26, 104 22"
        stroke={waveColor} strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M 8 102 C 28 92, 54 74, 82 54 C 92 46, 100 40, 104 36"
        stroke={waveColor} strokeWidth="5.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

export function SeacrestLogo({ variant = 'full', height = 40, light = true, theme }: LogoProps) {
  // Wave colour adapts to context
  const onDark  = light;
  const bg      = onDark ? '#000000' : '#ffffff';
  const waves   = onDark ? '#ffffff' : '#0a1628';
  const textCol = onDark ? '#ffffff' : '#0f172a';
  const subCol  = onDark ? 'rgba(148,163,184,0.85)' : '#64748b';

  if (variant === 'icon') return <WaveMark size={height} bg={bg} waveColor={waves}/>;

  if (variant === 'waves') {
    // Just the waves, no square bg — for use on gradient headers
    return (
      <svg width={height} height={height} viewBox="0 0 100 100" fill="none">
        <path d="M-2 88 C 18 74, 44 54, 72 30 C 84 20, 96 14, 104 10" stroke={onDark?'#fff':'#0a1628'} strokeWidth="9" strokeLinecap="round"/>
        <path d="M-2 76 C 16 64, 42 46, 70 22 C 82 12, 95 6, 104 2"  stroke={onDark?'rgba(255,255,255,.82)':'rgba(10,22,40,.7)'} strokeWidth="7" strokeLinecap="round"/>
        <path d="M-2 96 C 20 84, 46 64, 76 42 C 88 32, 98 26, 104 22" stroke={onDark?'rgba(255,255,255,.6)':'rgba(10,22,40,.5)'} strokeWidth="6" strokeLinecap="round"/>
        <path d="M 8 102 C 28 92, 54 74, 82 54 C 92 46, 100 40, 104 36" stroke={onDark?'rgba(255,255,255,.4)':'rgba(10,22,40,.35)'} strokeWidth="5" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
      <WaveMark size={height} bg={bg} waveColor={waves}/>
      <div style={{ lineHeight:1 }}>
        <div style={{ fontSize:height*0.43, fontWeight:900, letterSpacing:'-0.025em', color:textCol, lineHeight:1.1 }}>Seacrest</div>
        <div style={{ fontSize:height*0.22, fontWeight:600, letterSpacing:'0.2em', textTransform:'uppercase', color:subCol, marginTop:2 }}>Petróleo</div>
      </div>
    </div>
  );
}
