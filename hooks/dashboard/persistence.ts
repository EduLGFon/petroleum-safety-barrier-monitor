// persistence.ts — dashboard localStorage slice; split out so reducer/state stay pure and SSR-safe.
import type { FilterState } from "../../lib/types.ts";

export const STORE_KEY = "barrier-dashboard";

export interface Persisted {
  location: string;
  filters: FilterState;
  selectedIds: number[];
  openId: number | null;
}

// Loads persisted dashboard slice from `barrier-dashboard` key; SSR-safe, returns {} on miss/error.
export function loadDash(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

// Persists dashboard slice to `barrier-dashboard` key; no-op on storage failure, state stays in memory.
export function saveDash(d: Persisted) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    // Storage may be unavailable - dashboard still works in memory.
  }
}
