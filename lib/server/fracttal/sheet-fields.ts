// Sheet inventory field derivation - Fracttal source for every GERAL column.
// This is why it exists: the dialog's inventory block used to render null
// forever because the import wrote empty strings for columns nobody filled.
// Every value now has a documented upstream source (asset fields, maintenance
// plan, notes, open work) plus a deterministic fallback where the upstream
// contract has no exact column. Both the dump import and the live sync call
// this module so a rebuild and a poller agree cell by cell.
import { foldText, type StatusEvent } from "./barrier-rules.ts";

// Generic program reference used when an asset note carries no HAZOP/APR
// document. It is the manual's own origin column default and the procedure
// that governs the barrier program, never a guessed plant document.
export const ORIGIN_PROGRAM_REFERENCE =
  "Gerenciamento das Barreiras de Segurança Operacional: SGSO-PG-0016";

// Owner ids mirror db/seed_lookups.sql (0 Operação, 1 SMS, 2 Manutenção).
export const OWNER_OPERATION = 0;
export const OWNER_SMS = 1;
export const OWNER_MAINTENANCE = 2;

// Grouping ids mirror db/seed_lookups.sql (0..7).
export const GROUPING_RELIEF = 0;
export const GROUPING_EVACUATION = 1;
export const GROUPING_INTERLOCK = 2;
export const GROUPING_BRIGADE = 3;
export const GROUPING_OPERATION_RESPONSE = 4;
export const GROUPING_POST_RELEASE = 5;
export const GROUPING_IGNITION = 6;
export const GROUPING_ALARMS = 7;

// SheetAsset is the slice of a Fracttal asset the sheet columns need. The
// dump import's equipment row and the live FracttalAsset both satisfy it, so
// the derivation stays one implementation.
export interface SheetAsset {
  description?: string | null;
  parent_description?: string | null;
  location_code?: string | null;
  groups_description?: string | null;
  groups_1_description?: string | null;
  groups_2_description?: string | null;
  field_1?: string | null;
  field_2?: string | null;
  field_3?: string | null;
  field_4?: string | null;
  field_5?: string | null;
  field_6?: string | null;
  notes?: string | null;
  id_group_task?: number | null;
  groups_tasks_description?: string | null;
  active?: boolean | null;
  available?: boolean | null;
}

// SheetWork carries the open-work signals that explain failures, plans and
// actions. The import and the live work pass build the same shape.
export interface SheetWork {
  urgent?: StatusEvent | null;
  planned?: StatusEvent | null;
  preventive?: StatusEvent | null;
  hasContingency?: boolean;
  contingencySource?: string;
}

// SheetFields maps one-to-one to barriers' 15 free-text sheet columns plus
// actionPlan (the open corrective action note the dialog shows separately).
export interface SheetFields {
  origin: string;
  installLocal: string;
  equipTypology: string;
  fieldInstalled: string;
  fieldOperational: string;
  opStatus: string;
  hasMaintPlan: string;
  planFollowed: string;
  failureFree: string;
  maintStatus: string;
  hasContingency: string;
  contingencyDesc: string;
  evidenceCode: string;
  degradationDesc: string;
  extraComments: string;
  actionPlan: string;
}

export interface SheetContext {
  availabilityId: number;
  today: string;
}

const OPERATIONAL_IDS = new Set([0, 3, 4]);
const PLAN_NOT_APPLICABLE = /n\/a\s*plano|plano\s+tcom/i;

// fieldValue trims one upstream string, returning "" for null/non-string.
function fieldValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// sheetText folds every human-readable asset column into one haystack for
// the heuristic owner/grouping classifiers. category/description dominate,
// but notes and the model columns help disambiguate valves and instruments.
function sheetText(asset: SheetAsset): string {
  return foldText(
    [
      asset.groups_description,
      asset.field_1,
      asset.description,
      asset.groups_2_description,
      asset.notes,
    ].map(fieldValue).filter(Boolean).join(" "),
  );
}

