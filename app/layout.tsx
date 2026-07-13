import type { Metadata } from 'next';
import { ThemeProvider }    from '@/context/ThemeContext';
import { SettingsProvider } from '@/context/SettingsContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Seacrest Petróleo · Monitor de Barreiras de Segurança',
  description: 'Monitor de Barreiras de Segurança — Seacrest Petróleo',
  icons: { icon: '/favicon.svg' },
};

const INIT_SCRIPT = `(function(){try{
  var s=JSON.parse(localStorage.getItem('seacrest-settings')||'{}');
  var t=s.theme||localStorage.getItem('seacrest-theme')||'dark';
  document.documentElement.dataset.theme=(t==='light'||t==='dark'||t==='amoled')?t:'dark';
  if(s.accentColor){
    var P={blue:{p:'#3b82f6',s:'#6366f1',g:'rgba(59,130,246,.2)'},green:{p:'#22c55e',s:'#10b981',g:'rgba(34,197,94,.2)'},red:{p:'#ef4444',s:'#f97316',g:'rgba(239,68,68,.2)'},yellow:{p:'#eab308',s:'#f59e0b',g:'rgba(234,179,8,.2)'},brown:{p:'#b45309',s:'#d97706',g:'rgba(180,83,9,.2)'},mono:{p:'#94a3b8',s:'#cbd5e1',g:'rgba(148,163,184,.2)'},purple:{p:'#a855f7',s:'#c084fc',g:'rgba(168,85,247,.2)'}};
    var c=P[s.accentColor];
    if(c){var r=document.documentElement;r.style.setProperty('--accent',c.p);r.style.setProperty('--accent-2',c.s);r.style.setProperty('--glow',c.g);}
  }
}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }}/></head>
      <body>
        <SettingsProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
