'use client';
import { useState, useCallback, useEffect } from 'react';
import type { Barrier } from '@/lib/types';
import { useDashboard }      from '@/hooks/useDashboard';
import { useSettings }       from '@/context/SettingsContext';
import { Header }            from './Header';
import { LocationFilter }    from './LocationFilter';
import { StatusBand }        from './StatusBand';
import { KpiGrid }           from './KpiGrid';
import { ConformidadeChart } from './ConformidadeChart';
import { FilterBar }         from './FilterBar';
import { ExportToolbar }     from './ExportToolbar';
import { BarriersTable }     from './BarriersTable';
import { BarrierModal }      from './BarrierModal';
import { LoadingScreen }     from './LoadingScreen';
import { SettingsPanel }     from './SettingsPanel';
import { AlertTriangleIcon, ArrowRightIcon } from './ui/Icons';

interface Props { initialBarriers: Barrier[]; }

export function Dashboard({ initialBarriers: barriers }: Props) {
  const [loading,      setLoading]      = useState(true);
  const [visible,      setVisible]      = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings } = useSettings();

  const handleLoadDone = useCallback(() => {
    setLoading(false);
    // Short delay then fade in — smoother than instant
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 30));
  }, []);

  const {
    location, filters, kpi, chartData,
    rows, allFiltered, filteredTotal, totalPages,
    hasActiveFilters, hydrated, selectedIds,
    openBarrier, setOpenId,
    setLocation, setFilter, setSort, resetFilters, showUrgentes,
    toggleSelect, selectAll, clearAll,
  } = useDashboard(barriers, settings.defaultLocation);

  // Apply settings default filters after hydration (once)
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (!hydrated || defaultsApplied || loading) return;
    setDefaultsApplied(true);
    // Only apply settings defaults if no persisted state existed
    const df = settings.defaultFilters;
    if (Object.keys(df).length > 0) {
      setFilter(df as Parameters<typeof setFilter>[0]);
    }
  }, [hydrated, defaultsApplied, loading, settings.defaultFilters, setFilter]);

  const ncCount = kpi.degradado + kpi.indisponivel;
  const isUrgentesActive = filters.conformidade === 'Não Conforme' && filters.sortCol === 'statusSince';

  return (
    <>
      {loading && <LoadingScreen onDone={handleLoadDone}/>}

      <div style={{
        fontFamily:"-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif",
        background:'var(--bg-page)', minHeight:'100dvh',
        padding:'18px 22px', boxSizing:'border-box',
        color:'var(--text-primary)', fontSize:15,
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'none' : 'translateY(6px)',
        transition: 'opacity .5s var(--ease-out), transform .5s var(--ease-out)',
      }}>
        {/* Header */}
        <Header onOpenSettings={() => setSettingsOpen(true)}/>

        {/* Location tabs */}
        <div style={{ animation:'slideUp .3s .04s var(--ease-out) both' }}>
          <LocationFilter selected={location} allBarriers={barriers} onChange={setLocation}/>
        </div>

        {/* Status band */}
        <div style={{ animation:'slideUp .3s .08s var(--ease-out) both' }}>
          <StatusBand kpi={kpi} activeFilter={filters.disponibilidade} onFilter={v=>setFilter({disponibilidade:v})}/>
        </div>

        {/* KPI cards */}
        <KpiGrid kpi={kpi} location={location}/>

        {/* Chart */}
        <div style={{ animation:'slideUp .3s .28s var(--ease-out) both' }}>
          <ConformidadeChart data={chartData}/>
        </div>

        {/* NC alert — high-contrast in light mode via CSS vars */}
        {ncCount > 0 && (
          <div className="animate-fade-in" style={{
            display:'flex', alignItems:'center', gap:12,
            padding:'13px 18px', marginBottom:14,
            background:'var(--alert-nc-bg)',
            border:'1px solid var(--alert-nc-border)',
            borderRadius:12,
            animationDelay:'.32s',
          }}>
            <AlertTriangleIcon size={18} color="var(--alert-nc-text)" strokeWidth={2}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--alert-nc-text)' }}>
                {ncCount.toLocaleString('pt-BR')} barreira{ncCount>1?'s':''} sem contingenciamento
              </div>
              <div style={{ fontSize:12, color:'var(--alert-nc-sub)', marginTop:2 }}>
                Degradadas ou indisponíveis · ordenadas da mais urgente
              </div>
            </div>
            <button className="lift"
              onClick={() => isUrgentesActive ? resetFilters() : showUrgentes()}
              style={{
                display:'flex', alignItems:'center', gap:6,
                fontSize:12, fontWeight:700, padding:'7px 14px',
                borderRadius:8,
                background:'color-mix(in srgb,var(--alert-nc-text) 12%,transparent)',
                border:'1px solid color-mix(in srgb,var(--alert-nc-text) 35%,transparent)',
                color:'var(--alert-nc-text)', cursor:'pointer', whiteSpace:'nowrap',
              }}>
              {isUrgentesActive
                ? 'Limpar filtro'
                : <><ArrowRightIcon size={12} color="var(--alert-nc-text)" strokeWidth={2.5}/> Ver urgentes</>
              }
            </button>
          </div>
        )}

        {/* Export toolbar + filters */}
        <div style={{ animation:'slideUp .3s .36s var(--ease-out) both' }}>
          <ExportToolbar selectedIds={selectedIds} allFiltered={allFiltered} onSelectAll={selectAll} onClearAll={clearAll}/>
          <FilterBar filters={filters} filteredTotal={filteredTotal} hasActiveFilters={hasActiveFilters} onFilter={setFilter} onReset={resetFilters}/>
        </div>

        {/* Table */}
        <div style={{ animation:'slideUp .3s .4s var(--ease-out) both' }}>
          <BarriersTable
            rows={rows} filters={filters} filteredTotal={filteredTotal} totalPages={totalPages}
            selectedIds={selectedIds} onToggleSelect={toggleSelect}
            onSort={setSort} onPageChange={p=>setFilter({page:p})} onSelect={b=>setOpenId(b.id)}
          />
        </div>

        <div style={{ marginTop:28, textAlign:'center', fontSize:11, color:'var(--border)', letterSpacing:'0.08em', animation:'fadeInFast .4s .5s both' }}>
          Seacrest Petróleo · Monitor de Barreiras de Segurança
        </div>
      </div>

      <BarrierModal barrier={openBarrier} onClose={() => setOpenId(null)}/>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}/>
    </>
  );
}
