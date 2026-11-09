// TempPasswordDialog - one-time password reveal after an admin reset.
// This is why it exists: a reset password must be shown exactly once with
// copy and ack, and never persisted outside component state.
import { type AvisoEntrega, mensagemAviso } from "./user-notice.ts";

import { AdminFormDialog } from "./AdminFormDialog.tsx";

import { useEffect, useState } from "preact/hooks";

import { ghostBtn } from "./AdminPrimitives.tsx";

export interface TempPasswordDialogProps {
  open: boolean;
  email: string;
  senha: string;
  aviso?: AvisoEntrega | null;
  onClose: () => void;
}

export function TempPasswordDialog(
  { open, email, senha, aviso, onClose }: TempPasswordDialogProps,
) {
  const [copiaMsg, setCopiaMsg] = useState("");

  // Clear copy feedback for each new password.
  useEffect(() => {
    if (!open) return;
    setCopiaMsg("");
  }, [open, email, senha]);

  // Copy the one-time password; it never leaves component state.
  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiaMsg("Senha copiada.");
    } catch {
      setCopiaMsg("Não foi possível copiar. Selecione e copie.");
    }
  }

  return (
    <AdminFormDialog
      open={open}
      title={`Senha temporária de ${email}`}
      subtitle="Anote e entregue à pessoa agora: esta senha não é guardada e não aparece de novo."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => void copiar()}
            style={ghostBtn}
          >
            Copiar
          </button>
          <button
            type="button"
            onClick={onClose}
            style={ghostBtn}
          >
            Já anotei
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 8 }}>
        <code
          style={{ fontSize: 18, letterSpacing: 1, userSelect: "all" }}
        >
          {senha}
        </code>
        {copiaMsg && (
          <span role="status" style={{ opacity: 0.8 }}>{copiaMsg}</span>
        )}
        <span style={{ opacity: 0.8 }}>
          No primeiro acesso ela é obrigada a trocar.
        </span>
        {mensagemAviso(aviso) && (
          <span style={{ opacity: 0.8 }}>
            {mensagemAviso(aviso)}
            {aviso && !aviso.sent ? " Entregue a senha por outro canal." : ""}
          </span>
        )}
      </div>
    </AdminFormDialog>
  );
}
