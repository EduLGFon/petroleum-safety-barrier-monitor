// RulesManager - per-category alert triggers with premium rows.
// This is why it exists: admins enable or mute alerts by category and tune
// the trigger without code changes; this manager wraps /api/alert-rules.
import { adminApi } from "../../../lib/api/admin-client.ts";
import { useEffect, useState } from "preact/hooks";
import {
  AdminCard,
  AdminHero,
  AdminRow,
  Avatar,
  dangerBtn,
  EmptyState,
  ErrorBanner,
  Field,
  ghostBtn,
  inputSt,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";

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

// RulesManager: alert rule CRUD; two-click inline confirm on remove.
export function RulesManager({ onCount }: { onCount?: (n: number) => void }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [toStatusId, setToStatusId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function refresh() {
    try {
      setError("");
      setLoading(true);
      const [r, l] = await Promise.all([
        adminApi("/api/alert-rules") as Promise<AlertRule[]>,
        adminApi("/api/lookups") as Promise<Lookups>,
      ]);
      setRules(r);
      setLookups(l);
      onCount?.(r.filter((x) => x.active).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Refresh once per mount; the count reporter is stable for the session.
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi("/api/alert-rules", {
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
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: AlertRule) {
    try {
      await adminApi(`/api/alert-rules/${rule.id}`, {
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
    if (confirmId !== rule.id) {
      setConfirmId(rule.id);
      return;
    }
    setConfirmId(null);
    try {
      await adminApi(`/api/alert-rules/${rule.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Regras de alerta"
        hint="Sem regras, todo estado não conforme alerta. Com regras, só categorias cobertas por uma regra ativa alertam."
        count={`${rules.filter((r) => r.active).length} ativas`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <AdminCard>
        <form
          onSubmit={create}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <Field label="Nome da regra">
            <input
              type="text"
              required
              placeholder="Ex.: Críticas indisponíveis"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Categoria">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.currentTarget.value)}
              style={inputSt}
            >
              <option value="">Todas as categorias</option>
              {(lookups?.categories ?? []).map((c) => (
                <option key={c.id} value={String(c.id)}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Dispara em">
            <select
              value={toStatusId}
              onChange={(e) => setToStatusId(e.currentTarget.value)}
              style={inputSt}
            >
              <option value="">Qualquer não conforme</option>
              {(lookups?.availabilities ?? []).map((s) => (
                <option key={s.id} value={String(s.id)}>{s.label}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "end", flex: "1 1 100%" }}>
            <button
              type="submit"
              disabled={busy}
              className="lift"
              style={{ ...primaryBtn, opacity: busy ? 0.7 : 1, width: "100%" }}
            >
              {busy ? "Criando…" : "Criar regra"}
            </button>
          </div>
        </form>
      </AdminCard>
      {loading
        ? <SkeletonRows />
        : rules.length === 0
        ? (
          <EmptyState text="Nenhuma regra. Todo estado não conforme alerta até você criar uma." />
        )
        : (
          <div style={{ display: "grid", gap: 8 }}>
            {rules.map((r) => (
              <AdminRow key={r.id}>
                <Avatar name={r.name} />
                <span style={{ minWidth: 0, flex: "1 1 160px" }}>
                  <div
                    style={{
                      fontSize: "var(--d-body)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.name}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--d-small)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {r.critical_only ? "Só críticas" : "Todas"} ·{" "}
                    {r.stale_days != null
                      ? `${r.stale_days}d sem contingência`
                      : "Sem limite de tempo"}
                  </div>
                </span>
                <StatusBadge tone={r.active ? "active" : "inactive"}>
                  {r.active ? "Ativa" : "Inativa"}
                </StatusBadge>
                <StatusBadge tone="neutral">
                  {r.notify_immediate ? "Imediato" : "Digest"}
                </StatusBadge>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void toggle(r)}
                    style={ghostBtn}
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r)}
                    style={dangerBtn}
                  >
                    {confirmId === r.id ? "Confirmar remoção?" : "Remover"}
                  </button>
                </span>
              </AdminRow>
            ))}
          </div>
        )}
    </div>
  );
}
