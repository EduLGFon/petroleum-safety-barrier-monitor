// AdminToast - transient success notice for admin managers.
// This is why it exists: create/edit/reset confirmations used to render as an
// inline banner that pushed the workspace down and stayed forever. The toast
// announces politely, closes manually, and removes itself after a short hold.
// Built with createElement because the linkedom test harness cannot mount
// Fresh-precompiled JSX template vnodes (see scripts/test-dom.ts).
import { useEffect, useRef } from "preact/hooks";

import { createPortal } from "preact/compat";

import { createElement as h } from "preact";

export interface AdminToastProps {
  message: string;
  onClose: () => void;
  durationMs?: number;
}

export function AdminToast(
  { message, onClose, durationMs = 4000 }: AdminToastProps,
) {
  // Keep the latest callback without restarting the timer on every parent
  // render; only a new message or duration resets the countdown.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, message]);

  const toast = h(
    "div",
    {
      className: "admin-toast",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      style: { animationDuration: `${durationMs}ms` },
    },
    h("span", { className: "admin-toast-message" }, message),
    h(
      "button",
      {
        type: "button",
        className: "admin-toast-close",
        "aria-label": "Fechar aviso",
        onClick: onClose,
      },
      "Fechar",
    ),
  );

  // The settings dialog sets contain: layout paint, so a fixed descendant
  // would be trapped and clipped inside it. Portal to body so the toast sits
  // above the whole workspace (z-index 1100) instead.
  return typeof document === "undefined"
    ? toast
    : createPortal(toast, document.body);
}