// parentSegments splits the Fracttal parent chain ("// Polo/ Área/ ...") and
// drops the empty leading segment produced by the leading slashes.
function parentSegments(
  parentDescription: string | null | undefined,
): string[] {
  return (parentDescription ?? "").split("/").map((s) => s.trim()).filter(
    Boolean,
  );
}

// installLocalOf uses the immediate parent (the system/conjunto that owns
// the asset) as the installation location; older rows without a chain fall
// back to the station code so the field is never empty.
export function installLocalOf(asset: SheetAsset): string {
  const segments = parentSegments(asset.parent_description);
  const parent = segments.length > 0 ? segments[segments.length - 1]! : "";
  return parent || fieldValue(asset.location_code) || "Não informado";
}

// equipTypologyOf prefers the model/type column (field_1, populated on every
// dump row) and falls back to the asset taxonomy and description.
export function equipTypologyOf(asset: SheetAsset): string {
  return fieldValue(asset.field_1) || fieldValue(asset.groups_description) ||
    fieldValue(asset.description) || "Não informado";
}

// originOf extracts a HAZOP/APR or SGSO procedure reference from the free-text
// notes. The dump notes carry one document reference per barrier; rows without
// one use the program reference that governs this barrier catalog.
export function originOf(asset: SheetAsset): string {
  const notes = fieldValue(asset.notes);
  const document = notes.match(
    /\b(?:HAZOP|APR)\s*[-:=]?\s*[A-Z0-9][A-Z0-9._/-]*\d[A-Z0-9._/-]*/i,
  )?.[0] ?? notes.match(/\bSGSO-PG-\d{2,4}\b/i)?.[0];
  return (document ?? "").replace(/\s+/g, " ").trim().slice(0, 160) ||
    ORIGIN_PROGRAM_REFERENCE;
}

// fieldInstalledOf reports whether the physical element is in the field.
// `active: false` is the strongest upstream signal (disabled asset, usually
// moved to maintenance/reserve); a parent chain that names a reserve, stock or
// scrapped location is the second. Notes are deliberately not scanned: they
// carry movement history, so an old "sent to reserve" line would otherwise
// mark a returned asset as missing forever.
export function fieldInstalledOf(asset: SheetAsset): string {
  const parent = foldText(asset.parent_description);
  const detached =
    /\b(reserva|reservas|estoque|almoxarifado|sucata|desmontad|removid)/.test(
      parent,
    );
  return asset.active === false || detached ? "Não" : "Sim";
}

// fieldOperationalOf follows the derived availability: degraded states still
// operate, while out-of-service and unavailable ones do not.
export function fieldOperationalOf(availabilityId: number): string {
  return OPERATIONAL_IDS.has(availabilityId) ? "Sim" : "Não";
}

// opStatusOf is the operational availability column. The sheet vocabulary is
// Disponível/Indisponível plus a Degradada and Fora de Operação refinement
// already used by the maintenance column.
export function opStatusOf(availabilityId: number): string {
  if (availabilityId === 0) return "Disponível";
  if (availabilityId === 3 || availabilityId === 4) return "Degradada";
  if (availabilityId === 1) return "Fora de Operação";
  if (availabilityId === 2 || availabilityId === 5) return "Indisponível";
  return "Sem Classificação";
}

// maintStatusOf mirrors the maintenance view: planned/emergency corrective
// work makes the asset Degradada or Indisponível; clean assets stay
// Disponível.
export function maintStatusOf(availabilityId: number): string {
  if (availabilityId === 0) return "Disponível";
  if (availabilityId === 3 || availabilityId === 4) return "Degradada";
  return "Indisponível";
}

// hasMaintPlanOf reads the attached task group (Fracttal maintenance plan).
// An explicit "N/A PLANO" in field_6 wins over a stale plan id.
export function hasMaintPlanOf(asset: SheetAsset): string {
  if (PLAN_NOT_APPLICABLE.test(fieldValue(asset.field_6))) return "Não";
  const planId = asset.id_group_task;
  const planLabel = fieldValue(asset.groups_tasks_description);
  return planLabel !== "" || (typeof planId === "number" && planId > 0)
    ? "Sim"
    : "Não";
}

