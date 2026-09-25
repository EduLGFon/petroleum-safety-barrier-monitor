// Visible columns - ordered table-column visibility with restore.
// This is why it exists: the Colunas menu toggles/reorders columns and both
// dashboard modes share the same state shape, persisted in the
// `barrier-dashboard` slice next to filters.
import {
  COLUMN_DEFS,
  type ColumnKey,
  DEFAULT_VISIBLE_COLS,
  isPinnedKey,
  type PinnedKey,
  resolveVisibleCols,
} from "../../components/table/columns.ts";
import { useCallback, useEffect, useState } from "preact/hooks";
import { loadDash } from "./persistence.ts";

// useVisibleColumns: ordered visible-column state; restores validated
// persisted order once (unknown keys dropped, empty falls back to
// defaults). Toggle refuses to hide the last column; move swaps with the
// neighbour; reset restores the defaults. Persistence itself stays with the
// dashboard composers (they own the saveDash effect).
export function useVisibleColumns() {
  // Always start from defaults for SSR - restore after mount.
  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>([
    ...DEFAULT_VISIBLE_COLS,
  ]);
  // Pinned filter columns (Plano/Período) hidden by the user; empty means
  // all shown. Separate from visibleCols because pinned cells carry no data
  // column and never reorder.
  const [hiddenPinned, setHiddenPinned] = useState<PinnedKey[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // After mount: restore validated persisted order (corrupt values fall
  // back to defaults instead of breaking the header render).
  useEffect(() => {
    const persisted = loadDash();
    setVisibleCols(resolveVisibleCols(persisted.visibleCols));
    const raw = persisted.hiddenPinned;
    setHiddenPinned(
      Array.isArray(raw) ? [...new Set(raw.filter(isPinnedKey))] : [],
    );
    setHydrated(true);
  }, []);

  // Toggles one column; refuses to hide the last visible one so the table
  // can never render zero columns. A re-shown optional inserts at its
  // canonical registry slot without disturbing the user's custom order.
  const toggleCol = useCallback((key: ColumnKey) => {
    setVisibleCols((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== key);
      }
      const rank = new Map(COLUMN_DEFS.map((d, i) => [d.key, i] as const));
      const r = rank.get(key) ?? 0;
      const at = prev.findIndex((k) => (rank.get(k) ?? 0) > r);
      const next = [...prev];
      next.splice(at < 0 ? next.length : at, 0, key);
      return next;
    });
  }, []);

  // Moves one visible column one slot left (-1) or right (+1); edge moves
  // and hidden keys are no-ops.
  const moveCol = useCallback((key: ColumnKey, dir: -1 | 1) => {
    setVisibleCols((prev) => {
      const at = prev.indexOf(key);
      const to = at + dir;
      if (at < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [picked] = next.splice(at, 1);
      if (picked === undefined) return prev;
      next.splice(to, 0, picked);
      return next;
    });
  }, []);

  // Restores the default visible set and re-shows pinned filters.
  const resetCols = useCallback(() => {
    setVisibleCols([...DEFAULT_VISIBLE_COLS]);
    setHiddenPinned([]);
  }, []);

  // Toggles one pinned filter column (Plano/Período).
  const togglePinned = useCallback((key: PinnedKey) => {
    setHiddenPinned((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  return {
    visibleCols,
    hiddenPinned,
    hydratedCols: hydrated,
    toggleCol,
    moveCol,
    resetCols,
    togglePinned,
  };
}
