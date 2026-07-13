import { ThemeToggle } from './ui/ThemeToggle';
import { SeacrestLogo } from './ui/SeacrestLogo';
import { ShieldIcon } from './ui/Icons';
export function Header() {
  return (
    <header style={{ background:'var(--hero-grad)', borderRadius:16, padding:'22px 28px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap', position:'relative', overflow:'hidden', boxShadow:'var(--shadow-md)' }}>
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(59,130,246,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,.05) 1px,transparent 1px)', backgroundSize:'32px 32px' }}/>
        <div style={{ position:'absolute', top:-60, right:60, width:240, height:240, borderRadius:'50%', background:'radial-gradient(circle,rgba(59,130,246,.22) 0%,transparent 70%)' }}/>
        <div style={{ position:'absolute', bottom:-40, right:280, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(124,58,237,.16) 0%,transparent 70%)' }}/>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,rgba(59,130,246,.5),rgba(167,139,250,.4),transparent)' }}/>
      </div>
      {/* Brand + Title */}
      <div style={{ display:'flex', alignItems:'center', gap:20, position:'relative' }}>
        <SeacrestLogo variant="full" height={42} light/>
        <div style={{ width:1, height:40, background:'rgba(255,255,255,0.12)', flexShrink:0 }}/>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <ShieldIcon size={13} color="rgba(96,165,250,0.8)" strokeWidth={2}/>
            <span style={{ fontSize:9, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
              Sistema de Segurança Operacional
            </span>
          </div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:900, color:'#fff', letterSpacing:'-0.03em', lineHeight:1.15, textShadow:'0 2px 16px rgba(0,0,0,.4)' }}>
            Monitor de Barreiras de Segurança
          </h1>
        </div>
      </div>
      {/* Meta + toggle */}
      <div style={{ display:'flex', alignItems:'center', gap:14, position:'relative', flexWrap:'wrap' }}>
        <div style={{ textAlign:'right', fontSize:11, color:'rgba(148,163,184,.8)', lineHeight:1.7 }}>
          <div style={{ fontFamily:'ui-monospace,"Cascadia Code",monospace', letterSpacing:'0.05em', fontSize:10 }}>Todas as Concessões · Rev. 00</div>
          <div>{new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
        </div>
        <ThemeToggle/>
      </div>
    </header>
  );
}
