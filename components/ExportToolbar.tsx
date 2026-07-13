'use client';

import { useState } from 'react';
import type { Barrier } from '@/lib/types';
import { exportToExcel, exportToPDF, exportToCSV } from '@/lib/export';

interface Props {
  selectedIds:    Set<number>;
  allFiltered:    Barrier[];
  onSelectAll:    () => void;
  onClearAll:     () => void;
}

type ExportFmt = 'xlsx' | 'pdf' | 'csv';

const FMT_LABELS: Record<ExportFmt, { icon: string; label: string; desc: string; color: string }> = {
  xlsx: { icon: '📊', label: 'Excel',  desc: '.xlsx',  color: '#16a34a' },
  pdf:  { icon: '📄', label: 'PDF',    desc: '.pdf',   color: '#dc2626' },
  csv:  { icon: '📋', label: 'CSV',    desc: '.csv',   color: '#2563eb' },
};

export function ExportToolbar({ selectedIds, allFiltered, onSelectAll, onClearAll }: Props) {
  const [loading, setLoading] = useState<ExportFmt | null>(null);

  const count   = selectedIds.size;
  const hasAny  = count > 0;
  const allSel  = count === allFiltered.length && allFiltered.length > 0;
  const someSel = count > 0 && count < allFiltered.length;

  async function doExport(fmt: ExportFmt) {
    if (!hasAny || loading) return;
    const barriers = allFiltered.filter(b => selectedIds.has(b.id));
    const ts       = new Date().toISOString().slice(0, 10);
    const name     = `SGSO-barreiras-${ts}`;
    setLoading(fmt);
    try {
      if (fmt === 'xlsx') await exportToExcel(barriers, name);
      if (fmt === 'pdf')  await exportToPDF(barriers, name);
      if (fmt === 'csv')  exportToCSV(barriers, name);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap', marginBottom: 10,
      padding: '10px 14px',
      background: hasAny
        ? 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))'
        : 'var(--bg-elevated)',
      border: hasAny ? '1px solid rgba(59,130,246,0.25)' : '1px solid var(--border)',
      borderRadius: 10,
      transition: 'all 0.2s',
    }}>
      {/* Select-all checkbox */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <CheckboxCustom
          checked={allSel}
          indeterminate={someSel}
          onChange={() => allSel ? onClearAll() : onSelectAll()}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {allSel
            ? `Todos os ${allFiltered.length.toLocaleString('pt-BR')} selecionados`
            : someSel
            ? `${count.toLocaleString('pt-BR')} de ${allFiltered.length.toLocaleString('pt-BR')} selecionados`
            : 'Selecionar todos'}
        </span>
      </label>

      {/* Clear */}
      {someSel && (
        <button onClick={onClearAll} style={{
          fontSize: 11, padding: '4px 8px', borderRadius: 6,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          Limpar
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Export buttons */}
      {hasAny && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>
            Exportar {count.toLocaleString('pt-BR')}:
          </span>
          {(Object.entries(FMT_LABELS) as [ExportFmt, typeof FMT_LABELS[ExportFmt]][]).map(([fmt, cfg]) => (
            <button key={fmt}
              onClick={() => doExport(fmt)}
              disabled={!!loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                border: `1px solid ${cfg.color}44`,
                background: `${cfg.color}12`,
                color: cfg.color,
                opacity: loading && loading !== fmt ? 0.5 : 1,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}>
              {loading === fmt ? (
                <span style={{ animation: 'pulse 1s infinite' }}>⏳</span>
              ) : (
                <span>{cfg.icon}</span>
              )}
              {cfg.label}
              <span style={{ fontSize: 9, opacity: 0.7 }}>{cfg.desc}</span>
            </button>
          ))}
        </div>
      )}

      {!hasAny && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Selecione itens para exportar
        </span>
      )}
    </div>
  );
}

// ─── Custom checkbox ──────────────────────────────────────────────────────────

function CheckboxCustom({
  checked, indeterminate, onChange,
}: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const active = checked || indeterminate;
  return (
    <div onClick={onChange}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: active ? '2px solid var(--accent)' : '2px solid var(--border)',
        background: active ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: active ? '0 0 6px var(--glow)' : 'none',
      }}>
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {indeterminate && (
        <div style={{ width: 8, height: 2, background: 'white', borderRadius: 1 }} />
      )}
    </div>
  );
}
