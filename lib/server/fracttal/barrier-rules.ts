// Shared Fracttal barrier mapping rules (Phase 0 convergence).
// This is why it exists: the dump import script and the live sync mapper
// derived availability, station, typology, and tags independently and
// diverged (first live sync would have decayed Degradado rows and churned
// tags/typology). Both paths now call these pure rules; the import keeps
// file streaming + SQL, the sync keeps upsert + soft-delete plus missing
// catalog creation. Precedence: the import owns full catalog rebuilds
// (deterministic ids); the sync creates missing locations/categories
// between rebuilds (unknown labels converge, never guessed).
export const AVAILABILITY_AVAILABLE = 0;
export const AVAILABILITY_OUT_OF_SERVICE = 1;
export const AVAILABILITY_CONTINGENCY_OUTAGE = 2;
export const AVAILABILITY_DEGRADED_CONTINGENCY = 3;
export const AVAILABILITY_DEGRADED = 4;
export const AVAILABILITY_UNAVAILABLE = 5;

// Typology ids (db/seed_lookups.sql) mirror the sheet-real installation
// types (GERAL Tipologia da Instalação); Duto de Transferência is kept for
// duto parents (real infra in the full asset base, outside the sheet scope).
// The derived value wins whenever a parent chain is present, IMPORT_DEFAULTS
// covers rows without one.
export const TYPOLOGY_STATION = 0;
export const TYPOLOGY_FIELD = 1;
export const TYPOLOGY_PIPELINE = 2;
export const TYPOLOGY_WELL = 3;
export const TYPOLOGY_STEAM = 4;
export const TYPOLOGY_SUBSTATION = 5;

// Author row + history note stamped on freshly imported barriers.
export const AUTHOR_IMPORT = 10;
export const IMPORT_NOTE = "Importado do Fracttal";

// Category fallback for empty taxonomy labels; criticality rank derives
// from the TAG suffix letter plus the ESO flag (verified 2026-09-27: every
// dump description matches `{code} [letter]`, letter in A/B/C/D, and ESO
// rows carry suffix A). Unparseable ranks fall back to D with a warning
// (listed, not silent). Rank ids are a hard contract with
// db/seed_lookups.sql and lib/enums/codes.ts CRITICALITY_CODES.
export const CATEGORY_FALLBACK = "(sem categoria)";
export const CRITICALITY_ESO = 0;
export const CRITICALITY_A = 1;
export const CRITICALITY_B = 2;
export const CRITICALITY_C = 3;
export const CRITICALITY_D = 4;
export const CRITICALITY_RANK_LABELS: readonly string[] = [
  "ESO",
  "A",
  "B",
  "C",
  "D",
];

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

// ScopeSource names which scope gate admitted a row: the taxonomy keyword,
// the upstream ESO flag, or both. Stored per barrier (scope_source) so scope
// changes stay reversible and auditable - narrowing the scope later
// soft-deletes rows admitted only by the removed gate instead of dropping
// them silently.
export type ScopeSource = "keyword" | "eso";

// scopeSources lists every gate admitting one upstream row. Empty means the
// row is outside every scope (the sync skips it with the reason, the import
// drops it from the catalog).
export function scopeSources(
  groupsDescription: string | null | undefined,
  groups2Description: string | null | undefined,
): ScopeSource[] {
  const sources: ScopeSource[] = [];
  if (isBarrierCandidate(groupsDescription)) sources.push("keyword");
  if (foldText(groups2Description) === "eso") sources.push("eso");
  return sources;
}

// STATION_OVERRIDES corrects L2 segments whose trailing " - CODE" token is
// not a station (documented, evidence-backed, never guessed). Verified live 2026-09-20: "Base Seacrest
// - São Mateus-ES" is the company base in the city of São Mateus (state of
// Espírito Santo), so it maps to SM - the "-ES" is the state suffix, not a
// station code. Keys are folded (case/accent-insensitive) full L2 segments;
// values are catalog station codes.
export const STATION_OVERRIDES: Readonly<Record<string, string>> = {
  "base seacrest - sao mateus-es": "SM",
};

// STATION_ALIASES promotes station-like segments that sit below L3 to their
// own operator stations (live evidence 2026-11-06, see DECISIONS.md#D27).
// SM8 is the "ESTAÇÃO COLETORA SÃO MATEUS - SM-8" facility under SÃO MATEUS
// - SM; CO is the 3-CO-N-ES well cluster under JACUTINGA - JCT. The
// transformer segment "CO-03" under 7-JCT-5-ES must not match the CO pattern
// and stays under JCT. segment holds a folded exact string or an anchored
// folded regex; a null name means the UI falls back to the code.
export interface StationAlias {
  segment: string | RegExp;
  code: string;
  name: string | null;
  type: string;
}

