'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Theme } from '@/lib/types';
interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; }
const ThemeContext = createContext<ThemeCtx>({ theme:'dark', setTheme:()=>{} });
const KEY = 'seacrest-theme';
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  useEffect(() => {
    const s = localStorage.getItem(KEY) as Theme|null;
    if (s==='light'||s==='dark'||s==='amoled') setThemeState(s);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { return useContext(ThemeContext); }
