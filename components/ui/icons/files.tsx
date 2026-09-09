// File/export icons - download plus spreadsheet/pdf/text variants.
// This is why it exists: the export toolbar buttons share these glyphs
// instead of redefining paths per format.
import type { P } from "./base.tsx";
import { D } from "./base.tsx";

// File/export icons: download + spreadsheet/pdf/text variants.
export const DownloadIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  );
export const FileSpreadsheetIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/>',
  );
export const FilePdfIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13v-1h1.5a1 1 0 0 1 0 2H9v1"/><path d="M13 12v3"/><path d="M17 12h-1v3h1"/><path d="M17 13.5h-1"/>',
  );
export const FileTextIcon = (
  { size = 16, color = "currentColor", strokeWidth = 2 }: P,
) =>
  D(
    size,
    color,
    strokeWidth,
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  );
