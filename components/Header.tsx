import { ThemeToggle } from './ui/ThemeToggle';

export function Header() {
  return (
    <header style={{
      background: 'var(--hero-grad)',
      borderRadius: 16,
      padding: '20px 24px',
      marginBottom: 20,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
    }}>
      {/* Decorative orbs */}
      <div style={{
        position: 'absolute', top: -40, right: 80,
        width: 180, height: 180, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -30, right: 240,
        width: 120, height: 120, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Brand */}
      <div style={{ position: 'relative' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
          textTransform: 'uppercase', marginBottom: 5,
          background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          SEACREST PETRÓLEO · SGSO
        </div>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 900,
          color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.1,
          textShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          Inventário de Barreiras de Segurança
        </h1>
        <p style={{ margin: '5px 0 0', fontSize: 12, color: 'rgba(148,163,184,0.9)' }}>
          Todas as Concessões · Rev. 00 · SGSO-FR-0024
        </p>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', position: 'relative' }}>
        <div style={{
          textAlign: 'right', fontSize: 11,
          color: 'rgba(148,163,184,0.8)', lineHeight: 1.6,
        }}>
          <div style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em' }}>
            SGSO-FR-0024-XXXX
          </div>
          <div>{new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })}</div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
