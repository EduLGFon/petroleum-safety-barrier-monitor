// Dashboard selection - selected row ids plus open detail id.
// This is why it exists: client and server dashboard modes share selection
// semantics; select-all over filtered rows stays with the caller (it owns data).
import { useCallback, useState } from "preact/hooks";

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
