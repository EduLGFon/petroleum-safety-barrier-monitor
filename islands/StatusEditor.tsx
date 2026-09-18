// StatusEditor - admin-only barrier status assignment.
// This is why it exists: changing availability is the sanctioned write path
// (record_status_change); the author derives from the logged user so the UI
// only asks for the new status and an optional note.
import { useEffect, useState } from "preact/hooks";

interface Props {
  barrierId: number;
  onUpdated?: () => void;
}

interface Lookups {
  availabilities: { id: number; label: string }[];
}

// StatusEditor: admin-only status changer for one barrier; hidden for non-admins/offline.
export function StatusEditor({ barrierId, onUpdated }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [options, setOptions] = useState<{ id: number; label: string }[]>([]);
  const [statusId, setStatusId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" }).then(async (res) => {
      if (!res.ok) return;
      const me = await res.json() as { role: string };
      if (me.role !== "admin") return;
      setIsAdmin(true);
      const lookups = await fetch("/api/lookups", {
        credentials: "same-origin",
      });
      if (lookups.ok) {
        const data = await lookups.json() as Lookups;
        setOptions(data.availabilities);
      }
    }).catch(() => {
      // Non-admin or offline: the editor stays hidden.
    });
  }, []);

  async function submit(e: Event) {
    e.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch(`/api/barriers/${barrierId}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: Number(statusId), note }),
      });
      if (!res.ok) {
        let detail = `Erro ${res.status}`;
        try {
          const data = await res.json() as { error?: string };
          if (data.error) detail = data.error;
        } catch {
          // Keep the status fallback.
        }
        throw new Error(detail);
      }
      setNote("");
      setMessage("Status atualizado.");
      onUpdated?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, marginTop: 12 }}>
      <strong>Alterar status (admin)</strong>
      <select
        required
        value={statusId}
        onChange={(e) =>
          setStatusId(e.currentTarget.value)}
      >
        <option value="">Selecione o status…</option>
        {options.map((o) => (
          <option key={o.id} value={String(o.id)}>{o.label}</option>
        ))}
      </select>
      <textarea
        placeholder="Nota (opcional)"
        value={note}
        onInput={(e) =>
          setNote(e.currentTarget.value)}
        rows={2}
      />
      {message && <div role="status">{message}</div>}
      <button type="submit" disabled={busy || statusId === ""}>
        {busy ? "Salvando…" : "Salvar status"}
      </button>
    </form>
  );
}
