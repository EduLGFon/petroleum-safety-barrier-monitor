interface LogoProps { variant?:'full'|'icon'; height?:number; light?:boolean; }

export function SeacrestLogo({ variant='full', height=40, light=true }: LogoProps) {
  const id = `sc-${height}`;
  const icon = (
    <svg width={height} height={height} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id={`${id}-s`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8"/>
          <stop offset="100%" stopColor="#1d4ed8"/>
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#ea580c"/>
        </linearGradient>
      </defs>
      <path d="M20 3L5 9v10c0 8.8 6.4 17.1 15 19C28.6 36.1 35 27.8 35 19V9L20 3z" fill={`url(#${id}-s)`}/>
      <path d="M20 3L5 9v10c0 .6.02 1.2.06 1.8C8.4 16 13.8 13 20 13s11.6 3 14.94 7.8c.04-.6.06-1.2.06-1.8V9L20 3z" fill="rgba(255,255,255,0.12)"/>
      <path d="M13 19c1.8-1.3 2.8-1.3 5 0s3.2 1.3 5 0" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M13 23c1.8-1.3 2.8-1.3 5 0s3.2 1.3 5 0" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M20 11c0 0-3 2.8-3 5.8 0 1.7 1.3 3 3 3s3-1.3 3-3C23 13.8 20 11 20 11z" fill={`url(#${id}-f)`}/>
    </svg>
  );

  if (variant === 'icon') return icon;

  const textColor = light ? '#ffffff' : '#0f172a';
  const subColor  = light ? 'rgba(148,163,184,0.85)' : '#64748b';

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
      {icon}
      <div style={{ lineHeight:1 }}>
        <div style={{ fontSize:height*0.43, fontWeight:900, letterSpacing:'-0.025em', color:textColor, lineHeight:1.1 }}>
          Seacrest
        </div>
        <div style={{ fontSize:height*0.22, fontWeight:600, letterSpacing:'0.2em', textTransform:'uppercase', color:subColor, marginTop:2 }}>
          Petróleo
        </div>
      </div>
    </div>
  );
}
