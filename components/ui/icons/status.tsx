// Status icons - shield/check/alert/activity health states.
// This is why it exists: availability, conformity, and criticality badges
// across table, modal, and band share these glyphs instead of redefining
// paths per component.
import type { P } from "./base.tsx";
import { D } from "./base.tsx";

// Status icons: shield/check/alert/activity health states.
export const ShieldIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  );
export const ShieldCheckIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  );
export const CheckCircleIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  );
export const XCircleIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  );
export const AlertTriangleIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  );
export const AlertOctagonIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  );
export const ActivityIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  );
