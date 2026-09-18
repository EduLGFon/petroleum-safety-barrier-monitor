// RecipientsTab - who receives alert emails, managed by admins.
// This is why it exists: the digest audience lives in alert_recipients;
// this tab wraps its CRUD with PT labels and active toggles.
import { api } from "./api.ts";
import { useEffect, useState } from "preact/hooks";

interface Recipient {
  id: number;
  email: string;
  name: string;
  active: boolean;
}

// RecipientsTab: alert recipient CRUD with active toggles; surfaces fetch errors inline.
export function RecipientsTab() {
  const [items, setItems] = useState<Recipient[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  async function refresh() {
    try {
      setError("");
      setItems(await api("/api/recipients") as Recipient[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    try {
      await api("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      setEmail("");
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggle(item: Recipient) {
    try {
      await api(`/api/recipients/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(item: Recipient) {
    if (!globalThis.confirm(`Remover ${item.email}?`)) return;
    try {
      await api(`/api/recipients/${item.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <div role="alert">{error}</div>}
      <form
        onSubmit={create}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onInput={(e) => setEmail(e.currentTarget.value)}
        />
        <input
          type="text"
          placeholder="Nome"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <button type="submit">Adicionar destinatário</button>
      </form>
      <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
        {items.map((r) => (
          <li
            key={r.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <strong>{r.email}</strong>
            <span>{r.name}</span>
            <span>{r.active ? "Ativo" : "Inativo"}</span>
            <button type="button" onClick={() => void toggle(r)}>
              {r.active ? "Desativar" : "Ativar"}
            </button>
            <button type="button" onClick={() => void remove(r)}>
              Remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
