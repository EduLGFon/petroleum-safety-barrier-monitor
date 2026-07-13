import type { Metadata } from 'next';
import { ThemeProvider } from '@/context/ThemeContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Seacrest Petróleo · Monitor de Barreiras de Segurança',
  description: 'Monitor de Barreiras de Segurança — Seacrest Petróleo',
  icons: { icon: '/favicon.svg' },
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('seacrest-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark'||t==='amoled')?t:'dark';}catch(_){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
