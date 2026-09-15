// Shared Fracttal barrier mapping rules (Phase 0 convergence).
// This is why it exists: the dump import script and the live sync mapper
// derived availability, station, typology, and tags independently and
// diverged (first live sync would have decayed Degradado rows and churned
// tags/typology). Both paths now call these pure rules; the import keeps
// file streaming + SQL, the sync keeps upsert + soft-delete. Precedence:
// the import owns catalog rows (creates locations/categories), the sync
// never creates them (unknown labels skip and are listed, never guessed).
export const AVAILABILITY_AVAILABLE = 0;
export const AVAILABILITY_OUT_OF_SERVICE = 1;
export const AVAILABILITY_DEGRADED = 4;
export const AVAILABILITY_UNAVAILABLE = 5;

// Typology ids (db/seed_lookups.sql); the derived value wins whenever a
// parent chain is present, IMPORT_DEFAULTS covers rows without one.
export const TYPOLOGY_STATION = 0;
export const TYPOLOGY_PLANT = 1;
export const TYPOLOGY_PIPELINE = 2;
export const TYPOLOGY_OPERATIONS_BASE = 3;
export const TYPOLOGY_COMPRESSION = 4;
export const TYPOLOGY_MEASUREMENT = 5;

// Author row + history note stamped on freshly imported barriers.
export const AUTHOR_IMPORT = 10;
export const IMPORT_NOTE = "Importado do Fracttal";

// Category fallback for empty taxonomy labels; criticality default applied
// with a warning when the upstream label is unknown (listed, not silent).
export const CATEGORY_FALLBACK = "(sem categoria)";
export const CRITICALITY_DEFAULT = 0;

// Barrier scope: case/accent-insensitive keywords from
// docs/FRACTTAL-DATA.md section 3, matched against the asset-type taxonomy
// label only. Free-text description is NOT matched: it pulls in non-barrier
// types (a gas pump whose description mentions "gas").
export const BARRIER_KEYWORDS: readonly string[] = [
  "valvula",
  "extintor",
  "detec",
  "alarme",
  "sirene",
  "incendio",
  "bloqueio",
  "intertravamento",
  "seguran",
  "emerg",
  "psv",
  "alivio",
  "hidrante",
  "gas",
  "fumaca",
  "h2s",
  "corta-?chamas",
];

// foldText lowercases and strips accents so "Valvula" matches "valvula".
export function foldText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().normalize("NFD").replace(
    /[\u0300-\u036f]/g,
    "",
  );
}

// isBarrierCandidate tests one taxonomy label against the keyword scope.
export function isBarrierCandidate(
  groupsDescription: string | null | undefined,
): boolean {
  return new RegExp(BARRIER_KEYWORDS.join("|")).test(
    foldText(groupsDescription),
  );
}

// stationCodeOf extracts the L2 station slug from an equipment parent chain
// ("// Seacrest Petroleo/ Area Norte/ SAO MATEUS - SM/ ...") by taking the
// trailing " - CODE" token. Validated against the full equipment file: this
// rule reproduces the 39 distinct station codes.
export function stationCodeOf(
  parentDescription: string | null | undefined,
): string {
  const parts = (parentDescription ?? "").split("/").map((p) => p.trim())
    .filter((p) => p !== "");
  const seg = parts.length > 2 ? parts[2] : (parts[parts.length - 1] ?? "");
  const match = seg.match(/\s*-\s*([A-Z0-9][A-Z0-9-]*)\s*$/);
  return (match ? match[1] : seg).toUpperCase();
}

// typologyIdOf derives typology from the parent chain by keyword precedence.
export function typologyIdOf(
  parentDescription: string | null | undefined,
): number {
  const text = foldText(parentDescription);
  if (/compres/.test(text)) return TYPOLOGY_COMPRESSION;
  if (/medic|medid/.test(text)) return TYPOLOGY_MEASUREMENT;
  if (/duto|transfer/.test(text)) return TYPOLOGY_PIPELINE;
  if (/plant|process/.test(text)) return TYPOLOGY_PLANT;
  if (/estac|coletor/.test(text)) return TYPOLOGY_STATION;
  return TYPOLOGY_OPERATIONS_BASE;
}

// locationTypeOf classifies a station code for the locations table. Labels
// are PT display values matching the existing lookup rows.
export function locationTypeOf(stationCode: string): string {
  if (stationCode.includes("DUTO")) return "Duto de Transferência";
  if (/MOVEL|MÓVEL|TESTE/.test(stationCode)) return "Unidade Móvel";
  return "Instalação";
}

// tagFor prefers the human description, falling back to the asset code.
export function tagFor(
  description: string | null | undefined,
  code: string,
): string {
  return (description ?? "").trim() || code;
}

// categoryFor trims the taxonomy label, falling back when it is empty.
export function categoryFor(
  groupsDescription: string | null | undefined,
): string {
  return (groupsDescription ?? "").trim() || CATEGORY_FALLBACK;
}

