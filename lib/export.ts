import type { Barrier } from './types';
import { fmtDate, daysSince, humanDuration } from './utils';
import { DISP_COLORS, CONF_COLORS } from './constants';

function barrierToRow(b: Barrier) {
  const nc = b.conformidade === 'Não Conforme';
  const ncTime = nc && b.statusSince
    ? `${humanDuration(daysSince(b.statusSince))} (desde ${fmtDate(b.statusSince)})` : '';
  return {
    ID: b.id, TAG: b.tag, 'Instalação': b.instalacao, 'Tipologia': b.tipologia,
    'Localização': b.locDesc, 'Categoria': b.categoria, 'Agrupamento': b.agrupamento,
    'Criticidade': b.criticidade, 'Dono da Barreira': b.dono || 'Não informado',
    'Disponibilidade': b.disponibilidade, 'NC há': ncTime, 'Conformidade': b.conformidade,
    'Comentários': b.comentarios || '', 'Plano de Ação': b.planoAcao || '',
  };
}

function ts():string { return new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }

function hexToArgb(hex:string):string { const h=hex.replace('#',''); return `FF${h.toUpperCase()}`; }

function lighten(hex:string,f=0.82):string {
  const h=hex.replace('#','');
  const r=Math.round(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f).toString(16).padStart(2,'0');
  const g=Math.round(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f).toString(16).padStart(2,'0');
  const b=Math.round(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f).toString(16).padStart(2,'0');
  return `FF${r}${g}${b}`.toUpperCase();
}

export async function exportToExcel(barriers: Barrier[], filename='seacrest-barreiras') {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Seacrest Petróleo'; wb.created = new Date(); wb.modified = new Date();

  const ws = wb.addWorksheet('Monitor de Barreiras', {
    views: [{ state:'frozen', ySplit:3, xSplit:0 }],
    pageSetup: { paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0 },
  });

  // Row 1 – brand header
  ws.mergeCells('A1:N1');
  const r1 = ws.getCell('A1');
  r1.value = 'SEACREST PETRÓLEO — Monitor de Barreiras de Segurança';
  r1.font = { name:'Calibri', size:14, bold:true, color:{argb:'FFFFFFFF'} };
  r1.alignment = { horizontal:'left', vertical:'middle', indent:2 };
  r1.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0A1628'} };
  ws.getRow(1).height = 28;

  // Row 2 – subtitle
  ws.mergeCells('A2:N2');
  const r2 = ws.getCell('A2');
  r2.value = `Exportado em ${ts()}  |  ${barriers.length.toLocaleString('pt-BR')} registros  |  Seacrest Petróleo`;
  r2.font = { name:'Calibri', size:9, italic:true, color:{argb:'FF94A3B8'} };
  r2.alignment = { horizontal:'left', vertical:'middle', indent:2 };
  r2.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0E2036'} };
  ws.getRow(2).height = 18;

  // Row 3 – column headers
  const headers = [
    {label:'#',width:7},{label:'TAG',width:24},{label:'Inst.',width:9},
    {label:'Tipologia',width:22},{label:'Localização',width:28},{label:'Categoria',width:30},
    {label:'Agrupamento',width:26},{label:'Criticidade',width:14},{label:'Dono',width:22},
    {label:'Disponibilidade',width:26},{label:'NC há',width:22},{label:'Conformidade',width:17},
    {label:'Comentários',width:36},{label:'Plano de Ação',width:36},
  ];
  headers.forEach((h,i)=>{
    ws.getColumn(i+1).width = h.width;
    const cell = ws.getCell(3,i+1);
    cell.value = h.label;
    cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FFFFFFFF'} };
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1E3A5F'} };
    cell.alignment = { horizontal:'center', vertical:'middle' };
    cell.border = { bottom:{style:'medium',color:{argb:'FF3B82F6'}} };
  });
  ws.getRow(3).height = 22;

  // Data rows
  barriers.map(barrierToRow).forEach((r,idx)=>{
    const row = idx+4;
    const bg = idx%2===0?'FFF8FAFC':'FFFFFFFF';
    const vals = [r.ID,r.TAG,r['Instalação'],r['Tipologia'],r['Localização'],r['Categoria'],r['Agrupamento'],r['Criticidade'],r['Dono da Barreira'],r['Disponibilidade'],r['NC há'],r['Conformidade'],r['Comentários'],r['Plano de Ação']];
    ws.getRow(row).height = 16;
    vals.forEach((v,ci)=>{
      const cell = ws.getCell(row,ci+1);
      cell.value = v;
      cell.font = { name:'Calibri', size:9 };
      cell.alignment = { vertical:'middle' };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:bg} };
      cell.border = { bottom:{style:'hair',color:{argb:'FFE2E8F0'}} };
      if(ci===1){ cell.font={name:'Courier New',size:8,bold:true,color:{argb:'FF1D4ED8'}}; }
      if(ci===9){
        const cfg=DISP_COLORS[String(v)];
        if(cfg){ cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:lighten(cfg.solid,0.85)}}; cell.font={name:'Calibri',size:9,bold:true,color:{argb:hexToArgb(cfg.solid)}}; cell.alignment={horizontal:'center',vertical:'middle'}; }
      }
      if(ci===11){
        const cfg=CONF_COLORS[String(v)];
        if(cfg){ cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:lighten(cfg.solid,0.88)}}; cell.font={name:'Calibri',size:9,bold:true,color:{argb:hexToArgb(cfg.solid)}}; cell.alignment={horizontal:'center',vertical:'middle'}; }
      }
      if(ci===7){ const isCrit=String(v)==='Crítica'; cell.font={name:'Calibri',size:9,bold:isCrit,color:{argb:isCrit?'FFF97316':'FF64748B'}}; cell.alignment={horizontal:'center',vertical:'middle'}; }
      if(ci===10&&v){ cell.font={name:'Calibri',size:9,color:{argb:'FFEA580C'},italic:true}; }
    });
  });

  ws.autoFilter = { from:{row:3,column:1}, to:{row:3,column:headers.length} };

  // Summary sheet
  const ws2 = wb.addWorksheet('Resumo');
  const total = barriers.length;
  const kpiRows = [
    ['SEACREST PETRÓLEO — Resumo Monitor de Barreiras',''],
    [`Gerado em: ${ts()}`,''],['',''],
    ['Indicador','Valor'],
    ['Total de Barreiras',total],
    ['Disponíveis',barriers.filter(b=>b.disponibilidade==='Disponível').length],
    ['Fora de Operação',barriers.filter(b=>b.disponibilidade==='Fora de Operação').length],
    ['Ind. Contingenciado',barriers.filter(b=>b.disponibilidade==='Indisponível Contingenciado').length],
    ['Degr. Contingenciado',barriers.filter(b=>b.disponibilidade==='Degradado Contingenciado').length],
    ['Degradado (NC)',barriers.filter(b=>b.disponibilidade==='Degradado').length],
    ['Indisponível (NC)',barriers.filter(b=>b.disponibilidade==='Indisponível').length],
    ['Conformes',barriers.filter(b=>b.conformidade==='Conforme').length],
    ['Não Conformes',barriers.filter(b=>b.conformidade==='Não Conforme').length],
    ['% Conformidade',`${Math.round(barriers.filter(b=>b.conformidade==='Conforme').length/(total||1)*100)}%`],
  ];
  kpiRows.forEach((row,i)=>{
    row.forEach((v,j)=>{
      const cell=ws2.getCell(i+1,j+1);
      cell.value=v;
      if(i===0)cell.font={bold:true,size:12,color:{argb:'FFFFFFFF'}};
      else if(i===3)cell.font={bold:true,size:10,color:{argb:'FFFFFFFF'}};
      if(i===0||i===3)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i===0?'FF0A1628':'FF1E3A5F'}};
    });
  });
  ws2.getColumn(1).width=28; ws2.getColumn(2).width=16;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

