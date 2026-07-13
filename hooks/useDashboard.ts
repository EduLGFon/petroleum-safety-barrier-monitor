'use client';
import { useMemo, useReducer, useCallback, useState, useEffect } from 'react';
import type { Barrier, FilterState, SortableColumn } from '@/lib/types';
import { LOCATIONS } from '@/lib/constants';
import { computeKpi, computeChartData, applyFilters, applySorting, paginate, defaultFilters } from '@/lib/utils';

// ─── State persistence ────────────────────────────────────────────────────────

const STORE_KEY = 'seacrest-dashboard';

interface PersistedDash {
  location:    string;
  filters:     FilterState;
  selectedIds: number[];
  openId:      number | null;
}

function loadDash(): Partial<PersistedDash> {
  if (typeof window === 'undefined') return {};
  try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : {}; }
  catch { return {}; }
}

function saveDash(d: PersistedDash) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type:'SET_LOCATION'; payload:string }
  | { type:'SET_FILTER';   payload:Partial<FilterState> }
  | { type:'SET_SORT';     payload:SortableColumn }
  | { type:'RESET_FILTERS' };

interface State { location:string; filters:FilterState; }

function reducer(s: State, a: Action): State {
  switch(a.type) {
    case 'SET_LOCATION': return { ...s, location:a.payload, filters:{...s.filters,page:1} };
    case 'SET_FILTER':   return { ...s, filters:{...s.filters,...a.payload,page:1} };
    case 'SET_SORT': {
      const col=a.payload, dir=s.filters.sortCol===col&&s.filters.sortDir==='asc'?'desc':'asc';
      return { ...s, filters:{...s.filters,sortCol:col,sortDir:dir} };
    }
    case 'RESET_FILTERS': return { ...s, filters:defaultFilters() };
    default: return s;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboard(allBarriers: Barrier[]) {
  const persisted = useMemo(() => loadDash(), []);

  const [state, dispatch] = useReducer(reducer, {
    location: persisted.location ?? 'ALL',
    filters:  persisted.filters  ?? defaultFilters(),
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(persisted.selectedIds ?? [])
  );
  const [openId, setOpenId] = useState<number | null>(persisted.openId ?? null);

  // Persist on every change
  useEffect(() => {
    saveDash({
      location:    state.location,
      filters:     state.filters,
      selectedIds: [...selectedIds],
      openId,
    });
  }, [state, selectedIds, openId]);

  const locationBarriers = useMemo(
    () => state.location === 'ALL' ? allBarriers : allBarriers.filter(b => b.instalacao === state.location),
    [allBarriers, state.location]
  );

  const kpi       = useMemo(() => computeKpi(locationBarriers),      [locationBarriers]);
  const chartData = useMemo(() => computeChartData(locationBarriers), [locationBarriers]);
  const filtered  = useMemo(() => applyFilters(locationBarriers, state.filters),   [locationBarriers, state.filters]);
  const sorted    = useMemo(() => applySorting(filtered, state.filters),           [filtered, state.filters]);
  const rows      = useMemo(() => paginate(sorted, state.filters.page, state.filters.pageSize), [sorted, state.filters]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.filters.pageSize));

  const locationDetails = LOCATIONS.find(l => l.code === state.location);

  // Open barrier derived from persisted openId
  const openBarrier = useMemo(
    () => openId ? allBarriers.find(b => b.id === openId) ?? null : null,
    [openId, allBarriers]
  );

  const setLocation  = useCallback((code: string) => { dispatch({type:'SET_LOCATION',payload:code}); setSelectedIds(new Set()); }, []);
  const setFilter    = useCallback((patch: Partial<FilterState>) => dispatch({type:'SET_FILTER',payload:patch}), []);
  const setSort      = useCallback((col: SortableColumn) => dispatch({type:'SET_SORT',payload:col}), []);
  const resetFilters = useCallback(() => { dispatch({type:'RESET_FILTERS'}); setSelectedIds(new Set()); }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const selectAll  = useCallback(() => setSelectedIds(new Set(sorted.map(b => b.id))), [sorted]);
  const clearAll   = useCallback(() => setSelectedIds(new Set()), []);

  const hasActiveFilters = !!state.filters.query || !!state.filters.disponibilidade ||
    !!state.filters.conformidade || !!state.filters.categoria;

  return {
    location: state.location, locationDetails, filters: state.filters,
    kpi, chartData, rows, allFiltered: sorted,
    filteredTotal: sorted.length, totalPages, hasActiveFilters,
    selectedIds, openBarrier, setOpenId,
    setLocation, setFilter, setSort, resetFilters,
    toggleSelect, selectAll, clearAll,
  };
}
