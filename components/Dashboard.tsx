'use client';

import { useState } from 'react';
import type { Barrier } from '@/lib/types';
import { useDashboard }       from '@/hooks/useDashboard';
import { Header }             from './Header';
import { LocationFilter }     from './LocationFilter';
import { StatusBand }         from './StatusBand';
import { KpiGrid }            from './KpiGrid';
import { ConformidadeChart }  from './ConformidadeChart';
import { FilterBar }          from './FilterBar';
import { ExportToolbar }      from './ExportToolbar';
import { BarriersTable }      from './BarriersTable';
import { BarrierModal }       from './BarrierModal';

interface Props { barriers: Barrier[]; }

export function Dashboard({ barriers }: Props) {
  const [selected, setSelected] = useState<Barrier | null>(null);

  const {
    location, filters, kpi, chartData,
    rows, allFiltered, filteredTotal, totalPages,
    hasActiveFilters, selectedIds,
    setLocation, setFilter, setSort, resetFilters,
    toggleSelect, selectAll, clearAll,
  } = useDashboard(barriers);

  return (
    <>
      <div style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
        background: 'var(--bg-page)', minHeight: '100dvh',
        padding: '18px 22px', boxSizing: 'border-box',
        color: 'var(--text-primary)',
      }}>
        {/* Header */}
        <Header />

        {/* Location tabs */}
        <LocationFilter selected={location} allBarriers={barriers} onChange={setLocation} />

        {/* Status band */}
        <StatusBand
          kpi={kpi}
          activeFilter={filters.disponibilidade}
          onFilter={v => setFilter({ disponibilidade: v })}
        />

        {/* KPI cards */}
        <KpiGrid kpi={kpi} location={location} />

        {/* Chart */}
        <ConformidadeChart data={chartData} />

        {/* Degradation alert */}
        {kpi.degradada > 0 && (
          <div className="animate-fade-in" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px', marginBottom: 14,
            background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 13, color: '#fca5a5', fontWeight: 500, flex: 1 }}>
              {kpi.degradada.toLocaleString('pt-BR')} barreira
              {kpi.degradada > 1 ? 's degradadas requerem' : ' degradada requer'} atenção imediata.
            </span>
            <button
              onClick={() => setFilter({
                disponibilidade: filters.disponibilidade === 'Degradada' ? '' : 'Degradada',
              })}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {filters.disponibilidade === 'Degradada' ? '✕ Limpar' : 'Filtrar →'}
            </button>
          </div>
        )}

        {/* Export toolbar + filters */}
        <ExportToolbar
          selectedIds={selectedIds}
          allFiltered={allFiltered}
          onSelectAll={selectAll}
          onClearAll={clearAll}
        />

        <FilterBar
          filters={filters}
          filteredTotal={filteredTotal}
          hasActiveFilters={hasActiveFilters}
          onFilter={setFilter}
          onReset={resetFilters}
        />

        {/* Table */}
        <BarriersTable
          rows={rows}
          filters={filters}
          filteredTotal={filteredTotal}
          totalPages={totalPages}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSort={setSort}
          onPageChange={page => setFilter({ page })}
          onSelect={setSelected}
        />

        {/* Footer */}
        <div style={{
          marginTop: 28, textAlign: 'center',
          fontSize: 10, color: 'var(--border)',
          letterSpacing: '0.08em',
        }}>
          SEACREST PETRÓLEO · SGSO-FR-0024 · Inventário de Barreiras de Segurança
        </div>
      </div>

      {/* Floating modal */}
      <BarrierModal barrier={selected} onClose={() => setSelected(null)} />
    </>
  );
}