export async function exportToPDF(barriers: Barrier[], filename='seacrest-barreiras') {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFillColor(10,22,40); doc.rect(0,0,297,30,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255);
  doc.text('SEACREST PETRÓLEO',14,11);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(148,163,184);
  doc.text('Monitor de Barreiras de Segurança',14,18);
  doc.text(`${ts()}  |  ${barriers.length.toLocaleString('pt-BR')} registros`,14,24);
  doc.setDrawColor(59,130,246); doc.setLineWidth(0.6); doc.line(0,30,297,30);
  const hr=(hex:string):[number,number,number]=>{const h=hex.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};
  autoTable(doc,{
    startY:34,
    head:[['#','TAG','Inst.','Categoria','Criticidade','Disponibilidade','NC há','Conformidade','Plano de Ação']],
    body: barriers.map(b=>[
      b.id,b.tag,b.instalacao,b.categoria,b.criticidade,b.disponibilidade,
      (b.conformidade==='Não Conforme'&&b.statusSince)?humanDuration(daysSince(b.statusSince)):'—',
      b.conformidade, b.planoAcao||'—',
    ]),
    styles:{fontSize:7.5,cellPadding:2.5,overflow:'linebreak'},
    headStyles:{fillColor:[30,58,95],textColor:[226,232,240],fontStyle:'bold',fontSize:8},
    columnStyles:{0:{cellWidth:9},1:{cellWidth:34,font:'courier'},2:{cellWidth:11},3:{cellWidth:44},4:{cellWidth:20},5:{cellWidth:34},6:{cellWidth:20},7:{cellWidth:24},8:{cellWidth:42}},
    didParseCell(data){
      if(data.section!=='body')return;
      if(data.column.index===5){const[r,g,b]=hr(DISP_COLORS[String(data.cell.raw)]?.solid??'#94a3b8');data.cell.styles.textColor=[r,g,b];data.cell.styles.fontStyle='bold';}
      if(data.column.index===7){const[r,g,b]=hr(CONF_COLORS[String(data.cell.raw)]?.solid??'#94a3b8');data.cell.styles.textColor=[r,g,b];data.cell.styles.fontStyle='bold';}
      if(data.column.index===6&&String(data.cell.raw)!=='—'){data.cell.styles.textColor=[234,88,12];}
    },
    alternateRowStyles:{fillColor:[248,250,252]},
    margin:{left:14,right:14},
  });
  const pages=(doc as unknown as{internal:{getNumberOfPages():number}}).internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(148,163,184);
    doc.text(`Seacrest Petróleo · Monitor de Barreiras de Segurança · Página ${i} de ${pages}`,14,doc.internal.pageSize.getHeight()-6);
  }
  doc.save(`${filename}.pdf`);
}

export function exportToCSV(barriers: Barrier[], filename='seacrest-barreiras') {
  const rows = barriers.map(barrierToRow);
  type K = keyof ReturnType<typeof barrierToRow>;
  const keys = Object.keys(rows[0]) as K[];
  const esc  = (v: unknown) => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv  = [keys.map(esc).join(';'),...rows.map(r=>keys.map(k=>esc(r[k])).join(';'))].join('\r\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}
