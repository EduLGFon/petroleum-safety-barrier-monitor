// CSV export - ;-separated, quote-escaped, BOM for pt-BR Excel.
// This is why it exists: the lightweight plain-text fallback when styled
// spreadsheet or print output is overkill. Headers and pt-BR formatting only.
import { assertBrowser, download } from "./html.ts";
import { row } from "./rows.ts";
import type { Barrier } from "../types.ts";

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
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    hdrs.map(esc).join(";"),
    ...barriers.map((b) => row(b).map(esc).join(";")),
  ].join("\r\n");
  download(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    `${filename}.csv`,
  );
}
