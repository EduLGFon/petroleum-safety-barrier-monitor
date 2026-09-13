// Theme icons - sun/moon/monitor appearance switcher.
// This is why it exists: the theme toggle shares these glyphs instead of
// redefining paths per option.
import type { P } from "./base.tsx";
import { D } from "./base.tsx";

// Theme icons: sun/moon/monitor appearance switcher.
export const SunIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  );
export const MoonIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(size, color, strokeWidth, '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>');
export const MonitorIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  );
