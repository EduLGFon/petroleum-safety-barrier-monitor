// RecipientsManager - alert email audience with active toggles.
// This is why it exists: the digest audience lives in alert_recipients;
// this manager wraps its CRUD with PT labels and premium rows.
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

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useEffect, useState } from "preact/hooks";

interface Recipient {
  id: number;
  email: string;
  name: string;
  phone: string;
  active: boolean;
}

interface UserOption {
  id: number;
  email: string;
  name: string;
  phone: string;
}

// RecipientsManager: recipient CRUD; two-click inline confirm on remove.
export function RecipientsManager(
  { onCount }: { onCount?: (n: number) => void },
) {
  const [items, setItems] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function refresh() {
    try {
      setError("");
      setLoading(true);
      const list = await adminApi("/api/recipients") as Recipient[];
      setItems(list);
      onCount?.(list.filter((r) => r.active).length);
      try {
        const userList = await adminApi("/api/users") as UserOption[];
        setUsers(userList);
      } catch {
        // ignore user list errors; manual entry still works
      }
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
      await adminApi("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, phone }),
      });
      setEmail("");
      setName("");
      setPhone("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: Recipient) {
    try {
      await adminApi(`/api/recipients/${item.id}`, {
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
    if (confirmId !== item.id) {
      setConfirmId(item.id);
      return;
    }
    setConfirmId(null);
    try {
      await adminApi(`/api/recipients/${item.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function assignUser() {
    const u = users.find((x) => String(x.id) === selectedUserId);
    if (!u) return;
    setAssignBusy(true);
    try {
      await adminApi("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, name: u.name, phone: u.phone }),
      });
      setSelectedUserId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssignBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Destinatários"
        hint="Quem recebe os alertas. E-mail sempre; mensagem só em barreira sem contingência."
        count={`${items.filter((r) => r.active).length} ativos`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <AdminCard>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <Field label="Selecionar usuário">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.currentTarget.value)}
              style={inputSt}
            >
              <option value="">Escolha um usuário…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ? `${u.name} — ${u.email}` : u.email}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "end", flex: "1 1 100%" }}>
            <button
              type="button"
              disabled={assignBusy || !selectedUserId}
              className="lift"
              onClick={() => void assignUser()}
              style={{
                ...primaryBtn,
                opacity: (assignBusy || !selectedUserId) ? 0.7 : 1,
                width: "100%",
              }}
            >
              {assignBusy ? "Atribuindo…" : "Atribuir à lista"}
            </button>
          </div>
        </div>
      </AdminCard>
      <AdminCard>
        <form
          onSubmit={create}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <Field label="E-mail">
            <input
              type="email"
              required
              placeholder="alerta@operadora.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Nome">
            <input
              type="text"
              placeholder="Nome (opcional)"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <Field label="Telefone (só crítico)">
            <input
              type="tel"
              placeholder="DDD + número (opcional)"
              value={phone}
              onInput={(e) => setPhone(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "end", flex: "1 1 100%" }}>
            <button
              type="submit"
              disabled={busy}
              className="lift"
              style={{ ...primaryBtn, opacity: busy ? 0.7 : 1, width: "100%" }}
            >
              {busy ? "Adicionando…" : "Adicionar destinatário"}
            </button>
          </div>
        </form>
      </AdminCard>
      {loading
        ? <SkeletonRows />
        : items.length === 0
        ? (
          <EmptyState text="Nenhum destinatário. Adicione quem recebe os alertas." />
        )
        : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((r) => (
              <AdminRow key={r.id}>
                <Avatar name={r.name || r.email} />
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
                    {r.email}
                  </div>
                  {r.name && (
                    <div
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.name}
                      {r.phone ? ` · ${r.phone}` : ""}
                    </div>
                  )}
                  {!r.name && r.phone && (
                    <div
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.phone}
                    </div>
                  )}
                </span>
                <StatusBadge tone={r.active ? "active" : "inactive"}>
                  {r.active ? "Ativo" : "Inativo"}
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
