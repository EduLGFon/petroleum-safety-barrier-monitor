// reducer.ts — dashboard location/filters/sort reducer; split out so state transitions stay pure/testable.
import type { FilterState, SortableColumn } from "../../lib/types.ts";
import { defaultFilters } from "../../lib/utils.ts";

export type Action =
  | { type: "SET_LOCATION"; payload: string }
  | { type: "SET_FILTER"; payload: Partial<FilterState> }
  | { type: "SET_SORT"; payload: SortableColumn }
  | { type: "RESET_FILTERS" }
  | { type: "RESTORE"; payload: Partial<FilterState> & { location?: string } };

export interface State {
  location: string;
  filters: FilterState;
}

// Pure reducer for location/filters/sort; resets page to 1 except on page-only navigation.
export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "SET_LOCATION":
      return { ...s, location: a.payload, filters: { ...s.filters, page: 1 } };
    case "SET_FILTER": {
      const keys = Object.keys(a.payload);
      // Only reset to page 1 when a real filter changed (not a page navigation)
      const isPageOnly = keys.length === 1 && keys[0] === "page";
      const newPage = isPageOnly ? (a.payload.page ?? 1) : 1;
      return { ...s, filters: { ...s.filters, ...a.payload, page: newPage } };
    }
    case "SET_SORT": {
      const col = a.payload,
        dir = s.filters.sortCol === col && s.filters.sortDir === "asc"
          ? "desc"
          : "asc";
      return { ...s, filters: { ...s.filters, sortCol: col, sortDir: dir } };
    }
    case "RESET_FILTERS":
      return { ...s, filters: defaultFilters() };
    case "RESTORE": {
      const { location, ...rest } = a.payload;
      return {
        location: location ?? s.location,
        filters: { ...s.filters, ...rest },
      };
    }
    default:
      return s;
  }
}
