'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
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

interface Props { barriers: Barrier[]; }

export function Dashboard({ barriers }: Props) {
  const [loading,       setLoading]       = useState(true);
  const [visible,       setVisible]       = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const { settings } = useSettings();

  const handleLoadDone = useCallback(() => {
    setLoading(false);
    // Stagger entrance: short pause then reveal
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  // Apply default filters from settings once on mount
  const defaultsApplied = useRef(false);

  const {
    location, filters, kpi, chartData,
    rows, allFiltered, filteredTotal, totalPages,
    hasActiveFilters, selectedIds, openBarrier, setOpenId,
    setLocation, setFilter, setSort, resetFilters,
    toggleSelect, selectAll, clearAll,
  } = useDashboard(barriers);

  // Apply settings default filters once
  useEffect(() => {
    if (defaultsApplied.current || loading) return;
    defaultsApplied.current = true;
    const df = settings.defaultFilters;
    if (Object.keys(df).length > 0) {
      setFilter(df as Parameters<typeof setFilter>[0]);
    }
  }, [loading, settings.defaultFilters, setFilter]);

  const ncCount = kpi.degradado + kpi.indisponivel;

  return (
    <>
      {loading && <LoadingScreen onDone={handleLoadDone}/>}

      {/* Main wrapper — fades+scales in after loading */}
      <div style={{
        fontFamily:"-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif",
        background:'var(--bg-page)', minHeight:'100dvh',
        padding:'18px 22px', boxSizing:'border-box',
        color:'var(--text-primary)',
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'scale(1) translateY(0)' : 'scale(.98) translateY(10px)',
        transition: 'opacity .6s cubic-bezier(.4,0,.2,1), transform .6s cubic-bezier(.34,1.2,.64,1)',
      }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <Header onOpenSettings={() => setSettingsOpen(true)}/>

        {/* ── Location filter ────────────────────────────────────────── */}
        <div style={{ animation:'slideUp .4s .05s cubic-bezier(.34,1.2,.64,1) both' }}>
          <LocationFilter selected={location} allBarriers={barriers} onChange={setLocation}/>
        </div>

        {/* ── Status band ────────────────────────────────────────────── */}
        <div style={{ animation:'slideUp .4s .1s cubic-bezier(.34,1.2,.64,1) both' }}>
          <StatusBand kpi={kpi} activeFilter={filters.disponibilidade} onFilter={v => setFilter({ disponibilidade: v })}/>
        </div>

        {/* ── KPI cards ──────────────────────────────────────────────── */}
        <KpiGrid kpi={kpi} location={location}/>

        {/* ── Chart ──────────────────────────────────────────────────── */}
        <div style={{ animation:'slideUp .4s .3s cubic-bezier(.34,1.2,.64,1) both' }}>
          <ConformidadeChart data={chartData}/>
        </div>

        {/* ── Attention alert ─────────────────────────────────────────── */}
        {ncCount > 0 && (
          <div className="animate-fade-in" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', marginBottom:14, background:'linear-gradient(135deg,rgba(239,68,68,.07),rgba(239,68,68,.03))', border:'1px solid rgba(239,68,68,.22)', borderRadius:12, animationDelay:'.35s' }}>
            <AlertTriangleIcon size={18} color="#ef4444" strokeWidth={2.5}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#fca5a5' }}>
                {ncCount.toLocaleString('pt-BR')} barreira{ncCount>1?'s':''} sem contingenciamento
              </div>
              <div style={{ fontSize:11, color:'rgba(252,165,165,.65)', marginTop:2 }}>
                Degradadas ou indisponíveis com maior tempo sem plano de contingência
              </div>
            </div>
            <button className="lift"
              onClick={() => setFilter({ disponibilidade: filters.disponibilidade==='__NC__' ? '' : '__NC__' })}
              style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.35)', color:'#ef4444', cursor:'pointer', whiteSpace:'nowrap' }}>
              {filters.disponibilidade==='__NC__'
                ? 'Limpar filtro'
                : <><ArrowRightIcon size={11} color="#ef4444" strokeWidth={2.5}/> Ver urgentes</>
              }
            </button>
          </div>
        )}

        {/* ── Export + Filters ───────────────────────────────────────── */}
        <div style={{ animation:'slideUp .4s .4s cubic-bezier(.34,1.2,.64,1) both' }}>
          <ExportToolbar selectedIds={selectedIds} allFiltered={allFiltered} onSelectAll={selectAll} onClearAll={clearAll}/>
          <FilterBar filters={filters} filteredTotal={filteredTotal} hasActiveFilters={hasActiveFilters} onFilter={setFilter} onReset={resetFilters}/>
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div style={{ animation:'slideUp .4s .45s cubic-bezier(.34,1.2,.64,1) both' }}>
          <BarriersTable
            rows={rows} filters={filters} filteredTotal={filteredTotal} totalPages={totalPages}
            selectedIds={selectedIds} onToggleSelect={toggleSelect}
            onSort={setSort} onPageChange={p => setFilter({ page: p })}
            onSelect={b => setOpenId(b.id)}
          />
        </div>

        <div style={{ marginTop:28, textAlign:'center', fontSize:10, color:'var(--border)', letterSpacing:'0.08em', animation:'fadeInFast .4s .5s both' }}>
          Seacrest Petróleo · Monitor de Barreiras de Segurança
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      <BarrierModal barrier={openBarrier} onClose={() => setOpenId(null)}/>

      {/* ── Settings panel ─────────────────────────────────────────── */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}/>
    </>
  );
}
