// Export limits - shared DOM row refusal message for PDF/Excel.
// This is why it exists: both browser exports refuse beyond MAX_DOM_ROWS
// with the same actionable text; one builder keeps the wording identical.
import { MAX_DOM_ROWS } from "./html.ts";

import { fmt } from "../format.ts";

export { MAX_DOM_ROWS };

// refusalMessage: pt-BR error telling the user to filter down or use CSV.
export function refusalMessage(format: "PDF" | "Excel", count: number): string {
  return `${format} comporta até ${fmt(MAX_DOM_ROWS)} registros; ` +
    `filtrado tem ${fmt(count)}. Filtre mais ou exporte CSV.`;
}
