// CSV export - ;-separated, quote-escaped, BOM for pt-BR Excel.
// This is why it exists: the lightweight plain-text fallback when styled
// spreadsheet or print output is overkill. Headers and pt-BR formatting only.
import { assertBrowser, download } from "./html.ts";
import { row } from "./rows.ts";
import type { Barrier } from "../types.ts";

// ;-quote-escapes one CSV cell (double quotes double); shared by export so tests
// can cover the escaping that otherwise only runs inside a browser download.
export function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

// Builds ;-separated, quote-escaped CSV with BOM for pt-BR Excel; reuses row(); browser-only.
export function exportToCSV(
  barriers: Barrier[],
  filename = "barreiras",
): void {
  assertBrowser();
  const hdrs = [
    "ID",
    "TAG",
    "Instalação",
    "Tipologia",
    "Localização",
    "Categoria",
    "Agrupamento",
    "Criticidade",
    "Dono",
    "Disponibilidade",
    "Sem Cont. há",
    "Conformidade",
    "Comentários",
    "Plano de Ação",
  ];
  const csv = [
    hdrs.map(csvCell).join(";"),
    ...barriers.map((b) => row(b).map(csvCell).join(";")),
  ].join("\r\n");
  download(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    `${filename}.csv`,
  );
}
