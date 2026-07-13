import type { Metadata } from 'next';
import { ThemeProvider }    from '@/context/ThemeContext';
import { SettingsProvider } from '@/context/SettingsContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Seacrest Petróleo · Monitor de Barreiras de Segurança',
  description: 'Monitor de Barreiras de Segurança — Seacrest Petróleo',
  icons: { icon: '/favicon.svg' },
};

// Runs before React hydration: apply theme + accent to prevent FOUC
const INIT = `(function(){try{
  var s=JSON.parse(localStorage.getItem('seacrest-settings')||'{}');
  var t=s.theme||'dark';
  document.documentElement.dataset.theme=(t==='light'||t==='dark'||t==='amoled')?t:'dark';
  if(s.reduceMotion) document.documentElement.classList.add('no-anim');
  var P={blue:{p:'#3b82f6',s:'#6366f1',g:'rgba(59,130,246,.18)'},
         green:{p:'#22c55e',s:'#10b981',g:'rgba(34,197,94,.18)'},
         red:{p:'#ef4444',s:'#f97316',g:'rgba(239,68,68,.18)'},
         yellow:{p:'#eab308',s:'#f59e0b',g:'rgba(234,179,8,.18)'},
         brown:{p:'#b45309',s:'#d97706',g:'rgba(180,83,9,.18)'},
         mono:{p:'#94a3b8',s:'#cbd5e1',g:'rgba(148,163,184,.18)'},
         purple:{p:'#a855f7',s:'#c084fc',g:'rgba(168,85,247,.18)'}};
  var c=P[s.accentColor||'blue'];
  if(c){var r=document.documentElement;
    r.style.setProperty('--accent',c.p);
    r.style.setProperty('--accent-2',c.s);
    r.style.setProperty('--glow',c.g);}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INIT }}/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      </head>
      <body suppressHydrationWarning>
        <SettingsProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
