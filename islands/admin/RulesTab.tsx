// RulesTab - which events trigger email, per category.
// This is why it exists: admins enable or mute alerts by category and tune
// the trigger (landing status, critical-only, recovery, stale days,
// immediate vs digest) without code changes.
import { api } from "./api.ts";
import { useEffect, useState } from "preact/hooks";

interface AlertRule {
  id: number;
  name: string;
  category_id: number | null;
  to_status_id: number | null;
  critical_only: boolean;
  include_recovery: boolean;
  stale_days: number | null;
  notify_immediate: boolean;
  active: boolean;
}

interface Lookups {
  availabilities: { id: number; label: string }[];
  categories: { id: number; label: string }[];
}

// RulesTab: per-category alert rule CRUD; surfaces fetch errors inline.
export function RulesTab() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [toStatusId, setToStatusId] = useState("");

  async function refresh() {
    try {
      setError("");
      const [r, l] = await Promise.all([
        api("/api/alert-rules") as Promise<AlertRule[]>,
        api("/api/lookups") as Promise<Lookups>,
      ]);
      setRules(r);
      setLookups(l);
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
      await api("/api/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId: categoryId === "" ? null : Number(categoryId),
          toStatusId: toStatusId === "" ? null : Number(toStatusId),
        }),
      });
      setName("");
      setCategoryId("");
      setToStatusId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggle(rule: AlertRule) {
    try {
      await api(`/api/alert-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(rule: AlertRule) {
    if (!globalThis.confirm(`Remover regra ${rule.name}?`)) return;
    try {
      await api(`/api/alert-rules/${rule.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <div role="alert">{error}</div>}
      <p style={{ margin: 0 }}>
        Sem regras, todo estado não conforme alerta. Com regras, só categorias
        cobertas por uma regra ativa alertam.
      </p>
      <form
        onSubmit={create}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          type="text"
          required
          placeholder="Nome da regra"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.currentTarget.value)}
        >
          <option value="">Todas as categorias</option>
          {(lookups?.categories ?? []).map((c) => (
            <option key={c.id} value={String(c.id)}>{c.label}</option>
          ))}
        </select>
        <select
          value={toStatusId}
          onChange={(e) => setToStatusId(e.currentTarget.value)}
        >
          <option value="">Qualquer não conforme</option>
          {(lookups?.availabilities ?? []).map((s) => (
            <option key={s.id} value={String(s.id)}>{s.label}</option>
          ))}
        </select>
        <button type="submit">Criar regra</button>
      </form>
      <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
        {rules.map((r) => (
          <li
            key={r.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <strong>{r.name}</strong>
            <span>{r.active ? "Ativa" : "Inativa"}</span>
            <span>{r.notify_immediate ? "Imediato" : "Digest"}</span>
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
