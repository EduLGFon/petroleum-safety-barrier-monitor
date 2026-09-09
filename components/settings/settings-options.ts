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
  { value: "light", Icon: SunIcon, label: "Aurora Claro" },
  { value: "dark", Icon: MoonIcon, label: "Aurora Escura" },
  { value: "amoled", Icon: MonitorIcon, label: "Aurora Black" },
];
export const DISP_OPTS = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
  "Degradado",
  "Indisponível",
];
export const CONF_OPTS = ["Conforme", "Não Conforme"];
export const SORT_OPTS = [
  { value: "id", label: "ID" },
  { value: "tag", label: "TAG" },
  { value: "disponibilidade", label: "Disponibilidade" },
  { value: "conformidade", label: "Conformidade" },
  { value: "statusSince", label: "Tempo sem contingência" },
];

// selSt: shared select/input style for filter and member fields.
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
