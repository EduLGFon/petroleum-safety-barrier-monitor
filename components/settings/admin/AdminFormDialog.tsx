// AdminFormDialog - shared create/edit dialog shell for the admin forms.
// Why it exists: user, group, recipient, and rule forms need the same
// portalled shell (sticky header, scrollable body, optional footer) with
// focus trapping, body lock, Escape handling, and focus restoration. The
// concrete forms stay in their manager modules.
// Built with createElement because the linkedom test harness cannot mount
// Fresh-precompiled JSX template vnodes (see scripts/test-dom.ts); the close
// guards below are exactly what those regression tests cover.
// Close semantics (see DECISIONS.md#D30): `locked` means a one-time secret
// is pending and only the caller's acknowledgement may close the dialog;
// `busy` means a write is in flight and closing would discard its result;
// `dirty` means unsaved edits exist and the guest must confirm discarding.
import { useEffect, useId, useRef, useState } from "preact/hooks";

import { useFocusTrap } from "../../../hooks/useFocusTrap.ts";

import { lockBody } from "../../../lib/body-lock.ts";

import type { ComponentChildren } from "preact";

import { CloseIcon } from "../../ui/Icons.tsx";

import { createPortal } from "preact/compat";

import { createElement as h } from "preact";

// DISCARD_CONFIRM_MSG: pt-BR prompt asked before throwing away edits.
export const DISCARD_CONFIRM_MSG = "Descartar as alterações? Nada será salvo.";

export interface CloseGuardState {
  locked?: boolean;
  busy?: boolean;
  dirty?: boolean;
}

// requestClose: single close path shared by the shell (backdrop, Escape, X)
// and every form footer. Locked or busy dialogs never close on a dismissal:
// an acknowledgement button in the footer is the only way out (D30). Dirty
// forms ask first so a stray click does not silently throw away the draft.
export function requestClose(
  state: CloseGuardState,
  onClose: () => void,
): void {
  if (state.locked || state.busy) return;
  if (state.dirty && !confirm(DISCARD_CONFIRM_MSG)) return;
  onClose();
}

export interface AdminFormDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: ComponentChildren;
  onClose: () => void;
  // Optional because createElement callers pass it as a trailing argument;
  // every real usage provides body content.
  children?: ComponentChildren;
  footer?: ComponentChildren;
  error?: string;
  width?: number;
  // PRIVACY (D30): a one-time password is pending; backdrop/Escape/X are
  // ignored until the footer acknowledgement calls onClose itself.
  locked?: boolean;
  // A write is in flight; dismissing would discard its result (and, for
  // create/reset, the returned password).
  busy?: boolean;
  // Unsaved edits: closing first needs the discard confirmation.
  dirty?: boolean;
}

