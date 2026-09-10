// Dashboard selection - selected row ids plus open detail id.
// This is why it exists: client and server dashboard modes share selection
// semantics; select-all over filtered rows stays with the caller (it owns data).
import { useCallback, useState } from "preact/hooks";
import { loadDash } from "./persistence.ts";

// Restores validated selection/openId from a persisted blob; shared by both
// dashboard modes so corrupt ids fall back instead of wedging selection.
export function restoreSelection(
  raw: unknown,
  setSelectedIds: (ids: Set<number>) => void,
  setOpenId: (id: number | null) => void,
): void {
  if (!raw || typeof raw !== "object") return;
  const p = raw as { selectedIds?: unknown; openId?: unknown };
  if (Array.isArray(p.selectedIds)) {
    const ids = p.selectedIds.filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 10000);
    if (ids.length) setSelectedIds(new Set(ids));
  }
  if (Number.isInteger(p.openId) && (p.openId as number) > 0) {
    setOpenId(p.openId as number);
  }
}

// Row selection state; persisted by the composer effect once hydrated.
export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);

  // Toggles single-row selection; persisted via composer effect.
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);
  // Clears all row selection; persisted via composer effect.
  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    setSelectedIds,
    openId,
    setOpenId,
    toggleSelect,
    clearAll,
  };
}
