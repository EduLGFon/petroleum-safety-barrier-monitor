import { ThemeToggle }  from './ui/ThemeToggle';
import { SeacrestLogo } from './ui/SeacrestLogo';
import { ShieldIcon }   from './ui/Icons';

interface Props { onOpenSettings: () => void; }

export function Header({ onOpenSettings }: Props) {
  return (
    <header style={{ background:'var(--hero-grad)', borderRadius:16, padding:'22px 28px', marginBottom:20,
      display:'flex', justifyContent:'space-between', alignItems:'center',
      gap:16, flexWrap:'wrap', position:'relative', overflow:'hidden',
      boxShadow:'var(--shadow-md)',
      animation:'cardIn .6s cubic-bezier(.34,1.2,.64,1) both',
    }}>
      {/* Decorative layer */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(59,130,246,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,.05) 1px,transparent 1px)', backgroundSize:'32px 32px' }}/>
        <div style={{ position:'absolute', top:-60, right:60, width:260, height:260, borderRadius:'50%', background:'radial-gradient(circle,rgba(59,130,246,.2) 0%,transparent 70%)', animation:'orb 10s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', bottom:-40, right:300, width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(124,58,237,.15) 0%,transparent 70%)', animation:'orb 7s ease-in-out 3s infinite' }}/>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,var(--accent),var(--accent-2),transparent)' }}/>
      </div>

      {/* Brand + Title */}
      <div style={{ display:'flex', alignItems:'center', gap:20, position:'relative' }}>
        <div style={{ animation:'cardIn .5s .05s cubic-bezier(.34,1.2,.64,1) both' }}>
          <SeacrestLogo variant="icon" height={46} light/>
        </div>
        <div style={{ width:1, height:44, background:'rgba(255,255,255,.12)', flexShrink:0 }}/>
        <div style={{ animation:'slideInLeft .5s .1s cubic-bezier(.34,1.2,.64,1) both' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <ShieldIcon size={12} color="rgba(96,165,250,.8)" strokeWidth={2.5}/>
            <span style={{ fontSize:9, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase',
                           background:'linear-gradient(90deg,#60a5fa,#a78bfa)',
                           WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
              Sistema de Segurança Operacional
            </span>
          </div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:900, color:'#fff',
                       letterSpacing:'-0.03em', lineHeight:1.15,
                       textShadow:'0 2px 16px rgba(0,0,0,.4)' }}>
            Monitor de Barreiras de Segurança
          </h1>
        </div>
      </div>

      {/* Right controls */}
      <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative',
                    flexWrap:'wrap', animation:'slideInLeft .5s .15s cubic-bezier(.34,1.2,.64,1) both' }}>
        <div style={{ textAlign:'right', fontSize:11, color:'rgba(148,163,184,.8)', lineHeight:1.7 }}>
          <div style={{ fontFamily:'ui-monospace,"Cascadia Code",monospace', letterSpacing:'0.05em', fontSize:10 }}>Todas as Concessões</div>
          <div>{new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
        </div>
        <ThemeToggle/>
        {/* Settings gear button */}
        <button onClick={onOpenSettings} className="lift"
          title="Configurações"
          style={{ width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center',
                   background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)',
                   borderRadius:10, cursor:'pointer', backdropFilter:'blur(4px)',
                   transition:'all .2s' }}>
          <GearIcon/>
        </button>
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/>
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}
