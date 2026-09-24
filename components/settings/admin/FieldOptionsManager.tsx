// FieldOptionsManager - admin option sets for barrier sheet questions.
// This is why it exists: admins configure default answer options in
// Settings, with the ability to restore clean sheet-extracted values.
import {
  AdminCard,
  AdminHero,
  ErrorBanner,
  Field,
  ghostBtn,
  inputSt,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  SEED_DEFAULTS,
  type FieldKey,
} from "../../../lib/field-options.ts";
import { adminApi } from "../../../lib/api/admin-client.ts";
import { useEffect, useState } from "preact/hooks";

interface SetItem {
  field: string;
  options: string[];
  updated_at: string;
}

// FieldOptionsManager: select field, view/edit option pills, restore defaults.
export function FieldOptionsManager(
  { onCount }: { onCount?: (n: number) => void },
) {
  const [selected, setSelected] = useState<FieldKey>("opStatus");
  const [data, setData] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  async function refresh() {
    try {
      setError("");
      setLoading(true);
      const rows = (await adminApi("/api/field-options")) as SetItem[];
      const map: Record<string, string[]> = {};
      for (const r of rows) map[r.field] = r.options;
      setData(map);
      onCount?.(rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const currentOpts = data[selected] ?? SEED_DEFAULTS[selected] ?? [];

  async function save(next: string[]) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await adminApi(`/api/field-options?field=${selected}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: next }),
      });
      setData((prev) => ({ ...prev, [selected]: next }));
      setSuccess("Opções salvas com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function addOption(e: Event) {
    e.preventDefault();
    const v = newItem.trim();
    if (!v || currentOpts.includes(v)) return;
    setNewItem("");
    void save([...currentOpts, v]);
  }

  function removeOption(idx: number) {
    const next = currentOpts.filter((_, i) => i !== idx);
    void save(next);
  }

  function restoreDefaults() {
    const seed = SEED_DEFAULTS[selected];
    if (seed && seed.length > 0) void save([...seed]);
  }

  return (
    <div style={{ display: "grid", gap: "var(--d-panel-gap)" }}>
      <AdminHero
        title="Opções de Preenchimento"
        hint="Padrões e listas de respostas para as perguntas do inventário."
        count={`${FIELD_KEYS.length} campos`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {success && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(16,185,129,.14)",
            border: "1px solid rgba(16,185,129,.3)",
            borderRadius: "var(--d-chip-radius)",
            fontSize: "var(--d-small)",
            color: "#10b981",
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}
      <AdminCard>
        <Field label="Pergunta / Campo">
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.currentTarget.value as FieldKey);
              setSuccess("");
              setError("");
            }}
            style={{ ...inputSt, cursor: "pointer" }}
          >
            {FIELD_KEYS.map((k) => (
              <option key={k} value={k}>
                {FIELD_LABELS[k]} ({k})
              </option>
            ))}
          </select>
        </Field>
        {loading
          ? <SkeletonRows />
          : (
            <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: "var(--d-small)",
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Opções disponíveis
                  </span>
                  <StatusBadge tone="neutral">
                    {currentOpts.length}
                  </StatusBadge>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={restoreDefaults}
                  style={{ ...ghostBtn, fontSize: "var(--d-small)" }}
                  title="Restaura os valores extraídos da planilha original"
                >
                  Restaurar planilha
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 180,
                  overflowY: "auto",
                  padding: 4,
                  background: "var(--bg-surface)",
                  borderRadius: "var(--d-chip-radius)",
                  border: "1px solid var(--border)",
                }}
              >
                {currentOpts.length === 0 && (
                  <span
                    style={{
                      fontSize: "var(--d-small)",
                      color: "var(--text-muted)",
                      padding: 6,
                      fontStyle: "italic",
                    }}
                  >
                    Nenhuma opção configurada (campo livre).
                  </span>
                )}
                {currentOpts.map((opt, i) => (
                  <span
                    key={opt}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "3px 8px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: "var(--d-small)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span>{opt}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeOption(i)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form
                onSubmit={addOption}
                style={{ display: "flex", gap: 6, marginTop: 4 }}
              >
                <input
                  type="text"
                  placeholder="Nova opção..."
                  value={newItem}
                  onInput={(e) => setNewItem(e.currentTarget.value)}
                  style={{ ...inputSt, flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={busy || !newItem.trim()}
                  style={{ ...primaryBtn, flexShrink: 0 }}
                >
                  Adicionar
                </button>
              </form>
            </div>
          )}
      </AdminCard>
    </div>
  );
}
