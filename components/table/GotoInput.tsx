// GotoInput - jump-to-page ellipsis that becomes a numeric field on focus.
// Why: isolates the draft/Escape/blur interplay so Pagination keeps only
// layout. Idle it mirrors the page-gap ellipsis (same size, "…" placeholder),
// so the pager reads like a normal elided pager on ANY page; focusing it
// widens it into a go-to-page input with commit/cancel-on-Escape semantics.
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
  // Focus turns the ellipsis into the numeric field (and back on blur).
  const [focused, setFocused] = useState(false);
  // Escape sets this so the blur it triggers reverts instead of committing
  // (the blur handler still sees the pre-Escape draft - render is async).
  const cancelRef = useRef(false);
  const commitDraft = () => {
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    setFocused(false);
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
      placeholder={focused ? String(page) : "…"}
      value={draft ?? ""}
      // NOTE: onInput, not onChange. Preact 10 binds onChange to the
      // native `change` event, which text fields only fire on blur -
      // with onChange the draft would lag one Enter behind.
      onFocus={() => setFocused(true)}
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
        // Idle: same width as the ellipsis chip. Focused: fits the widest
        // page number with room to type.
        width: focused
          ? `calc(${String(totalPages).length + 1}ch + 14px)`
          : "var(--d-page-btn)",
        minWidth: "var(--d-page-btn)",
      }}
    />
  );
}
