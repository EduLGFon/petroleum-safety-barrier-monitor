// Export rows - Barrier to 30-column string row mapping.
// This is why it exists: spreadsheet and CSV share the exact same row
// mapping so both formats always agree cell for cell.
import { daysSince, fmtDate, humanDuration } from "../utils.ts";
import type { Barrier } from "../types.ts";

// Maps a Barrier to a 30-column export row: the 13 core columns first (order
// frozen - tests and wrapped widths depend on it), then every sheet
// inventory column admins fill in later; NC duration blank unless
// statusSince present, empty owner falls back.
// Non-Conforme means !== "Conforme" (fail-closed, same as computeKpi).
// Note: locDesc is storage-only (Fracttal carries no location text) and is
// intentionally excluded from exports so mock labels never leak into files.
export function row(b: Barrier): string[] {
  const nc = b.compliance !== "Conforme";
  const when = nc && b.statusSince
    ? `${humanDuration(daysSince(b.statusSince))} (desde ${
      fmtDate(b.statusSince)
    })`
    : "";
  return [
    String(b.id),
    b.tag,
    b.location,
    b.typology,
    b.category,
    b.grouping,
    b.criticality,
    b.owner || "Não informado",
    b.availability,
    when,
    b.compliance,
    b.comments || "",
    b.actionPlan || "",
    // Sheet inventory columns (GERAL) in sheet order.
    b.origin || "",
    b.externalCode || "",
    b.locationName || "",
    b.installLocal || "",
    b.equipTypology || "",
    b.fieldInstalled || "",
    b.fieldOperational || "",
    b.opStatus || "",
    b.hasMaintPlan || "",
    b.planFollowed || "",
    b.failureFree || "",
    b.maintStatus || "",
    b.hasContingency || "",
    b.contingencyDesc || "",
    b.evidenceCode || "",
    b.degradationDesc || "",
    b.extraComments || "",
  ];
}