export const STATION_ALIASES: readonly StationAlias[] = [
  {
    segment: "estacao coletora sao mateus - sm-8",
    code: "SM8",
    name: "São Mateus 8",
    type: "Estação Coletora",
  },
  {
    segment: /^3-co-[0-9]+-es$/,
    code: "CO",
    name: null,
    type: "Campo",
  },
];

// stationAliasFor scans the parent chain from the L3 segment onward: SM8
// sits below L3 and the CO wells sit under JACUTINGA - JCT; scanning every
// segment from the station segment onward lets an alias win at any depth
// without changing normal L3 results.
function stationAliasFor(
  parentDescription: string | null | undefined,
): StationAlias | null {
  for (const segment of parentSegments(parentDescription).slice(2)) {
    const folded = foldText(segment);
    const alias = STATION_ALIASES.find((candidate) =>
      typeof candidate.segment === "string"
        ? folded === candidate.segment
        : candidate.segment.test(folded)
    );
    if (alias !== undefined) return alias;
  }
  return null;
}

// stationCodeOf extracts the station code from an equipment parent chain
// ("// Seacrest Petroleo/ Area Norte/ SAO MATEUS - SM/ ..."). Alias segments
// below L3 win first (SM8, CO); the shared L3 mobile-test-unit segment
// splits by L2 area (CJ-UTM-N/CJ-UTM-C, see DECISIONS.md#D28); otherwise
// the L3 trailing " - CODE" token is used, with STATION_OVERRIDES applied.
// Validated against the live catalog.
export function stationCodeOf(
  parentDescription: string | null | undefined,
): string {
  const alias = stationAliasFor(parentDescription);
  if (alias !== null) return alias.code;
  const mobile = mobileTestUnitOf(parentDescription);
  if (mobile !== null) return mobile.code;
  const seg = l2Segment(parentDescription);
  const override = STATION_OVERRIDES[foldText(seg)];
  if (override !== undefined) return override;
  const match = seg.match(/\s*-\s*([A-Z0-9][A-Z0-9-]*)\s*$/);
  return (match ? match[1] : seg).toUpperCase();
}

// MOBILE_TEST_UNITS: the two upstream facilities sharing the folded L3
// segment "cj unidade de teste movel" are distinct operator stations,
// separated only by the L2 area segment (upstream facility codes
// CJ-UND-TST-MOV-CENTRO and CJ-UND-TST-MOV-NORTE; live sweep 2026-11-06,
// see DECISIONS.md#D28). The rule is a pure table so stationCodeOf,
// stationNameOf and locationTypeOf can never disagree.
interface MobileTestUnitStation {
  code: string;
  name: string;
  type: string;
}

const MOBILE_TEST_UNITS: Readonly<
  Record<"area centro" | "area norte", MobileTestUnitStation>
> = {
  "area centro": { code: "CJ-UTM-C", name: "CJ-UTM-C", type: "Unidade Móvel" },
  "area norte": { code: "CJ-UTM-N", name: "CJ-UTM-N", type: "Unidade Móvel" },
};

// mobileTestUnitOf resolves the shared "Cj Unidade de Teste Móvel" L3
// segment by the L2 area: "Area Centro" -> CJ-UTM-C, "Area Norte" ->
// CJ-UTM-N. Any other area (or a chain too short to carry both segments)
// returns null and the ordinary L3 parse applies unchanged.
function mobileTestUnitOf(
  parentDescription: string | null | undefined,
): MobileTestUnitStation | null {
  const parts = parentSegments(parentDescription);
  if (parts.length < 3) return null;
  if (foldText(parts[2]!) !== "cj unidade de teste movel") return null;
  const area = foldText(parts[1]!);
  if (area === "area centro") return MOBILE_TEST_UNITS["area centro"];
  if (area === "area norte") return MOBILE_TEST_UNITS["area norte"];
  return null;
}

// parentSegments splits the slash-separated parent chain, trimming and
// dropping empty segments (leading "//" produces none). Shared so the alias
// scan and the L3 parse read the same segments.
function parentSegments(
  parentDescription: string | null | undefined,
): string[] {
  return (parentDescription ?? "").split("/").map((p) => p.trim()).filter(
    (p) => p !== "",
  );
}

// l2Segment pulls the field-level (third) segment out of an equipment
// parent chain; shared by the code and name derivations so they can never
// disagree on which segment they read.
function l2Segment(parentDescription: string | null | undefined): string {
  const parts = parentSegments(parentDescription);
  return parts.length > 2 ? parts[2]! : (parts[parts.length - 1] ?? "");
}

