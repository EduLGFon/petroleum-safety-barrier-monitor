// Theme context - thin proxy over settings theme for themed components.
// This is why it exists: lets any island read/switch theme without
// touching settings storage directly.
import { useSettings } from "./SettingsContext.tsx";
import type { ComponentChildren } from "preact";
import type { Theme } from "../lib/types.ts";
import { useContext } from "preact/hooks";
import { createContext } from "preact";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  setTheme: () => {},
});

// Proxies theme from SettingsContext (`barrier-settings` key); no direct storage, delegates to setTheme.
export function ThemeProvider({ children }: { children: ComponentChildren }) {
  const { settings, setTheme } = useSettings();
  return (
    <ThemeContext.Provider value={{ theme: settings.theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Returns proxied theme state; hydration/persistence handled by SettingsProvider.
export function useTheme() {
  return useContext(ThemeContext);
}
