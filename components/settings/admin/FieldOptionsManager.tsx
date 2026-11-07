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
  type FieldKey,
  SEED_DEFAULTS,
} from "../../../lib/field-options.ts";

import {
  AdminBulkButton,
  AdminSearchInput,
  AdminSelectionBar,
} from "./AdminListControls.tsx";

import { useAdminList } from "../../../hooks/useAdminList.ts";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useEffect, useRef, useState } from "preact/hooks";

import { Pagination } from "../../table/Pagination.tsx";

interface SetItem {
  field: string;
  options: string[];
  updated_at: string;
}

// Stable identity helpers for the option list so useAdminList does not
// rebuild its filtered/selected state on every render.
const optionId = (opt: string): string => opt;
const optionText = (opt: string): string => opt;

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
  // Serializes PUTs: rapid add/remove clicks queue instead of racing, so
  // the last write wins on the server instead of an earlier response
  // clobbering a later one.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

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

  const list = useAdminList<string, string>({
    items: currentOpts,
    getId: optionId,
    getSearchText: optionText,
  });

  function save(next: string[]) {
    const field = selected;
    const task = saveQueueRef.current.then(async () => {
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        await adminApi(`/api/field-options?field=${field}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ options: next }),
        });
        setData((prev) => ({ ...prev, [field]: next }));
        setSuccess("Opções salvas com sucesso.");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    });
    saveQueueRef.current = task.catch(() => {});
    return task;
  }

  function addOption(e: Event) {
    e.preventDefault();
    const v = newItem.trim();
    if (!v || currentOpts.includes(v)) return;
    setNewItem("");
    void save([...currentOpts, v]);
  }

  function removeOption(opt: string) {
    const next = currentOpts.filter((o) => o !== opt);
    void save(next);
  }

  function removeSelected() {
    const selectedSet = list.selectedIds;
    const next = currentOpts.filter((opt) => !selectedSet.has(opt));
    list.clearAll();
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
              list.setQuery("");
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
                  title="Restaura os valores mais comuns do Fracttal"
                >
                  Restaurar padrão
                </button>
              </div>
              <AdminSearchInput
                value={list.query}
                onChange={list.setQuery}
                placeholder="Buscar opções..."
                disabled={busy}
              />
              <AdminSelectionBar
                pageIds={list.pageIds}
                selectedIds={list.selectedIds}
                total={list.total}
                onSelectPage={list.selectPage}
                onSelectAll={list.selectAll}
                onClearAll={list.clearAll}
              >
                {list.selectedCount > 0 && (
                  <AdminBulkButton
                    tone="danger"
                    disabled={busy}
                    onClick={removeSelected}
                  >
                    Remover selecionadas ({list.selectedCount})
                  </AdminBulkButton>
                )}
              </AdminSelectionBar>
              {currentOpts.length === 0
                ? (
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
                )
                : list.total === 0
                ? (
                  <span
                    style={{
                      fontSize: "var(--d-small)",
                      color: "var(--text-muted)",
                      padding: 6,
                      fontStyle: "italic",
                    }}
                  >
                    Nenhuma opção encontrada.
                  </span>
                )
                : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {list.pageItems.map((opt) => (
                      <div
                        key={opt}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--d-chip-radius)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={list.selectedIds.has(opt)}
                          onChange={() => list.toggle(opt)}
                          disabled={busy}
                          aria-label={`Selecionar ${opt}`}
                        />
                        <span
                          style={{
                            flex: 1,
                            fontSize: "var(--d-small)",
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opt}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeOption(opt)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: "var(--d-body)",
                            lineHeight: 1,
                          }}
                          title="Remover opção"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              {list.total > 0 && (
                <Pagination
                  page={list.page}
                  totalPages={list.totalPages}
                  total={list.total}
                  pageSize={list.pageSize}
                  onChange={list.setPage}
                  onPageSize={list.setPageSize}
                />
              )}
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
