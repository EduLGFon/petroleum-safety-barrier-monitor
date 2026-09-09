// Export HTML primitives - timestamp, escaping, download, pills, browser guard.
// This is why it exists: spreadsheet, print report, and CSV share these
// browser-only building blocks instead of reimplementing them per format.

// Returns current datetime as pt-BR DD/MM/YYYY HH:MM stamp for report headers.
export function ts(): string {
  return new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Escapes &<>" for safe HTML/XLS/PDF embedding; run before pill/cell interpolation.
export function escHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Triggers a browser download via object URL + temp anchor; revokes URL immediately to avoid leaks.
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Throws when document is undefined; guards all exports which need DOM/Blob URLs (browser-only).
export function assertBrowser(): void {
  if (typeof document === "undefined") {
    throw new Error("Exports run in the browser only.");
  }
}

// Rounded status pill: tinted background with bold colored text. Renders
// in Excel HTML, LibreOffice and print alike (radius ignored where
// unsupported, tint always shows).
export function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:1px 9px;border-radius:999px;background:${color}1F;color:${color};font-weight:bold;">${
    escHtml(text)
  }</span>`;
}
