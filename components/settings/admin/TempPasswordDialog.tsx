// TempPasswordDialog - one-time password reveal after an admin reset.
// This is why it exists: a reset password must be shown exactly once with
// copy and ack, and never persisted outside component state.
// Built with createElement so the linkedom regression tests can mount the
// real shell and prove a pending secret survives a dismissal attempt (D30).
import { type AvisoEntrega, mensagemAviso } from "./user-notice.ts";

import { useEffect, useRef, useState } from "preact/hooks";

import { AdminFormDialog } from "./AdminFormDialog.tsx";

import { ghostBtn } from "./AdminPrimitives.tsx";

import { createElement as h } from "preact";

export interface TempPasswordDialogProps {
  open: boolean;
  email: string;
  senha: string;
  aviso?: AvisoEntrega | null;
  onClose: () => void;
}

// PRIVACY (see DECISIONS.md#D30): the clipboard is a second, uncontrolled
// copy of the one-time password. When the admin used our copy button, wipe
// it once the dialog is acknowledged. Best effort: the API can be missing
// or blocked, and then we must never fail the acknowledgement.
export function clearPasswordClipboard(): void {
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText("").catch(() => {});
  } catch {
    // Clipboard clearing is best effort on browsers without the async API.
  }
}

export function TempPasswordDialog(
  { open, email, senha, aviso, onClose }: TempPasswordDialogProps,
) {
  const [copiaMsg, setCopiaMsg] = useState("");
  const [copying, setCopying] = useState(false);
  // Whether our button put the password in the clipboard during this reveal.
  const copiedRef = useRef(false);
  // Pending copy promise: acking before it settles must still wait for it,
  // otherwise the clipboard clear races ahead of the password write.
  const copyPromiseRef = useRef<Promise<void> | null>(null);
  // Re-entry guard so a second rapid Copy cannot queue another write that
  // would repopulate the clipboard after an ack clear.
  const copyPendingRef = useRef(false);
  // Set before the ack waits; a late-resolving write must not flip copiedRef
  // after the clipboard has already been cleared.
  const copyInvalidatedRef = useRef(false);

  // Clear copy feedback and the copied marker for each new password.
  useEffect(() => {
    if (!open) return;
    setCopiaMsg("");
    copiedRef.current = false;
    copyPromiseRef.current = null;
    copyPendingRef.current = false;
    copyInvalidatedRef.current = false;
    setCopying(false);
  }, [open, email, senha]);

  // Copy the one-time password; it never leaves component state.
  async function copiar() {
    if (copyPendingRef.current) return;
    copyPendingRef.current = true;
    setCopying(true);
    copyInvalidatedRef.current = false;
    const promise = (async () => {
      try {
        await navigator.clipboard.writeText(senha);
        if (copyInvalidatedRef.current) return;
        copiedRef.current = true;
        setCopiaMsg(
          "Senha copiada. Cole no campo de senha da pessoa, não em chat ou e-mail.",
        );
      } catch {
        if (copyInvalidatedRef.current) return;
        setCopiaMsg("Não foi possível copiar. Selecione e copie.");
      }
    })().finally(() => {
      copyPendingRef.current = false;
      setCopying(false);
    });
    copyPromiseRef.current = promise;
    await promise;
  }

  // Acknowledgement is the only close path while the secret is pending.
  async function acknowledge() {
    const pending = copyPromiseRef.current;
    if (pending) {
      try {
        const outcome = await Promise.race([
          pending.then(() => "done", () => "error"),
          new Promise<string>((resolve) =>
            setTimeout(() => resolve("timeout"), 0)
          ),
        ]);
        if (outcome === "timeout") {
          copyInvalidatedRef.current = true;
          clearPasswordClipboard();
        }
      } catch {
        // The copy already reported its own failure; nothing to clear.
      }
    }
    if (copiedRef.current) {
      copiedRef.current = false;
      clearPasswordClipboard();
    }
    onClose();
  }

  return h(
    AdminFormDialog,
    {
      open,
      // SECURITY (D30): locked - backdrop, Escape, and X never close this
      // dialog; the admin must acknowledge with "Já anotei" first, so the
      // one-time password is seen (or copied) before the state is cleared.
      locked: true,
      title: `Senha temporária de ${email}`,
      subtitle:
        "Anote e entregue à pessoa agora: esta senha não é guardada e não aparece de novo.",
      onClose,
      footer: h(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        h(
          "button",
          {
            type: "button",
            disabled: copying,
            onClick: () => void copiar(),
            style: { ...ghostBtn, opacity: copying ? 0.7 : 1 },
          },
          "Copiar",
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => void acknowledge(),
            className: "lift",
            style: ghostBtn,
          },
          "Já anotei",
        ),
      ),
    },
    h(
      "div",
      { style: { display: "grid", gap: 8 } },
      h(
        "code",
        { style: { fontSize: 18, letterSpacing: 1, userSelect: "all" } },
        senha,
      ),
      copiaMsg
        ? h(
          "span",
          { role: "status", style: { opacity: 0.8 } },
          copiaMsg,
        )
        : null,
      h(
        "span",
        { style: { opacity: 0.8 } },
        "No primeiro acesso ela é obrigada a trocar.",
      ),
      mensagemAviso(aviso)
        ? h(
          "span",
          { style: { opacity: 0.8 } },
          mensagemAviso(aviso),
          aviso && !aviso.sent ? " Entregue a senha por outro canal." : "",
        )
        : null,
    ),
  );
}
