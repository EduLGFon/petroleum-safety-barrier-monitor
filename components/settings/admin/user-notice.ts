// user-notice - shared delivery-notice helper for the admin Users page.
// This is why it exists: the create dialog, the reset dialog, and the
// manager all report the same MSGFLOW delivery outcome next to a one-time
// password without ever rendering the raw provider body.
export interface AvisoEntrega {
  sent: boolean;
  reason?: string;
}

export function mensagemAviso(
  aviso: AvisoEntrega | null | undefined,
): string | null {
  if (!aviso) return null;
  if (aviso.sent) return "aviso enviado por MSGFLOW.";
  const motivo = aviso.reason ? `: ${aviso.reason}` : ".";
  return `aviso não enviado${motivo}`;
}
