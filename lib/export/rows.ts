// Export rows - Barrier to 14-column string row mapping.
// This is why it exists: spreadsheet and CSV share the exact same row
// mapping so both formats always agree cell for cell.
import { daysSince, fmtDate, humanDuration } from "../utils.ts";
import type { Barrier } from "../types.ts";

// Maps a Barrier to a 14-column export row; NC duration blank unless statusSince present, empty dono falls back.
// Non-Conforme means !== "Conforme" (fail-closed, same as computeKpi).
export function row(b: Barrier): string[] {
  const nc = b.conformidade !== "Conforme";
  const when = nc && b.statusSince
    ? `${humanDuration(daysSince(b.statusSince))} (desde ${
      fmtDate(b.statusSince)
    })`
    : "";
  return [
    String(b.id),
    b.tag,
    b.instalacao,
    b.tipologia,
    b.locDesc,
    b.categoria,
    b.agrupamento,
    b.criticidade,
    b.dono || "Não informado",
    b.disponibilidade,
    when,
    b.conformidade,
    b.comentarios || "",
    b.planoAcao || "",
  ];
}