// AdminFormDialog: centered form dialog above the settings workspace (1250)
// and below SearchMultiSelect's portalled menu (1300).
export function AdminFormDialog(
  {
    open,
    title,
    subtitle,
    eyebrow,
    icon,
    onClose,
    children,
    footer,
    error,
    width = 720,
    locked = false,
    busy = false,
    dirty = false,
  }: AdminFormDialogProps,
) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // SearchMultiSelect portals its menu above this dialog. While that menu is
  // open, disable this trap so Tab is not pulled out of the search field.
  const [menuOpen, setMenuOpen] = useState(false);
  const uid = useId();
  const titleId = `admin-form-title-${uid}`;
  const descId = `admin-form-desc-${uid}`;

  // Lock scroll while open and return focus to the opener on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const release = lockBody();
    const raf = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      release();
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  // Follow any portalled multi-select menu opened from inside this form.
  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const next = !!document.querySelector("[data-search-multi-panel]");
      setMenuOpen((current) => current === next ? current : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [open]);

  useFocusTrap(dialogRef, open && !menuOpen);

  if (!open || typeof document === "undefined") return null;
  const safeWidth = Math.max(320, width);
  const safeSubtitle = subtitle?.trim();
  const safeError = error?.trim();
  const guard = { locked, busy, dirty };

  return createPortal(
    h(
      "div",
      {
        role: "presentation",
        onMouseDown: (event: MouseEvent) => {
          if (event.target === event.currentTarget) {
            requestClose(guard, onClose);
          }
        },
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 1250,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(8px,2vw,16px)",
          background: "rgba(2,6,23,.6)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
          contain: "strict",
        },
      },
      h(
        "div",
        {
          ref: dialogRef,
          "data-admin-form-dialog": "true",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": titleId,
          "aria-describedby": safeSubtitle ? descId : undefined,
          tabIndex: -1,
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            requestClose(guard, onClose);
          },
          style: {
            width: `min(${safeWidth}px, 96vw)`,
            maxWidth: "100%",
            maxHeight: "90dvh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            outline: "none",
            background: "var(--au-dialog)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            boxShadow: "0 24px 70px rgba(0,0,0,.5)",
            animation: "scaleIn .24s var(--ease-out) both",
          },
        },
        h(
          "header",
          {
            style: {
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
              background:
                "color-mix(in srgb,var(--bg-elevated) 62%,transparent)",
            },
          },
          icon
            ? h(
              "span",
              {
                "aria-hidden": "true",
                style: {
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "color-mix(in srgb,var(--accent) 14%,transparent)",
                  color: "var(--accent)",
                },
              },
              icon,
            )
            : null,
          h(
            "div",
            { style: { minWidth: 0, flex: 1 } },
            eyebrow
              ? h(
                "div",
                {
                  style: {
                    fontSize: "var(--d-caption)",
                    fontWeight: 800,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: "var(--accent)",
                    marginBottom: 3,
                  },
                },
                eyebrow,
              )
              : null,
            h(
              "h2",
              {
                id: titleId,
                style: {
                  margin: 0,
                  fontSize: "var(--d-dialog-title)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                },
              },
              title,
            ),
            safeSubtitle
              ? h(
                "p",
                {
                  id: descId,
                  style: {
                    margin: "4px 0 0",
                    fontSize: "var(--d-small)",
                    lineHeight: 1.5,
                    color: "var(--text-muted)",
                  },
                },
                safeSubtitle,
              )
              : null,
          ),
          // SECURITY (D30): the X button is disabled while a secret is
          // pending or a write is in flight; requestClose also refuses.
          h(
            "button",
            {
              type: "button",
              onClick: () => requestClose(guard, onClose),
              disabled: locked || busy,
              "aria-label": "Fechar",
              className: "lift",
              style: {
                width: "var(--d-close-btn)",
                height: "var(--d-close-btn)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--d-input-radius)",
                cursor: locked || busy ? "not-allowed" : "pointer",
                opacity: locked || busy ? 0.45 : 1,
              },
            },
            h(CloseIcon, {
              size: 14,
              color: "var(--text-muted)",
              strokeWidth: 2.5,
            }),
          ),
        ),
        h(
          "div",
          {
            style: {
              flex: "1 1 auto",
              minHeight: 0,
              overflowX: "hidden",
              overflowY: "auto",
              padding: "18px 20px",
              display: "grid",
              gap: "var(--d-panel-gap)",
              alignContent: "start",
            },
          },
          safeError
            ? h(
              "div",
              {
                role: "alert",
                className: "animate-fade-in",
                style: {
                  background: "var(--au-danger-bg)",
                  border: "1px solid var(--alert-nc-border)",
                  color: "var(--au-danger-fg)",
                  borderRadius: "var(--d-row-radius)",
                  padding: "10px 12px",
                  fontSize: "var(--d-small)",
                  lineHeight: 1.5,
                },
              },
              safeError,
            )
            : null,
          children,
        ),
        footer
          ? h(
            "footer",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
                flexWrap: "wrap",
                padding: "12px 20px",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
                background:
                  "color-mix(in srgb,var(--bg-elevated) 52%,transparent)",
              },
            },
            footer,
          )
          : null,
      ),
    ),
    document.body,
  );
}