// NAME_PARTICLES stays lowercase in display names (pt-BR convention).
const NAME_PARTICLES: ReadonlySet<string> = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
]);

// toDisplayName title-cases a raw taxonomy segment ("SÃO MATEUS" becomes
// "São Mateus"). Deterministic fallback naming only: the operator's official
// list supersedes it wherever provided.
export function toDisplayName(raw: string): string {
  return raw.toLowerCase().split(/\s+/).map((word, i) =>
    i > 0 && NAME_PARTICLES.has(word)
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1)
  ).join(" ");
}

// stationNameOf derives the display name from the L2 segment: the text
// before " - CODE", title-cased ("FAZENDA ALEGRE - FAL" gives
// "Fazenda Alegre"). Alias segments return their explicit name first; CO
// returns null so the UI falls back to the code, and the mobile test units
// return their fixed names so parser and catalog agree (D28). Null also
// covers segments without a dash-code tail (the code is already the display
// text) and override segments (they borrow their station's canonical name).
export function stationNameOf(
  parentDescription: string | null | undefined,
): string | null {
  const alias = stationAliasFor(parentDescription);
  if (alias !== null) return alias.name;
  const mobile = mobileTestUnitOf(parentDescription);
  if (mobile !== null) return mobile.name;
  const seg = l2Segment(parentDescription);
  if (seg === "" || STATION_OVERRIDES[foldText(seg)] !== undefined) {
    return null;
  }
  const prefix = (seg.match(/^(.*?)\s*-\s*[A-Z0-9][A-Z0-9-]*\s*$/)?.[1] ?? "")
    .trim();
  if (prefix === "") return null;
  return toDisplayName(prefix);
}

// typologyIdOf derives typology from the parent chain by keyword precedence.
// Substation and steam come first: 'subestação' and 'estação de vapor' both
// contain the 'estac' stem, so the generic station check must not win over
// them. Compressor/metering/plant parents are station facilities and map to
// the station type; anything unrecognized defaults to the field.
export function typologyIdOf(
  parentDescription: string | null | undefined,
): number {
  const text = foldText(parentDescription);
  if (/subest|se-[0-9]|69\s?kv/.test(text)) return TYPOLOGY_SUBSTATION;
  if (/vapor|ugv|caldeira/.test(text)) return TYPOLOGY_STEAM;
  if (/estac|coletor/.test(text)) return TYPOLOGY_STATION;
  if (/poco|pocos|rtsgi/.test(text)) return TYPOLOGY_WELL;
  if (/duto|transfer/.test(text)) return TYPOLOGY_PIPELINE;
  if (/compres|medic|medid|plant|process/.test(text)) return TYPOLOGY_STATION;
  return TYPOLOGY_FIELD;
}

