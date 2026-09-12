// GotoInput - jump-to-page chip with commit/cancel semantics.
// Why: isolates the draft/Escape/blur interplay so Pagination keeps only
// layout (range label, page-size select, nav buttons). Renders as a bare
// numeric chip so it can sit in the pager where the page-gap ellipsis is.
import { useRef, useState } from "preact/hooks";

interface GotoInputProps {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}

// GotoInput: commits clamped page on blur/Enter, reverts on Escape.
export function GotoInput({ page, totalPages, onChange }: GotoInputProps) {
  // Draft for the go-to-page field: null means "follow the current page".
  const [draft, setDraft] = useState<string | null>(null);
  // Escape sets this so the blur it triggers reverts instead of committing
  // (the blur handler still sees the pre-Escape draft - render is async).
  const cancelRef = useRef(false);
  const commitDraft = () => {
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    if (cancelled || draft === null) return;
    const parsed = parseInt(draft, 10);
    // NaN (empty/garbage) keeps the page; out-of-range clamps to 1..total.
    const n = Math.min(
      Math.max(Number.isNaN(parsed) ? page : parsed, 1),
      totalPages,
    );
    setDraft(null);
    if (n !== page) onChange(n);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellcheck={false}
      aria-label="Ir para a página"
      title={`Ir para a página (1–${totalPages})`}
      placeholder={String(page)}
      value={draft ?? ""}
      // NOTE: onInput, not onChange. Preact 10 binds onChange to the
      // native `change` event, which text fields only fire on blur -
      // with onChange the draft would lag one Enter behind.
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          // Commit directly (not via blur) so keyboard users jump
          // immediately even if focus moves elsewhere first.
          commitDraft();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          cancelRef.current = true;
          setDraft(null);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="goto-input"
      style={{
        // Fits the widest page number with room to type.
        width: `calc(${String(totalPages).length + 1}ch + 14px)`,
        minWidth: "var(--d-page-btn)",
      }}
    />
  );
}
