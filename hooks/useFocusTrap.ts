// useFocusTrap - shared Tab focus trap for modal dialogs.
// Why it exists: keeps the same keyboard handling in one place instead of
// copy-pasting querySelectorAll logic across every modal.
import { useEffect } from "preact/hooks";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// useFocusTrap: traps Tab/Shift+Tab inside root while open.
export function useFocusTrap(
  root: { current: HTMLElement | null },
  open: boolean,
): void {
  useEffect(() => {
    if (!open) return;
    const node = root.current;
    // If focus landed outside the dialog (e.g. no autofocus on open),
    // move it to the first focusable so keyboard users start inside.
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const el = root.current;
      if (!el) return;
      const focusables = el.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Focus escaped the dialog (programmatic blur, portal timing):
      // pull it back instead of letting Tab leave the modal.
      if (!el.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, root]);
}
