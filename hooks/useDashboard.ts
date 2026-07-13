'use client';
import { useMemo, useReducer, useCallback, useState, useEffect } from 'react';
import type { Barrier, FilterState, SortableColumn } from '@/lib/types';
import { LOCATIONS } from '@/lib/constants';
import { computeKpi, computeChartData, applyFilters, applySorting, paginate, defaultFilters } from '@/lib/utils';

const STORE_KEY = 'seacrest-dashboard';

interface Persisted {
  location:    string;
  filters:     FilterState;
  selectedIds: number[];
  openId:      number | null;
}

function loadDash(): Partial<Persisted> {
  if (typeof window === 'undefined') return {};
  try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : {}; }
  catch { return {}; }
}

function saveDash(d: Persisted) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {}
}

type Action =
  | { type:'SET_LOCATION'; payload:string }
  | { type:'SET_FILTER';   payload:Partial<FilterState> }
  | { type:'SET_SORT';     payload:SortableColumn }
  | { type:'RESET_FILTERS' }
  | { type:'RESTORE';      payload:Partial<FilterState>&{location?:string} };

interface State { location:string; filters:FilterState; }

function reducer(s: State, a: Action): State {
  switch(a.type) {
    case 'SET_LOCATION': return {...s, location:a.payload, filters:{...s.filters,page:1}};
    case 'SET_FILTER':   return {...s, filters:{...s.filters,...a.payload,page:1}};
    case 'SET_SORT': {
      const col=a.payload, dir=s.filters.sortCol===col&&s.filters.sortDir==='asc'?'desc':'asc';
      return {...s, filters:{...s.filters,sortCol:col,sortDir:dir}};
    }
    case 'RESET_FILTERS': return {...s, filters:defaultFilters()};
    case 'RESTORE': {
      const {location,...rest} = a.payload;
      return { location: location ?? s.location, filters:{...s.filters,...rest} };
    }
    default: return s;
  }
}

export function useDashboard(allBarriers: Barrier[], defaultLocation = 'ALL') {
  // Always start with consistent defaults for SSR — restore after mount
  const [state, dispatch] = useReducer(reducer, {
    location: 'ALL', filters: defaultFilters(),
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId,      setOpenId]      = useState<number | null>(null);
  const [hydrated,    setHydrated]    = useState(false);

  // After mount: restore persisted state
  useEffect(() => {
    const p = loadDash();
    dispatch({
      type: 'RESTORE',
      payload: {
        location:        p.location ?? defaultLocation,
        ...(p.filters ?? {}),
      },
    });
    if (p.selectedIds?.length) setSelectedIds(new Set(p.selectedIds));
    if (p.openId)              setOpenId(p.openId);
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    saveDash({ location:state.location, filters:state.filters, selectedIds:[...selectedIds], openId });
  }, [state, selectedIds, openId, hydrated]);

  const locationBarriers = useMemo(
    () => state.location==='ALL' ? allBarriers : allBarriers.filter(b=>b.instalacao===state.location),
    [allBarriers, state.location]
  );

  const kpi       = useMemo(() => computeKpi(locationBarriers),      [locationBarriers]);
  const chartData = useMemo(() => computeChartData(locationBarriers), [locationBarriers]);
  const filtered  = useMemo(() => applyFilters(locationBarriers, state.filters),  [locationBarriers, state.filters]);
  const sorted    = useMemo(() => applySorting(filtered, state.filters),          [filtered, state.filters]);
  const rows      = useMemo(() => paginate(sorted, state.filters.page, state.filters.pageSize), [sorted, state.filters]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.filters.pageSize));

  const openBarrier   = useMemo(() => openId ? allBarriers.find(b=>b.id===openId)??null : null, [openId, allBarriers]);
  const locationDetails = LOCATIONS.find(l=>l.code===state.location);

  const setLocation  = useCallback((code:string) => { dispatch({type:'SET_LOCATION',payload:code}); setSelectedIds(new Set()); }, []);
  const setFilter    = useCallback((patch:Partial<FilterState>) => dispatch({type:'SET_FILTER',payload:patch}), []);
  const setSort      = useCallback((col:SortableColumn) => dispatch({type:'SET_SORT',payload:col}), []);
  const resetFilters = useCallback(() => { dispatch({type:'RESET_FILTERS'}); setSelectedIds(new Set()); }, []);

  /** Show NC barriers sorted oldest-first (most urgent) */
  const showUrgentes = useCallback(() => {
    dispatch({ type:'SET_FILTER', payload:{
      disponibilidade: '',
      conformidade:    'Não Conforme',
      sortCol:         'statusSince' as SortableColumn,
      sortDir:         'asc',
      page:            1,
    }});
  }, []);

  const toggleSelect = useCallback((id:number) => {
    setSelectedIds(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  }, []);
  const selectAll  = useCallback(() => setSelectedIds(new Set(sorted.map(b=>b.id))), [sorted]);
  const clearAll   = useCallback(() => setSelectedIds(new Set()), []);

  const hasActiveFilters = !!state.filters.query||!!state.filters.disponibilidade||!!state.filters.conformidade||!!state.filters.categoria;

  return {
    location:state.location, locationDetails, filters:state.filters,
    kpi, chartData, rows, allFiltered:sorted,
    filteredTotal:sorted.length, totalPages, hasActiveFilters, hydrated,
    selectedIds, openBarrier, setOpenId,
    setLocation, setFilter, setSort, resetFilters, showUrgentes,
    toggleSelect, selectAll, clearAll,
  };
}
