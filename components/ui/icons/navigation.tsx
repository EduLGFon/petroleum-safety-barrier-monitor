// Navigation icons - search/filter/sort/chevron/close chrome.
// This is why it exists: filter bar, table headers, pagination, and modal
// chrome share these glyphs instead of redefining paths per component.
import type { P } from "./base.tsx";
import { D } from "./base.tsx";

// Navigation icons: search/filter/sort/chevron/close chrome.
export const SearchIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  );
export const FilterIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  );
export const CloseIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(size, color, strokeWidth, '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
export const SortIcon = (
  { size = 14, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
  );
export const ChevronUpIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) => D(size, color, strokeWidth, '<path d="m18 15-6-6-6 6"/>');
export const ChevronDownIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) => D(size, color, strokeWidth, '<path d="m6 9 6 6 6-6"/>');
export const ChevronLeftIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) => D(size, color, strokeWidth, '<path d="m15 18-6-6 6-6"/>');
export const ChevronRightIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) => D(size, color, strokeWidth, '<path d="m9 18 6-6-6-6"/>');
export const ChevronsLeftIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  );
export const ChevronsRightIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
  );
