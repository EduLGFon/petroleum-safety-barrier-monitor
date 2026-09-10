// Filter state - location/filters/sort reducer with validated restore.
// This is why it exists: client and server dashboard modes share the same
// filter semantics; only the data source differs. Data-agnostic on purpose.
import { useCallback, useEffect, useReducer, useState } from "preact/hooks";
import type { FilterState, SortableColumn } from "../../lib/types.ts";
import { defaultFilters, sanitizeFilters } from "../../lib/utils.ts";
import { loadDash } from "./persistence.ts";
import { reducer } from "./reducer.ts";

// Filter/sort/location state; restores validated persisted filters once.
// Selection clearing on navigation stays with the caller (it owns selection).
export function useFilterState(defaultLocation = "ALL") {
  // Always start with consistent defaults for SSR — restore after mount
  const [state, dispatch] = useReducer(reducer, {
    location: "ALL",
    filters: defaultFilters(),
  });
  const [hydrated, setHydrated] = useState(false);

  // After mount: restore validated persisted filters (corrupt values fall
  // back to defaults instead of wedging filters or page).
  useEffect(() => {
    const p = loadDash();
    const location = typeof p.location === "string" && p.location.trim() !== ""
      ? p.location
      : defaultLocation;
    const filters = sanitizeFilters(p.filters ?? {});
    dispatch({ type: "RESTORE", payload: { location, ...filters } });
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sets location (page resets to 1 via reducer); persisted by composer effect.
  const setLocation = useCallback((code: string) => {
    dispatch({ type: "SET_LOCATION", payload: code });
  }, []);
  // Patches filters (resets page unless page-only); persisted by composer effect.
  const setFilter = useCallback(
    (patch: Partial<FilterState>) =>
      dispatch({ type: "SET_FILTER", payload: patch }),
    [],
  );
  // Toggles sort direction for column; persisted by composer effect.
  const setSort = useCallback(
    (col: SortableColumn) => dispatch({ type: "SET_SORT", payload: col }),
    [],
  );
  // Resets filters to defaults; persisted by composer effect.
  const resetFilters = useCallback(() => {
    dispatch({ type: "RESET_FILTERS" });
  }, []);

  /** Show NC barriers sorted oldest-first (most urgent) */
  const showUrgentes = useCallback(() => {
    dispatch({
      type: "SET_FILTER",
      payload: {
        disponibilidade: "",
        conformidade: "Não Conforme",
        sortCol: "statusSince" as SortableColumn,
        sortDir: "asc",
        page: 1,
      },
    });
  }, []);

  const hasActiveFilters = !!state.filters.query ||
    !!state.filters.disponibilidade || !!state.filters.conformidade ||
    !!state.filters.categoria;

  return {
    location: state.location,
    filters: state.filters,
    hydrated,
    hasActiveFilters,
    setLocation,
    setFilter,
    setSort,
    resetFilters,
    showUrgentes,
  };
}
