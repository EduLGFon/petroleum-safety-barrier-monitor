// Export selection - the id list an export request carries.
// Why it exists: the dashboard sends the selected rows as ids, and that
// list is untrusted input. Parsing it in one place keeps the rule the same
// everywhere: only positive safe integers count, duplicates collapse, and
// a selection larger than the row ceiling is *reported*, never cut. A cut
// selection would export a subset while the file claimed to cover the
// whole selection, which is silent data loss.
import { EXPORT_MAX_ROWS } from "./limits.ts";

export interface SelectionIds {
  // The selection, when the request carries one. Undefined means "the whole
  // filtered scope" (no body, or a body with no usable id).
  ids?: number[];
  // The real number of selected ids when the selection is over the ceiling.
  // The caller refuses the request with this count instead of exporting a
  // truncated selection.
  overCeiling?: number;
}

// parseSelectionIds: the id selection from a request body. A non-array body
// (or one without a single usable id) means the whole filtered scope, so a
// malformed body can never widen or narrow the export silently.
export function parseSelectionIds(raw: unknown): SelectionIds {
  if (!Array.isArray(raw)) return {};
  const ids = [
    ...new Set(
      raw.filter((n): n is number =>
        typeof n === "number" && Number.isSafeInteger(n) && n > 0
      ),
    ),
  ];
  if (ids.length === 0) return {};
  if (ids.length > EXPORT_MAX_ROWS) return { overCeiling: ids.length };
  return { ids };
}
