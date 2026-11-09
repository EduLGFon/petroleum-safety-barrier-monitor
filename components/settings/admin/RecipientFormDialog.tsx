// RecipientFormDialog - create a recipient manually or from users.
// The tabbed flow opens on "Usuários" (one batch request) with "Manual" as
// the fallback. E-mail always sends; the phone is used only for critical
// barriers. Opening the dialog always clears the previous form state.
import { SearchMultiSelect } from "../../settings/SearchMultiSelect.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { AdminFormDialog } from "./AdminFormDialog.tsx";

import { useEffect, useState } from "preact/hooks";

interface UserOption {
  id: number;
  email: string;
  name: string;
  phone: string;
}

interface Props {
  open: boolean;
  users: UserOption[];
  usersError?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

// RecipientFormDialog: "Usuários" is the default tab and "Manual" is second.
export function RecipientFormDialog(
  { open, users, usersError, onClose, onSaved }: Props,
) {
  const [tab, setTab] = useState<"users" | "manual">("users");
  const [selected, setSelected] = useState<number[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Reset transient state each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTab("users");
    setSelected([]);
    setEmail("");
    setName("");
    setPhone("");
    setError("");
  }, [open]);

  async function addUsers() {
    if (selected.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/recipients/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addUsers", userIds: selected }),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createManual(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, phone }),
      });
      setEmail("");
      setName("");
      setPhone("");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const options = users.map((u) => ({
    id: u.id,
    label: u.name ? `${u.name} - ${u.email}` : u.email,
    hint: u.phone || undefined,
  }));

  const tabBtn = (value: "users" | "manual", label: string) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: tab === value ? "var(--accent)" : "transparent",
        color: tab === value ? "#fff" : "var(--text-secondary)",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <AdminFormDialog
      open={open}
      title="Novo destinatário"
      subtitle="Adicione usuários ou cadastre manualmente."
      onClose={onClose}
      error={error}
    >
      <div style={{ display: "flex", gap: 8 }}>
        {tabBtn("users", "Usuários")}
        {tabBtn("manual", "Manual")}
      </div>
      {tab === "users"
        ? (
          <div style={{ display: "grid", gap: 10 }}>
            {usersError && (
              <div role="alert" style={{ color: "var(--au-danger-fg)" }}>
                Não foi possível carregar usuários: {usersError}
              </div>
            )}
            <SearchMultiSelect
              label="Usuários"
              options={options}
              selected={selected}
              onChange={setSelected}
              emptyText="Nenhum usuário disponível."
            />
            <button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => void addUsers()}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background:
                  "linear-gradient(90deg,var(--accent),var(--accent-2))",
                color: "#fff",
                fontWeight: 700,
                cursor: busy || selected.length === 0
                  ? "not-allowed"
                  : "pointer",
                opacity: busy || selected.length === 0 ? 0.7 : 1,
              }}
            >
              {busy
                ? "Adicionando…"
                : `Adicionar ${selected.length || ""} usuário(s)`}
            </button>
          </div>
        )
        : (
          <form
            onSubmit={(e) => void createManual(e)}
            style={{ display: "grid", gap: 10 }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span>E-mail</span>
              <input
                type="email"
                required
                value={email}
                onInput={(e) => setEmail(e.currentTarget.value)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Nome</span>
              <input
                type="text"
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Telefone (só crítico)</span>
              <input
                type="tel"
                value={phone}
                onInput={(e) => setPhone(e.currentTarget.value)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background:
                  "linear-gradient(90deg,var(--accent),var(--accent-2))",
                color: "#fff",
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Adicionando…" : "Adicionar destinatário"}
            </button>
          </form>
        )}
    </AdminFormDialog>
  );
}
