// Domain icons - user/building/pin/tag/calendar/clock/history/meta + CTA arrow.
// This is why it exists: barrier detail, settings, and header surfaces share
// these glyphs instead of redefining paths per component.
import type { P } from "./base.tsx";
import { D } from "./base.tsx";

// Domain icons: user/building/pin/tag/calendar/clock/history/meta + CTA arrow.
export const UserIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>',
  );
export const BuildingIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01M12 14h.01M8 14h.01M16 14h.01"/>',
  );
export const MapPinIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  );
export const TagIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l6.58-6.58a1 1 0 0 0 0-1.42L12 2Z"/><path d="M7 7h.01"/>',
  );
export const CalendarIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  );
export const ClockIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  );
export const HistoryIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  );
export const InfoIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  );
export const LayersIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.65-8.56 3.89a2 2 0 0 1-1.66 0L3.22 12.5"/><path d="m22 17.65-8.56 3.89a2 2 0 0 1-1.66 0L3.22 17.5"/>',
  );
export const TargetIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  );
export const FlameIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  );
export const WrenchIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  );
export const ArrowRightIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(size, color, strokeWidth, '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');