// locationTypeOf classifies a station code for the locations table. Labels
// are PT display values matching the existing lookup rows; alias codes carry
// their type in STATION_ALIASES (SM8 is a collector station, CO a field)
// and the mobile test unit codes in MOBILE_TEST_UNITS (both share
// "Unidade Móvel", see DECISIONS.md#D28).
export function locationTypeOf(stationCode: string): string {
  const alias = STATION_ALIASES.find((candidate) =>
    candidate.code === stationCode
  );
  if (alias !== undefined) return alias.type;
  const mobile = Object.values(MOBILE_TEST_UNITS).find((u) =>
    u.code === stationCode
  );
  if (mobile !== undefined) return mobile.type;
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

// criticalityLabelFor derives the rank label from the TAG suffix letter
// ("... { 1014224 } A" gives "A") with the ESO flag winning: ESO rows are A
// tier and rank above plain A. priorities_description is almost always null
// upstream, so it only serves as a last resort before the D fallback. The
// guessed flag tells callers to list a warning instead of staying silent.
export function criticalityLabelFor(
  description: string | null | undefined,
  groups2Description: string | null | undefined,
  prioritiesDescription: string | null | undefined,
): { label: string; guessed: boolean } {
  if (foldText(groups2Description) === "eso") {
    return { label: "ESO", guessed: false };
  }
  const text = (description ?? "").trim();
  const suffix = text.match(/\}\s*([A-Za-z]+)?\s*$/)?.[1]?.toUpperCase() ??
    "";
  if (suffix === "ESO") return { label: "ESO", guessed: false };
  if (
    suffix === "A" || suffix === "B" || suffix === "C" || suffix === "D"
  ) return { label: suffix, guessed: false };
  const priority = (prioritiesDescription ?? "").trim().toUpperCase();
  if (CRITICALITY_RANK_LABELS.includes(priority)) {
    return { label: priority, guessed: false };
  }
  return { label: "D", guessed: true };
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

// isPreventiveWork reports whether an open work row belongs to a preventive
// maintenance plan (Fracttal labels: "PREV - Sistemática", "PREV -
// Calibração"). It only feeds the plan-followed column; preventive work never
// changes availability.
export function isPreventiveWork(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some((text) => {
    const folded = foldText(text);
    return /\bprev\b/.test(folded) || folded.includes("preventiv");
  });
}

// Work-order open statuses (reference: Query tasks in WOs, ot_status as
// text: 1 in process, 2 review). 3 completed and 4 cancelled carry no
// signal (the same closed gate as done !== false). Used for the open-only
// status pass (FRACTTAL_WORK_OPEN_ONLY); the default windowed pass ignores
// this set.
export const OPEN_WORK_ORDER_STATUSES: readonly string[] = ["1", "2"];

// Request statuses that count as closed: solved (4), cancelled (5), solved
// via work order (6), rejected (12) - all observed in the dump - plus 11
// removed from pending tasks (reference: Query status changes from
// requests; terminal by label). Everything else is an open request; status
// 9 (WO cancelled) deliberately stays open: the underlying need may persist,
// and for safety barriers a sticky signal beats a silent decay.
export const CLOSED_REQUEST_STATUSES: ReadonlySet<number> = new Set([
  4,
  5,
  6,
  11,
  12,
]);

// isClosedRequestStatus reports whether a request status id is terminal.
export function isClosedRequestStatus(statusId: number | null): boolean {
  return statusId !== null && CLOSED_REQUEST_STATUSES.has(statusId);
}

// StatusEvent is one work signal: its earliest date drives status_since and
// its source composes the barrier comments. detail is the operator's action
// note (task_note/observation); trade is the maintenance discipline label
// used only for owner heuristics. Both stay optional so old fixtures and
// callers that only need date/source keep compiling.
export interface StatusEvent {
  date: string | null;
  source: string;
  detail?: string;
  trade?: string;
  sourceType?: "Ordem de serviço" | "Solicitação de serviço";
  classification?: string;
  operationState?: string;
  sourceAuthor?: string | null;
  participants?: Array<{ name: string; role: string }>;
  // Additional context surfaced from the richer WO/WR rows.
  priority?: string | null;
  isUrgent?: boolean;
  failureContext?: string;
}

// mergeEvent keeps the earliest date and the first non-empty source, detail
// and trade; an event without a date is still kept (status derives to open,
// status_since then falls back to today).
export function mergeEvent(
  current: StatusEvent | null,
  incoming: StatusEvent,
): StatusEvent {
  if (!current) return { ...incoming };
  return {
    date: current.date ?? incoming.date,
    source: current.source ? current.source : incoming.source,
    detail: current.detail || incoming.detail,
    trade: current.trade || incoming.trade,
    sourceType: current.sourceType ?? incoming.sourceType,
    classification: current.classification || incoming.classification,
    operationState: current.operationState || incoming.operationState,
    sourceAuthor: current.sourceAuthor || incoming.sourceAuthor,
    participants: mergeParticipants(
      current.participants ?? [],
      incoming.participants ?? [],
    ),
    priority: current.priority || incoming.priority,
    isUrgent: (current.isUrgent ?? false) || (incoming.isUrgent ?? false),
    failureContext: current.failureContext || incoming.failureContext,
  };
}

function mergeParticipants(
  current: Array<{ name: string; role: string }>,
  incoming: Array<{ name: string; role: string }>,
): Array<{ name: string; role: string }> {
  const merged = [...current];
  for (const person of incoming) {
    const existing = merged.find((candidate) =>
      candidate.name.toLowerCase() === person.name.toLowerCase()
    );
    if (!existing) {
      merged.push(person);
    } else if (!existing.role.split(", ").includes(person.role)) {
      existing.role = `${existing.role}, ${person.role}`;
    }
  }
  return merged;
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

// isContingencyFlag reports whether a sheet Há Contingência? value means
// "Sim" (case/accent-insensitive, trimmed). Null/empty/anything else is not
// contingency. Shared by the display overlay and the PATCH promotion so the
// two can never disagree on what counts as contingency-held.
export function isContingencyFlag(
  value: string | null | undefined,
): boolean {
  return foldText(value).trim() === "sim";
}

// isContingencyText reports whether free text carries a contingency signal:
// `contingenc` (contingência/contingenciamento/contingenciado), a GM evidence
// code (`GM-...`, `GM ...`), or a bare CEC token. Folded first so accents and
// case never hide a hit; GM requires a code tail or word boundary so words
// containing "gm" never match.
export function isContingencyText(
  value: string | null | undefined,
): boolean {
  const text = foldText(value);
  if (text === "") return false;
  if (text.includes("contingenc")) return true;
  if (/\bgm[-_ ]?\d/.test(text)) return true;
  if (/\bgm\b/.test(text)) return true;
  if (/\bcec\b/.test(text)) return true;
  return false;
}

// hasContingencySignal ORs a list of free-text fields into one flag: any
// hit means the work row carries contingency context (GM/CEC evidence or an
// explicit contingency note). Callers pass every text field they have;
// nulls/empties are neutral.
export function hasContingencySignal(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some((t) => isContingencyText(t));
}

// effectiveAvailabilityId overlays the manual sheet flag on a stored base:
// Degradado (4) + Sim -> Degradado Contingenciado (3), Indisponível (5) +
// Sim -> Indisponível Contingenciado (2). Every other base passes through,
// including rows already stored as 2/3. This is the display derivation
// (docs/STATUSES.md): the sync derives the four operational states, the
// sheet flag promotes the two contingency display states.
export function effectiveAvailabilityId(
  baseId: number,
  hasContingency: string | null | undefined,
): number {
  if (!isContingencyFlag(hasContingency)) return baseId;
  if (baseId === AVAILABILITY_DEGRADED) {
    return AVAILABILITY_DEGRADED_CONTINGENCY;
  }
  if (baseId === AVAILABILITY_UNAVAILABLE) {
    return AVAILABILITY_CONTINGENCY_OUTAGE;
  }
  return baseId;
}

// hasUrgentCorrective reports whether open work carries an urgent status
// signal: an emergency (urgent-slot) event, or a planned event whose
// isUrgent flag is true (WR is_urgent, WO high priority). A planned event
// without the flag carries no status signal and must not flip failure-free,
// degradation, or action text to corrective.
export function hasUrgentCorrective(work: {
  urgent?: StatusEvent | null;
  planned?: StatusEvent | null;
}): boolean {
  return work.urgent != null || work.planned?.isUrgent === true;
}

// AvailabilitySignals is every input the derivation reads. hasContingency
// is the auto-detected work-text signal (GM/CEC/contingência in the open
// corrective WO/WR); the manual sheet flag overlays later via
// effectiveAvailabilityId so both sources promote to the same 2/3 states.
// The live path feeds the asset flag; the import feeds work events (it
// passes the asset flag as available so a blessed import stays
// byte-identical until dump semantics for that flag are verified).
export interface AvailabilitySignals {
  urgent: StatusEvent | null;
  planned: StatusEvent | null;
  stopAssets: boolean;
  outOfServiceDate: string | null;
  assetAvailable: boolean | null;
  hasContingency?: boolean;
}

// AvailabilityOut is the derived status triple written to the barrier row.
export interface AvailabilityOut {
  availabilityId: number;
  statusSince: string;
  note: string;
}

// resolveAvailability derives status by precedence (docs/FRACTTAL-DATA.md
// section 4, docs/STATUSES.md for the contingency overlay): open emergency
// corrective -> Indisponivel (5, or 2 when contingency is in place); open
// planned corrective WITH urgent flag (StatusEvent.isUrgent, from WR
// is_urgent) -> Degradada (4, or 3 when contingency is in place);
// planned work without the urgent flag carries no status signal; stopped
// asset or out-of-service date -> Fora de Operacao (1); asset
// flagged unavailable -> Indisponivel (5, the documented P3 draft for the
// bare flag); otherwise Disponivel (0).
export function resolveAvailability(
  signals: AvailabilitySignals,
  today: string,
): AvailabilityOut {
  const conting = signals.hasContingency === true;
  if (signals.urgent) {
    return {
      availabilityId: conting
        ? AVAILABILITY_CONTINGENCY_OUTAGE
        : AVAILABILITY_UNAVAILABLE,
      statusSince: signals.urgent.date ?? today,
      note: signals.urgent.source,
    };
  }
  if (signals.planned && signals.planned.isUrgent === true) {
    return {
      availabilityId: conting
        ? AVAILABILITY_DEGRADED_CONTINGENCY
        : AVAILABILITY_DEGRADED,
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

// Upstream rows enter the monitor 1:1 - there is intentionally no exclusion
// list. A mislabeled row (wrong type, wrong station) shows up mislabeled
// until the operator fixes it in Fracttal; the sync then picks up the
// correction as a normal update. Curation happens at the source, never here.
