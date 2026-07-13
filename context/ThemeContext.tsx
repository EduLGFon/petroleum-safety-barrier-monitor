'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { useSettings } from './SettingsContext';
import type { Theme } from '@/lib/types';
interface ThemeCtx { theme:Theme; setTheme:(t:Theme)=>void; }
const ThemeContext = createContext<ThemeCtx>({ theme:'dark', setTheme:()=>{} });
export function ThemeProvider({ children }: { children:ReactNode }) {
  const { settings, setTheme } = useSettings();
  return (
    <ThemeContext.Provider value={{ theme:settings.theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() { return useContext(ThemeContext); }