// planFollowedOf treats an overdue open preventive task as a missed plan.
// With a plan and no overdue preventive signal the plan is being followed;
// without a plan the column is Não, matching the sheet's own semantics.
export function planFollowedOf(
  asset: SheetAsset,
  work: SheetWork,
  today: string,
): string {
  if (hasMaintPlanOf(asset) === "Não") return "Não";
  const openDate = work.preventive?.date ?? "";
  if (openDate !== "" && openDate < today) return "Não";
  return "Sim";
}

// failureFreeOf is the inverse of an open corrective signal: any planned or
// emergency work order means the barrier has a failure/defect.
export function failureFreeOf(work: SheetWork): string {
  return work.urgent || work.planned ? "Não" : "Sim";
}

// evidenceCodeFromText extracts the GM/CEC evidence code used by the
// contingency procedure. It never invents a code: no token means "".
export function evidenceCodeFromText(
  ...texts: Array<string | null | undefined>
): string {
  for (const raw of texts) {
    const text = fieldValue(raw);
    if (text === "") continue;
    const code = text.match(/\bGM[-_ ]?\d[\w./-]*/i)?.[0] ??
      text.match(/\bCEC[-_ ]?[\w./-]*/i)?.[0];
    if (code) return code.replace(/\s+/g, "-").toUpperCase().slice(0, 80);
  }
  return "";
}

// openEvent picks the winning open corrective event (urgent first, matching
// the availability precedence). Only corrective work describes a degradation
// or an action; preventive work never does.
function openEvent(work: SheetWork): StatusEvent | null {
  return work.urgent ?? work.planned ?? null;
}

// degradationText describes what is wrong: the folio+description source
// when available, otherwise the operator detail.
function degradationText(work: SheetWork): string {
  const event = openEvent(work);
  return (event?.source || event?.detail || "").trim();
}

// actionText is the instruction attached to the open work (task_note /
// observation), falling back to the source when no separate note exists.
function actionText(work: SheetWork): string {
  const event = openEvent(work);
  return (event?.detail || event?.source || "").trim();
}

// technicalSummary renders the model columns that have no dedicated sheet
// field (manufacturer, model/spec, serial). It is used when notes and field_6
// are empty so Comentários 2 is never a permanent blank.
function technicalSummary(asset: SheetAsset): string {
  const parts: string[] = [];
  const manufacturer = fieldValue(asset.field_2);
  const model = fieldValue(asset.field_3);
  const serial = fieldValue(asset.field_4);
  if (manufacturer !== "") parts.push(`Fabricante: ${manufacturer}`);
  if (model !== "") parts.push(`Modelo/Especificação: ${model}`);
  if (serial !== "") parts.push(`Nº de série: ${serial}`);
  return parts.join("; ");
}

// identificationSummary is the last-resort Comentários 2 text. Every asset
// carries field_1 (or at least a description), so the fallback is never empty.
function identificationSummary(asset: SheetAsset): string {
  const type = fieldValue(asset.field_1) ||
    fieldValue(asset.groups_description) ||
    fieldValue(asset.description) || "Não informado";
  const local = installLocalOf(asset);
  return `Tipo: ${type}; Local de instalação: ${local}`;
}

// extraCommentsOf combines the asset notes with non-plan field_6 content
// (dimensions, INMETRO seals, attached-document flags) and the technical
// columns. "N/A PLANO" and "PLANO TCOM" stay out because they say nothing
// about the asset itself.
export function extraCommentsOf(asset: SheetAsset): string {
  const notes = fieldValue(asset.notes);
  const extra = fieldValue(asset.field_6);
  const includeExtra = extra !== "" && !PLAN_NOT_APPLICABLE.test(extra);
  const tech = technicalSummary(asset);
  const sections = [notes, includeExtra ? extra : "", tech].filter(Boolean);
  if (sections.length === 0) sections.push(identificationSummary(asset));
  return sections.join("\n").slice(0, 4000);
}