// classifyCorrective sorts one work order into an event slot: emergency
// corrective (or functional failure) is urgent, planned corrective (or
// potential failure) is planned, anything else carries no status signal.
export function classifyCorrective(
  typeText: string | null | undefined,
  failureText: string | null | undefined,
): "urgent" | "planned" | null {
  const type = foldText(typeText);
  const failure = foldText(failureText);
  if (
    type.includes("corretiva emergencial") ||
    failure.includes("falha funcional")
  ) return "urgent";
  if (
    type.includes("corretiva planejada") || failure.includes("falha potencial")
  ) return "planned";
  return null;
}

// classifyRequest sorts one work request the same way; requests whose type
// is neither corrective nor failure carry no status signal. Note: abbreviated
// live labels ("CORR - Planejada") carry no corrective stem and stay
// unmatched (pre-existing import behavior); Phase 1 verifies live types.
export function classifyRequest(
  typeText: string | null | undefined,
): "urgent" | "planned" | null {
  const type = foldText(typeText);
  if (!type.includes("corretiva") && !type.includes("falha")) return null;
  return type.includes("emergencial") ? "urgent" : "planned";
}

// Request statuses that count as closed: solved (4), cancelled (5), solved
// via work order (6), rejected (12). Everything else is an open request.
export const CLOSED_REQUEST_STATUSES: ReadonlySet<number> = new Set([
  4,
  5,
  6,
  12,
]);

// isClosedRequestStatus reports whether a request status id is terminal.
export function isClosedRequestStatus(statusId: number | null): boolean {
  return statusId !== null && CLOSED_REQUEST_STATUSES.has(statusId);
}

// StatusEvent is one corrective signal: its earliest date drives
// status_since and its source composes the barrier comments.
export interface StatusEvent {
  date: string | null;
  source: string;
}

// mergeEvent keeps the earliest date and the first non-empty source; an
// event without a date is still kept (status derives to open, status_since
// then falls back to today).
export function mergeEvent(
  current: StatusEvent | null,
  incoming: StatusEvent,
): StatusEvent {
  if (!current) return { ...incoming };
  return {
    date: current.date ?? incoming.date,
    source: current.source ? current.source : incoming.source,
  };
}

// isoDate takes the first 10 chars of an ISO timestamp as YYYY-MM-DD.
export function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

// earliestDate picks the older of two YYYY-MM-DD dates; null is neutral.
export function earliestDate(
  a: string | null,
  b: string | null,
): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

// AvailabilitySignals is every input the 4-state derivation reads. The live
// path feeds the asset flag; the import feeds work events (it passes the
// asset flag as available so a blessed import stays byte-identical until
// dump semantics for that flag are verified in Phase 1).
export interface AvailabilitySignals {
  urgent: StatusEvent | null;
  planned: StatusEvent | null;
  stopAssets: boolean;
  outOfServiceDate: string | null;
  assetAvailable: boolean | null;
}

// AvailabilityOut is the derived status triple written to the barrier row.
export interface AvailabilityOut {
  availabilityId: number;
  statusSince: string;
  note: string;
}

// resolveAvailability derives status by precedence (docs/FRACTTAL-DATA.md
// section 4): open emergency corrective -> Indisponivel (5); open planned
// corrective -> Degradada (4); stopped asset or out-of-service date -> Fora
// de Operacao (1); asset flagged unavailable -> Indisponivel (5, the
// documented P3 draft for the bare flag); otherwise Disponivel (0).
export function resolveAvailability(
  signals: AvailabilitySignals,
  today: string,
): AvailabilityOut {
  if (signals.urgent) {
    return {
      availabilityId: AVAILABILITY_UNAVAILABLE,
      statusSince: signals.urgent.date ?? today,
      note: signals.urgent.source,
    };
  }
  if (signals.planned) {
    return {
      availabilityId: AVAILABILITY_DEGRADED,
      statusSince: signals.planned.date ?? today,
      note: signals.planned.source,
    };
  }
  if (signals.stopAssets || signals.outOfServiceDate) {
    return {
      availabilityId: AVAILABILITY_OUT_OF_SERVICE,
      statusSince: signals.outOfServiceDate ?? today,
      note: signals.outOfServiceDate ? "Equipamento fora de operação" : "",
    };
  }
  if (signals.assetAvailable === false) {
    return {
      availabilityId: AVAILABILITY_UNAVAILABLE,
      statusSince: today,
      note: "",
    };
  }
  return {
    availabilityId: AVAILABILITY_AVAILABLE,
    statusSince: today,
    note: "",
  };
}

// EXCLUDED_EXTERNAL_CODES lists source rows that match the keyword scope but
// are known non-barriers. Entries are skipped with a report count, never
// silently: the reason documents the evidence for each exclusion.
export const EXCLUDED_EXTERNAL_CODES: Readonly<Record<string, string>> = {
  "1013971":
    "pressure transmitter PIT-3612-1210-027 mislabeled as 'Valvula' in groups_description",
};

// exclusionReason returns the documented reason when a code is excluded.
export function exclusionReason(code: string): string | null {
  return EXCLUDED_EXTERNAL_CODES[code] ?? null;
}
