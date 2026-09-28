// PDF report columns - relative widths for the 30 export columns.
// Why it exists: A4 landscape fits ~785pt of table, so every column gets a
// fixed share of it. Keyed by header so inserting a column upstream cannot
// shift the layout onto the wrong field; long free text gets more room while
// short codes and Sim/Não flags keep a small share, and an unknown header
// falls back to a middle weight instead of nothing.
import { EXPORT_HEADERS } from "../columns.ts";

const WEIGHT_BY_HEADER: Record<string, number> = {
  "ID": 6,
  "TAG": 8,
  "Instalação": 6,
  "Tipologia": 6,
  "Categoria": 9,
  "Agrupamento": 7,
  "Criticidade": 5,
  "Dono": 7,
  "Disponibilidade": 7,
  "Sem Cont. há": 8,
  "Conformidade": 7,
  "Comentários": 8,
  "Plano de Ação": 9,
  "Origem": 4,
  "Código Fracttal": 7,
  "Nome Instalação": 7,
  "Local Instalação": 6,
  "Tipologia Equip.": 6,
  "Elem. em Campo?": 4,
  "Elem. Operacional?": 4,
  "Status Operac.": 4,
  "Possui Plano?": 4,
  "Plano Cumprido?": 4,
  "Sem Falha?": 4,
  "Status Manut.": 4,
  "Há Conting.?": 4,
  "Desc. Contingência": 8,
  "Cód. Evidência": 4,
  "Desc. Degradação": 8,
  "Comentários 2": 8,
};
const DEFAULT_WEIGHT = 6;

export interface PdfColumn {
  x: number;
  w: number;
}

// colGeometry: one {x, w} per header in table order, summing to exactly
// totalWidth (the last column absorbs the rounding drift), so the table
// always fills the printable area and never overflows the page edge.
export function colGeometry(
  totalWidth: number,
  headers: string[] = EXPORT_HEADERS,
): PdfColumn[] {
  if (headers.length === 0) return [];
  const weights = headers.map((h) => WEIGHT_BY_HEADER[h] ?? DEFAULT_WEIGHT);
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) =>
    Math.floor((w / total) * totalWidth * 100) / 100
  );
  const drift = Math.round(
    (totalWidth - widths.reduce((a, b) => a + b, 0)) * 100,
  ) / 100;
  widths[widths.length - 1]! += drift;
  let x = 0;
  return widths.map((w) => {
    const col = { x: Math.round(x * 100) / 100, w };
    x += w;
    return col;
  });
}
