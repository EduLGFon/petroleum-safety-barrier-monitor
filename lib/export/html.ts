// Export HTML primitives - timestamp, escaping, download, pills, browser guard.
// This is why it exists: the report file and the CSV share these browser-only
// building blocks instead of reimplementing them per format. Row ceilings live
// in limits.ts (format-driven, not DOM-driven).

// resolveTimeZone: narrows untrusted input (the export request body) to an
// IANA zone name. Anything unknown means "runtime local", never a throw, so
// a bad value can never fail an export.
export function resolveTimeZone(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const zone = v.trim();
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

// browserTimeZone: the IANA zone of the machine running this code. The export
// client sends it along so server-rendered stamps use the user's clock, not
// the server's (a UTC container would otherwise stamp 3h ahead of Brazil).
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

// zoneOffsetLabel: the zone's UTC offset at `now` as "UTC-03:00". Computed
// instead of timeZoneName so the label is identical on every runtime (ICU
// renders the short name as BRT, GMT-3 or -03 depending on the engine).
function zoneOffsetLabel(zone: string | undefined, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    const mins = Math.round((asUtc - now.getTime()) / 60_000);
    const sign = mins < 0 ? "-" : "+";
    const abs = Math.abs(mins);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `UTC${sign}${hh}:${mm}`;
  } catch {
    return "UTC";
  }
}

// Returns current datetime as pt-BR DD/MM/YYYY HH:MM plus the zone offset, so
// the reader always knows which clock the stamp came from. timeZone defaults
// to the runtime local zone; the export route passes the browser zone the
// client sent. `now` is injectable for tests.
export function ts(timeZone?: string, now = new Date()): string {
  const zone = resolveTimeZone(timeZone);
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(now);
  return `${date} ${zoneOffsetLabel(zone, now)}`;
}

// Escapes &<>" for safe HTML/report embedding; run before pill/cell interpolation.
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
