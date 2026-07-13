'use client';
import { useState, useCallback } from 'react';
import type { Barrier } from '@/lib/types';
import { useDashboard }      from '@/hooks/useDashboard';
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
import { AlertTriangleIcon, ArrowRightIcon } from './ui/Icons';

interface Props { barriers: Barrier[]; }

export function Dashboard({ barriers }: Props) {
  const [selected, setSelected]   = useState<Barrier|null>(null);
  const [loading,  setLoading]    = useState(true);
  const handleDone = useCallback(() => setLoading(false), []);

  const {
    location, filters, kpi, chartData,
    rows, allFiltered, filteredTotal, totalPages,
    hasActiveFilters, selectedIds,
    setLocation, setFilter, setSort, resetFilters,
    toggleSelect, selectAll, clearAll,
  } = useDashboard(barriers);

  const ncCount = kpi.degradado + kpi.indisponivel;

  return (
    <>
      {loading && <LoadingScreen onDone={handleDone}/>}

      <div style={{ fontFamily:"-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif", background:'var(--bg-page)', minHeight:'100dvh', padding:'18px 22px', boxSizing:'border-box', color:'var(--text-primary)', opacity:loading?0:1, transition:'opacity .4s .1s' }}>

        <Header/>

        <LocationFilter selected={location} allBarriers={barriers} onChange={setLocation}/>

        <StatusBand kpi={kpi} activeFilter={filters.disponibilidade} onFilter={v=>setFilter({disponibilidade:v})}/>

        <KpiGrid kpi={kpi} location={location}/>

        <ConformidadeChart data={chartData}/>

        {/* Attention alert — NC barriers without contingency */}
        {ncCount > 0 && (
          <div className="animate-fade-in" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', marginBottom:14, background:'linear-gradient(135deg,rgba(239,68,68,.07),rgba(239,68,68,.03))', border:'1px solid rgba(239,68,68,.22)', borderRadius:12 }}>
            <AlertTriangleIcon size={18} color="#ef4444" strokeWidth={2.5}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#fca5a5' }}>
                {ncCount.toLocaleString('pt-BR')} barreira{ncCount>1?'s':''}
                {ncCount>1?' estão degradadas ou indisponíveis':' está degradada ou indisponível'} sem contingenciamento
              </div>
              <div style={{ fontSize:11, color:'rgba(252,165,165,.65)', marginTop:2 }}>
                Barreiras não conformes com maior tempo sem definição de plano
              </div>
            </div>
            <button
              onClick={()=>setFilter({disponibilidade:filters.disponibilidade==='__NC__'?'':'__NC__'})}
              style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, fontWeight:700, padding:'6px 14px', borderRadius:8, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.35)', color:'#ef4444', cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
              {filters.disponibilidade==='__NC__'?'Limpar filtro':<>Ver mais urgentes <ArrowRightIcon size={11} color="#ef4444" strokeWidth={2.5}/></>}
            </button>
          </div>
        )}

        <ExportToolbar selectedIds={selectedIds} allFiltered={allFiltered} onSelectAll={selectAll} onClearAll={clearAll}/>

        <FilterBar filters={filters} filteredTotal={filteredTotal} hasActiveFilters={hasActiveFilters} onFilter={setFilter} onReset={resetFilters}/>

        <BarriersTable
          rows={rows} filters={filters} filteredTotal={filteredTotal} totalPages={totalPages}
          selectedIds={selectedIds} onToggleSelect={toggleSelect}
          onSort={setSort} onPageChange={p=>setFilter({page:p})} onSelect={setSelected}
        />

        <div style={{ marginTop:28, textAlign:'center', fontSize:10, color:'var(--border)', letterSpacing:'0.08em' }}>
          Seacrest Petróleo · Monitor de Barreiras de Segurança
        </div>
      </div>

      <BarrierModal barrier={selected} onClose={()=>setSelected(null)}/>
    </>
  );
}
