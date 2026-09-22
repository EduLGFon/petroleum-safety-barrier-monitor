// settings-options.ts - pure option data for SettingsPanel (themes, filters, sort, select style).
// Why: keeps shared constants out of JSX so all settings sections import one stable module.
import { MonitorIcon, MoonIcon, SunIcon } from "../ui/Icons.tsx";
import type { FunctionComponent } from "preact";
import type { Theme } from "../../lib/types.ts";

export const THEMES: {
  value: Theme;
  Icon: FunctionComponent<
    { size?: number; color?: string; strokeWidth?: number }
  >;
  label: string;
}[] = [
  { value: "light", Icon: SunIcon, label: "Claro" },
  { value: "dark", Icon: MoonIcon, label: "Escuro" },
  { value: "amoled", Icon: MonitorIcon, label: "Black" },
];
// Live vocabularies arrive via props from the dashboard (SSR/live in HTTP
// mode, dataset-derived in mock mode); no seed fallback lives here so stale
// stations or statuses can never be offered.
export const SORT_OPTS = [
  { value: "id", label: "ID" },
  { value: "tag", label: "TAG" },
  { value: "availability", label: "Disponibilidade" },
  { value: "compliance", label: "Conformidade" },
  { value: "statusSince", label: "Tempo sem contingência" },
];

// selSt: shared select/input style for settings filter fields.
export const selSt = {
  padding: "var(--d-input-y) var(--d-input-x)",
  fontSize: "var(--d-body)",
  background: "var(--bg-elevated)",
  border: "1.5px solid var(--border)",
  borderRadius: "var(--d-input-radius)",
  color: "var(--text-primary)",
  outline: "none",
  cursor: "pointer",
  width: "100%",
  transition: "border .2s",
} as const;
