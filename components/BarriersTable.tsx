'use client';
import type { CSSProperties } from 'react';
import type { Barrier, FilterState, SortableColumn } from '@/lib/types';
import { DISP_COLORS, CONF_COLORS, CRIT_COLORS } from '@/lib/constants';
import { daysSince, humanDuration } from '@/lib/utils';
import { Badge } from './ui/Badge';

interface Props {
  rows: Barrier[];
  filters: FilterState;
  filteredTotal: number;
  totalPages: number;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSort: (col: SortableColumn) => void;
  onPageChange: (page: number) => void;
  onSelect: (b: Barrier) => void;
}

const COLUMNS: { col: SortableColumn; label: string; width?: string }[] = [
  { col: 'id',              label: '#',               width: '50px'  },
  { col: 'tag',             label: 'TAG / Identificação'              },
  { col: 'criticidade',     label: 'Criticidade',     width: '148px' },
  { col: 'categoria',       label: 'Categoria'                       },
  { col: 'disponibilidade', label: 'Disponibilidade', width: '162px' },
  { col: 'conformidade',    label: 'Conformidade',    width: '138px' },
];

const thStyle: CSSProperties = {
  padding: '9px 13px', textAlign: 'left', fontSize: 9,
  fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em',
  cursor: 'pointer', userSelect: 'none',
  background: 'var(--bg-elevated)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap', color: 'var(--text-muted)',
};

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{
      marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.3,
      color: active ? 'var(--accent)' : 'inherit',
    }}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '⇅'}
    </span>
  );
}