// deriveSheetFields fills all 15 inventory columns from Fracttal data.
export function deriveSheetFields(
  asset: SheetAsset,
  work: SheetWork,
  ctx: SheetContext,
): SheetFields {
  const contingency = work.hasContingency === true;
  const source = fieldValue(work.contingencySource);
  const hasCorrective = (work.urgent ?? work.planned) != null;
  return {
    origin: originOf(asset),
    installLocal: installLocalOf(asset),
    equipTypology: equipTypologyOf(asset),
    fieldInstalled: fieldInstalledOf(asset),
    fieldOperational: fieldOperationalOf(ctx.availabilityId),
    opStatus: opStatusOf(ctx.availabilityId),
    hasMaintPlan: hasMaintPlanOf(asset),
    planFollowed: planFollowedOf(asset, work, ctx.today),
    failureFree: failureFreeOf(work),
    maintStatus: maintStatusOf(ctx.availabilityId),
    hasContingency: contingency ? "Sim" : "Não",
    contingencyDesc: contingency ? source.slice(0, 800) : "",
    evidenceCode: contingency
      ? evidenceCodeFromText(source, asset.notes)
      : evidenceCodeFromText(asset.notes),
    degradationDesc: hasCorrective ? degradationText(work).slice(0, 800) : "",
    extraComments: extraCommentsOf(asset),
    actionPlan: hasCorrective ? actionText(work).slice(0, 800) : "",
  };
}

// ownerIdOf assigns the barrier owner team from the asset family and, when
// present, the open work trade. Safety devices go to SMS, process equipment
// to Operação, and the remaining maintenance families to Manutenção.
export function ownerIdOf(asset: SheetAsset, work?: SheetWork): number {
  const text = sheetText(asset);
  const open = work?.urgent ?? work?.planned ?? null;
  const trade = foldText(
    [
      open?.trade,
      open?.detail,
      open?.source,
      work?.preventive?.trade,
      work?.preventive?.detail,
    ].filter(Boolean).join(" "),
  );
  if (
    /manutencao|eletric|mecanic|instrument|caldeiraria|automacao/.test(trade)
  ) {
    return OWNER_MAINTENANCE;
  }
  if (/operacao|medicao|integridade|sonda/.test(trade)) return OWNER_OPERATION;
  if (
    /extintor|hidrante|incend|detec|alarme|sirene|emerg|spda|aterr|para.?raio|chuveiro|lava.?olho|bastao|corta.?chamas/
      .test(
        text,
      )
  ) return OWNER_SMS;
  if (
    /poco|bomba|compressor|tanque|vaso|permutador|filtro|tubul|manifold|valvula|linha|producao|injecao|tratamento|separador|tocha|flare|medicao|transmissor|indicador|sensor|controlador/
      .test(
        text,
      )
  ) return OWNER_OPERATION;
  return OWNER_MAINTENANCE;
}

// groupingIdOf maps the asset family to the barrier-grouping taxonomy. The
// specific emergency families come before the generic process fallback so a
// fire pump does not land under "Sistemas de Alívio".
export function groupingIdOf(asset: SheetAsset): number {
  const text = sheetText(asset);
  if (
    /evacua|abandon|resgate|saida de emergencia|rota de fuga|tampa/.test(text)
  ) {
    return GROUPING_EVACUATION;
  }
  if (
    /brigada|combate a incendio|hidrante|extintor|sprinkler|mangueira|lava.?olho|chuveiro/
      .test(text)
  ) {
    return GROUPING_BRIGADE;
  }
  if (/alarme|sirene|detec|anunciador|fumaca|h2s|botoeira/.test(text)) {
    return GROUPING_ALARMS;
  }
  if (
    /intertrav|bloqueio|shutdown|esd|corta.?chamas|valvula de emergencia/.test(
      text,
    )
  ) {
    return GROUPING_INTERLOCK;
  }
  if (/pos liberacao|tocha|flare|descarga/.test(text)) {
    return GROUPING_POST_RELEASE;
  }
  if (/ignicao|aterr|spda|para.?raio|malha|eletric|explos|inmetro/.test(text)) {
    return GROUPING_IGNITION;
  }
  if (/alivio|psv|disco de ruptura|pressao/.test(text)) return GROUPING_RELIEF;
  return GROUPING_OPERATION_RESPONSE;
}
