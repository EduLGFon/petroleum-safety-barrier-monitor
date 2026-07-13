import type { Barrier } from './types';
import { fmtDate, daysSince, humanDuration } from './utils';
import { DISP_COLORS, CONF_COLORS } from './constants';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function barrierToRow(b: Barrier) {
  const degradInfo = b.degradedSince
    ? `${humanDuration(daysSince(b.degradedSince))} (desde ${fmtDate(b.degradedSince)})`
    : '';
  return {
    ID:                b.id,
    TAG:               b.tag,
    Instalação:        b.instalacao,
    Tipologia:         b.tipologia,
    Localização:       b.locDesc,
    Categoria:         b.categoria,
    Agrupamento:       b.agrupamento,
    Criticidade:       b.criticidade,
    'Dono da Barreira': b.dono || 'Não informado',
    Disponibilidade:   b.disponibilidade,
    'Degradada há':    degradInfo,
    Conformidade:      b.conformidade,
    Comentários:       b.comentarios || '',
    'Plano de Ação':   b.planoAcao || 'Vazio',
  };
}

function timestamp(): string {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Excel (.xlsx) ────────────────────────────────────────────────────────────

export async function exportToExcel(barriers: Barrier[], filename = 'barreiras-sgso') {
  const XLSX = await import('xlsx');

  const rows = barriers.map(barrierToRow);
  const ws   = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 6  }, // ID
    { wch: 22 }, // TAG
    { wch: 8  }, // Instalação
    { wch: 20 }, // Tipologia
    { wch: 28 }, // Localização
    { wch: 30 }, // Categoria
    { wch: 26 }, // Agrupamento
    { wch: 18 }, // Criticidade
    { wch: 22 }, // Dono
    { wch: 18 }, // Disponibilidade
    { wch: 22 }, // Degradada há
    { wch: 15 }, // Conformidade
    { wch: 40 }, // Comentários
    { wch: 40 }, // Plano de Ação
  ];

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Barreiras de Segurança');

  // Metadata sheet
  const meta = XLSX.utils.aoa_to_sheet([
    ['SEACREST PETRÓLEO — SGSO-FR-0024'],
    ['Inventário de Barreiras de Segurança'],
    [],
    ['Exportado em', timestamp()],
    ['Total de registros', barriers.length],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, 'Metadados');

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export async function exportToPDF(barriers: Barrier[], filename = 'barreiras-sgso') {
  const { jsPDF }           = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text('SEACREST PETRÓLEO — Inventário de Barreiras de Segurança', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`SGSO-FR-0024  |  ${timestamp()}  |  ${barriers.length} registros`, 14, 21);

  // Thin accent line
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(14, 24, 283, 24);

  // Color helpers
  const dispColor = (status: string): [number, number, number] => {
    const hex = DISP_COLORS[status]?.solid ?? '#94a3b8';
    const r   = parseInt(hex.slice(1, 3), 16);
    const g   = parseInt(hex.slice(3, 5), 16);
    const b   = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const confColor = (status: string): [number, number, number] => {
    const hex = CONF_COLORS[status]?.solid ?? '#94a3b8';
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  };

  autoTable(doc, {
    startY: 28,
    head: [['#', 'TAG', 'Inst.', 'Categoria', 'Criticidade', 'Disponibilidade', 'Degradada há', 'Conformidade', 'Plano de Ação']],
    body: barriers.map(b => [
      b.id,
      b.tag,
      b.instalacao,
      b.categoria,
      b.criticidade,
      b.disponibilidade,
      b.degradedSince ? humanDuration(daysSince(b.degradedSince)) : '—',
      b.conformidade,
      b.planoAcao || '—',
    ]),
    styles:     { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 37, 64], textColor: [226, 232, 240], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 36, font: 'courier' },
      2: { cellWidth: 12 },
      3: { cellWidth: 46 },
      4: { cellWidth: 28 },
      5: { cellWidth: 28 },
      6: { cellWidth: 22 },
      7: { cellWidth: 24 },
      8: { cellWidth: 40 },
    },
    didParseCell(data) {
      if (data.section === 'body') {
        if (data.column.index === 5) {
          const [r, g, b] = dispColor(String(data.cell.raw));
          data.cell.styles.textColor = [r, g, b];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 7) {
          const [r, g, b] = confColor(String(data.cell.raw));
          data.cell.styles.textColor = [r, g, b];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  // Page numbers
  const pages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${pages}  —  SGSO-FR-0024`, 14, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`${filename}.pdf`);
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export function exportToCSV(barriers: Barrier[], filename = 'barreiras-sgso') {
  const rows  = barriers.map(barrierToRow);
  const keys  = Object.keys(rows[0]) as (keyof ReturnType<typeof barrierToRow>)[];
  const esc   = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const csv   = [
    keys.map(esc).join(';'),
    ...rows.map(r => keys.map(k => esc(r[k])).join(';')),
  ].join('\r\n');

  const blob  = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
