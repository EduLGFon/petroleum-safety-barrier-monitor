import type { Barrier } from './types';
import { fmtDate, daysSince, humanDuration } from './utils';
import { DISP_COLORS, CONF_COLORS } from './constants';

function row(b: Barrier) {
  const nc   = b.conformidade === 'Não Conforme';
  const when = nc && b.statusSince
    ? `${humanDuration(daysSince(b.statusSince))} (desde ${fmtDate(b.statusSince)})` : '';
  return [
    b.id, b.tag, b.instalacao, b.tipologia, b.locDesc,
    b.categoria, b.agrupamento, b.criticidade, b.dono||'Não informado',
    b.disponibilidade, when, b.conformidade,
    b.comentarios||'', b.planoAcao||'',
  ];
}

function ts() {
  return new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function hexArgb(hex: string) {
  return 'FF' + hex.replace('#','').toUpperCase();
}

function lightenArgb(hex: string, f = 0.88) {
  const h = hex.replace('#','');
  const r = Math.round(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f);
  const g = Math.round(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f);
  const b = Math.round(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f);
  return 'FF'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
}

// ── Excel ────────────────────────────────────────────────────────────────────

export async function exportToExcel(barriers: Barrier[], filename = 'seacrest-barreiras') {
  const EJS = await import('exceljs');
  const wb  = new EJS.Workbook();
  wb.creator = 'Seacrest Petróleo';
  wb.created  = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('Monitor de Barreiras', {
    views: [{ state:'frozen', ySplit:3 }],
    pageSetup: { paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0 },
  });

  // ── Brand header (rows 1-2) ─────────────────────────────────────────────
  const COLS_W = [7,24,9,22,28,30,26,14,22,26,24,17,36,36];
  COLS_W.forEach((w,i) => { ws.getColumn(i+1).width = w; });

  ws.mergeCells('A1:N1');
  const c1 = ws.getCell('A1');
  c1.value     = 'SEACREST PETRÓLEO — Monitor de Barreiras de Segurança';
  c1.font      = { name:'Calibri', size:14, bold:true, color:{ argb:'FFFFFFFF' } };
  c1.alignment = { horizontal:'left', vertical:'middle', indent:2 };
  c1.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0A1628' } };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:N2');
  const c2 = ws.getCell('A2');
  c2.value     = `Exportado em ${ts()}  |  ${barriers.length.toLocaleString('pt-BR')} registros`;
  c2.font      = { name:'Calibri', size:9, italic:true, color:{ argb:'FF94A3B8' } };
  c2.alignment = { horizontal:'left', vertical:'middle', indent:2 };
  c2.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0E2036' } };
  ws.getRow(2).height = 17;

  // ── Column headers (row 3) ──────────────────────────────────────────────
  const hdrs = ['#','TAG','Inst.','Tipologia','Localização','Categoria','Agrupamento','Criticidade','Dono','Disponibilidade','Sem Conting. há','Conformidade','Comentários','Plano de Ação'];
  ws.getRow(3).height = 22;
  hdrs.forEach((h,i) => {
    const cell    = ws.getCell(3, i+1);
    cell.value    = h;
    cell.font     = { name:'Calibri', size:9, bold:true, color:{ argb:'FFFFFFFF' } };
    cell.fill     = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E3A5F' } };
    cell.alignment= { horizontal:'center', vertical:'middle' };
    cell.border   = { bottom:{ style:'medium', color:{ argb:'FF3B82F6' } } };
  });

  ws.autoFilter = { from:{ row:3, column:1 }, to:{ row:3, column:hdrs.length } };

  // ── Data rows ───────────────────────────────────────────────────────────
  barriers.forEach((b, idx) => {
    const rn   = idx + 4;
    const vals = row(b);
    const bg   = idx%2===0 ? 'FFF8FAFC' : 'FFFFFFFF';
    ws.getRow(rn).height = 16;

    vals.forEach((v, ci) => {
      const cell    = ws.getCell(rn, ci+1);
      cell.value    = v;
      cell.font     = { name:'Calibri', size:9, color:{ argb:'FF1E293B' } };
      cell.alignment= { vertical:'middle' };
      cell.fill     = { type:'pattern', pattern:'solid', fgColor:{ argb:bg } };
      cell.border   = { bottom:{ style:'hair', color:{ argb:'FFE2E8F0' } } };

      if (ci === 1) {
        cell.font = { name:'Courier New', size:8, bold:true, color:{ argb:'FF1D4ED8' } };
      }
      if (ci === 9) {
        const cfg = DISP_COLORS[String(v)];
        if (cfg) {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:lightenArgb(cfg.solid, 0.86) } };
          cell.font = { name:'Calibri', size:9, bold:true, color:{ argb:hexArgb(cfg.solid) } };
          cell.alignment = { horizontal:'center', vertical:'middle' };
        }
      }
      if (ci === 11) {
        const cfg = CONF_COLORS[String(v)];
        if (cfg) {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:lightenArgb(cfg.solid, 0.90) } };
          cell.font = { name:'Calibri', size:9, bold:true, color:{ argb:hexArgb(cfg.solid) } };
          cell.alignment = { horizontal:'center', vertical:'middle' };
        }
      }
      if (ci === 7) {
        const isCrit = String(v) === 'Crítica';
        cell.font = { name:'Calibri', size:9, bold:isCrit, color:{ argb:isCrit?'FFF97316':'FF64748B' } };
        cell.alignment = { horizontal:'center', vertical:'middle' };
      }
      if (ci === 10 && v) {
        cell.font = { name:'Calibri', size:9, italic:true, color:{ argb:'FFEA580C' } };
      }
    });
  });

  // ── Summary sheet ───────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Resumo');
  const kpi = [
    ['SEACREST PETRÓLEO — Resumo Monitor de Barreiras',''],
    [`Gerado em: ${ts()}`,''],['',''],
    ['Indicador','Qtd.'],
    ['Total',barriers.length],
    ['Disponíveis',barriers.filter(b=>b.disponibilidade==='Disponível').length],
    ['Fora de Operação',barriers.filter(b=>b.disponibilidade==='Fora de Operação').length],
    ['Ind. Contingenciado',barriers.filter(b=>b.disponibilidade==='Indisponível Contingenciado').length],
    ['Degr. Contingenciado',barriers.filter(b=>b.disponibilidade==='Degradado Contingenciado').length],
    ['Degradado (NC)',barriers.filter(b=>b.disponibilidade==='Degradado').length],
    ['Indisponível (NC)',barriers.filter(b=>b.disponibilidade==='Indisponível').length],
    ['Conformes',barriers.filter(b=>b.conformidade==='Conforme').length],
    ['Não Conformes',barriers.filter(b=>b.conformidade==='Não Conforme').length],
    ['% Conformidade',`${Math.round(barriers.filter(b=>b.conformidade==='Conforme').length/(barriers.length||1)*100)}%`],
  ];
  ws2.getColumn(1).width = 30;
  ws2.getColumn(2).width = 16;
  kpi.forEach((r,i) => {
    r.forEach((v,j) => {
      const cell  = ws2.getCell(i+1, j+1);
      cell.value  = v;
      if (i === 0) {
        cell.font = { name:'Calibri', size:12, bold:true, color:{ argb:'FFFFFFFF' } };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0A1628' } };
        cell.alignment = { indent:1, vertical:'middle' };
        ws2.getRow(i+1).height = 24;
      } else if (i === 3) {
        cell.font = { name:'Calibri', size:10, bold:true, color:{ argb:'FFFFFFFF' } };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E3A5F' } };
      } else {
        cell.font = { name:'Calibri', size:10 };
      }
    });
  });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf],{ type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url; a.download = `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export async function exportToPDF(barriers: Barrier[], filename = 'seacrest-barreiras') {
  const { jsPDF }              = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });

  doc.setFillColor(10,22,40); doc.rect(0,0,297,30,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255);
  doc.text('SEACREST PETRÓLEO',14,12);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(148,163,184);
  doc.text('Monitor de Barreiras de Segurança',14,19);
  doc.text(`${ts()}  |  ${barriers.length.toLocaleString('pt-BR')} registros`,14,25);
  doc.setDrawColor(59,130,246); doc.setLineWidth(0.5); doc.line(0,30,297,30);

  const hr = (hex:string):[number,number,number] => {
    const h=hex.replace('#','');
    return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  };

  autoTable(doc,{
    startY:34,
    head:[['#','TAG','Inst.','Categoria','Criticidade','Disponibilidade','Sem Cont. há','Conformidade','Plano']],
    body: barriers.map(b=>[
      b.id, b.tag, b.instalacao, b.categoria, b.criticidade, b.disponibilidade,
      b.conformidade==='Não Conforme'&&b.statusSince ? humanDuration(daysSince(b.statusSince)) : '—',
      b.conformidade, b.planoAcao||'—',
    ]),
    styles:     { fontSize:7.5, cellPadding:2.5 },
    headStyles: { fillColor:[30,58,95], textColor:[226,232,240], fontStyle:'bold', fontSize:8 },
    columnStyles: { 0:{cellWidth:9}, 1:{cellWidth:34,font:'courier'}, 2:{cellWidth:11}, 3:{cellWidth:44}, 4:{cellWidth:20}, 5:{cellWidth:34}, 6:{cellWidth:20}, 7:{cellWidth:24}, 8:{cellWidth:42} },
    didParseCell(d) {
      if(d.section!=='body') return;
      if(d.column.index===5){const[r,g,b]=hr(DISP_COLORS[String(d.cell.raw)]?.solid??'#94a3b8');d.cell.styles.textColor=[r,g,b];d.cell.styles.fontStyle='bold';}
      if(d.column.index===7){const[r,g,b]=hr(CONF_COLORS[String(d.cell.raw)]?.solid??'#94a3b8');d.cell.styles.textColor=[r,g,b];d.cell.styles.fontStyle='bold';}
      if(d.column.index===6&&String(d.cell.raw)!=='—'){d.cell.styles.textColor=[234,88,12];}
    },
    alternateRowStyles: { fillColor:[248,250,252] },
    margin: { left:14, right:14 },
  });

  const pages = (doc as unknown as{internal:{getNumberOfPages():number}}).internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(148,163,184);
    doc.text(`Seacrest Petróleo · Monitor de Barreiras · Página ${i} de ${pages}`,14,doc.internal.pageSize.getHeight()-6);
  }
  doc.save(`${filename}.pdf`);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export function exportToCSV(barriers: Barrier[], filename = 'seacrest-barreiras') {
  const hdrs = ['ID','TAG','Instalação','Tipologia','Localização','Categoria','Agrupamento','Criticidade','Dono','Disponibilidade','Sem Cont. há','Conformidade','Comentários','Plano de Ação'];
  const esc  = (v:unknown) => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv  = [hdrs.map(esc).join(';'),...barriers.map(b=>row(b).map(esc).join(';'))].join('\r\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}
