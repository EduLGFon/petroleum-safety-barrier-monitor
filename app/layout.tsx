import type { Metadata } from 'next';
import { ThemeProvider } from '@/context/ThemeContext';
import './globals.css';

export const metadata: Metadata = {
  title:       'SGSO · Inventário de Barreiras de Segurança',
  description: 'Dashboard de inventário das barreiras de segurança — Seacrest Petróleo',
};

// Injected before React hydration to prevent theme flash (FOUC)
const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('sgso-theme');
    document.documentElement.dataset.theme =
      (t === 'light' || t === 'dark' || t === 'amoled') ? t : 'dark';
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
