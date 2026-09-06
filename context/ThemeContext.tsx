// Theme context - thin proxy over settings theme for themed components.
// This is why it exists: lets any island read/switch theme without
// touching settings storage directly.
import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { useSettings } from "./SettingsContext.tsx";
import type { Theme } from "../lib/types.ts";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ComponentChildren }) {
  const { settings, setTheme } = useSettings();
  return (
    <ThemeContext.Provider value={{ theme: settings.theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