export function BarriersTable({
  rows, filters, filteredTotal, totalPages,
  selectedIds, onToggleSelect, onSort, onPageChange, onSelect,
}: Props) {
  return (
    <div>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 12,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                {/* Checkbox column */}
                <th style={{ ...thStyle, width: 40, cursor: 'default' }} />
                {COLUMNS.map(c => (
                  <th key={c.col}
                    onClick={() => onSort(c.col)}
                    style={{
                      ...thStyle, width: c.width,
                      color: filters.sortCol === c.col ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    {c.label}
                    <SortArrow active={filters.sortCol === c.col} dir={filters.sortDir} />
                  </th>
                ))}
                <th style={{ ...thStyle, width: 40, cursor: 'default' }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} style={{
                    padding: 48, textAlign: 'center',
                    color: 'var(--text-muted)', fontSize: 13,
                  }}>
                    Nenhuma barreira encontrada para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                rows.map((b, i) => {
                  const isSelected = selectedIds.has(b.id);
                  const dispColor  = DISP_COLORS[b.disponibilidade]?.solid ?? '#475569';
                  const isDegraded = b.disponibilidade === 'Degradada';

                  return (
                    <tr key={b.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isSelected
                          ? 'rgba(59,130,246,0.05)'
                          : i % 2 === 0 ? 'transparent' : 'var(--bg-stripe)',
                        transition: 'background 0.1s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected)
                          (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLTableRowElement).style.background = isSelected
                          ? 'rgba(59,130,246,0.05)'
                          : i % 2 === 0 ? 'transparent' : 'var(--bg-stripe)';
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '10px 13px' }}
                        onClick={e => { e.stopPropagation(); onToggleSelect(b.id); }}>
                        <RowCheckbox checked={isSelected} />
                      </td>

                      {/* # */}
                      <td onClick={() => onSelect(b)}
                        style={{
                          padding: '10px 13px', fontSize: 11,
                          color: 'var(--text-muted)', fontWeight: 600,
                          borderLeft: `3px solid ${dispColor}`,
                        }}>
                        {b.id}
                      </td>

                      {/* TAG */}
                      <td onClick={() => onSelect(b)} style={{ padding: '10px 13px' }}>
                        <div style={{
                          fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
                          fontWeight: 700, fontSize: 12, color: 'var(--text-primary)',
                        }}>
                          {b.tag}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {b.locDesc}
                        </div>
                        {/* Degradation timer */}
                        {isDegraded && b.degradedSince && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            marginTop: 4, padding: '2px 7px',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 4, fontSize: 9, fontWeight: 700,
                            color: '#ef4444', letterSpacing: '0.05em',
                          }}>
                            ⏱ {humanDuration(daysSince(b.degradedSince))} degradada
                            {!b.lastContingency && (
                              <span style={{
                                marginLeft: 4, padding: '1px 5px', borderRadius: 3,
                                background: 'rgba(239,68,68,0.15)', fontSize: 8, fontWeight: 700,
                                color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.08em',
                              }}>
                                sem contingência
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Criticidade */}
                      <td onClick={() => onSelect(b)} style={{ padding: '10px 13px' }}>
                        <Badge label={b.criticidade} {...CRIT_COLORS[b.criticidade]} size="sm" />
                      </td>

                      {/* Categoria */}
                      <td onClick={() => onSelect(b)} style={{
                        padding: '10px 13px', fontSize: 11, color: 'var(--text-secondary)',
                      }}>
                        {b.categoria}
                      </td>

                      {/* Disponibilidade */}
                      <td onClick={() => onSelect(b)} style={{ padding: '10px 13px' }}>
                        <Badge label={b.disponibilidade} {...DISP_COLORS[b.disponibilidade]} />
                      </td>

                      {/* Conformidade */}
                      <td onClick={() => onSelect(b)} style={{ padding: '10px 13px' }}>
                        <Badge label={b.conformidade} {...CONF_COLORS[b.conformidade]} />
                      </td>

                      {/* Detail button */}
                      <td onClick={() => onSelect(b)} style={{
                        padding: '10px 12px', textAlign: 'center',
                        fontSize: 12, color: 'var(--text-muted)',
                      }}>
                        ⋯
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination page={filters.page} totalPages={totalPages}
          total={filteredTotal} pageSize={filters.pageSize} onChange={onPageChange} />
      )}
    </div>
  );
}

// ─── Row checkbox ─────────────────────────────────────────────────────────────

function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <div style={{
      width: 15, height: 15, borderRadius: 4,
      border: checked ? '2px solid var(--accent)' : '2px solid var(--border)',
      background: checked ? 'var(--accent)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
      boxShadow: checked ? '0 0 6px var(--glow)' : 'none',
    }}>
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, total, pageSize, onChange }: {
  page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const from = ((page - 1) * pageSize) + 1;
  const to   = Math.min(page * pageSize, total);

  const btnS = (active: boolean, disabled: boolean): CSSProperties => ({
    minWidth: 30, height: 30, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    padding: '0 7px', fontSize: 11, fontWeight: active ? 700 : 500,
    border: active ? '1px solid transparent' : '1px solid var(--border)',
    borderRadius: 7,
    background: active ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'var(--bg-surface)',
    color: active ? '#fff' : disabled ? 'var(--border)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    boxShadow: active ? '0 2px 8px var(--glow)' : 'none',
    transition: 'all 0.15s',
  });

  const pages = buildPageList(page, totalPages);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onChange(1)}       disabled={page===1}         style={btnS(false,page===1)}>«</button>
        <button onClick={() => onChange(page-1)}  disabled={page===1}         style={btnS(false,page===1)}>‹</button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} style={{ ...btnS(false,true), cursor:'default' }}>…</span>
            : <button key={p} onClick={() => onChange(p as number)} style={btnS(page===p, false)}>{p}</button>
        )}
        <button onClick={() => onChange(page+1)}  disabled={page===totalPages} style={btnS(false,page===totalPages)}>›</button>
        <button onClick={() => onChange(totalPages)} disabled={page===totalPages} style={btnS(false,page===totalPages)}>»</button>
      </div>
    </div>
  );
}

function buildPageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const r: (number | '…')[] = [1];
  if (current > 3) r.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) r.push(p);
  if (current < total - 2) r.push('…');
  r.push(total);
  return r;
}
