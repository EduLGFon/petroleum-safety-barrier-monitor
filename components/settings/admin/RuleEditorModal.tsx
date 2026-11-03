// Rule editor dialog - extracted from RulesManager so the list page and
// the form can evolve independently.
import { createPortal } from "preact/compat";
import type { RefObject } from "preact";
import { Field, ghostBtn, inputSt, primaryBtn } from "./AdminPrimitives.tsx";
import { RuleScopeFields, RuleTimingFields } from "./RuleEditorTabs.tsx";
import { numCoercionError } from "./rules-helpers.tsx";
import type { Draft, Lookups } from "./rules-helpers.tsx";

export type TabKey = "basic" | "scope" | "timing";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "Básico" },
  { key: "scope", label: "Escopo" },
  { key: "timing", label: "Anti-ruído" },
];

interface Props {
  open: boolean;
  modalRef: RefObject<HTMLDivElement>;
  editingId: number | null;
  tab: TabKey;
  setTab: (t: TabKey) => void;
  form: Draft;
  update: (patch: Partial<Draft>) => void;
  lookups: Lookups | null;
  modalError: string;
  busy: boolean;
  previewBusy: boolean;
  preview: { count: number; tags: string[] } | null;
  onClose: () => void;
  onSave: (e: Event) => void;
  onPreview: () => void;
}

export function RuleEditorModal({
  open,
  modalRef,
  editingId,
  tab,
  setTab,
  form,
  update,
  lookups,
  modalError,
  busy,
  previewBusy,
  preview,
  onClose,
  onSave,
  onPreview,
}: Props) {
  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        contain: "strict",
        background: "rgba(0,0,0,.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: "min(920px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "var(--bg-elevated)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--d-row-radius)",
          padding: "var(--d-row-pad)",
          display: "grid",
          gap: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            id="rules-modal-title"
            style={{
              fontSize: "var(--d-lead)",
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            {editingId !== null ? "Editar regra" : "Nova regra de alerta"}
          </span>
          <button
            type="button"
            onClick={() => onClose()}
            style={ghostBtn}
          >
            Fechar
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  border: "none",
                  borderRadius: "var(--d-chip-radius)",
                  padding: "6px 12px",
                  fontSize: "var(--d-small)",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: active
                    ? "linear-gradient(90deg,var(--accent),var(--accent-2))"
                    : "var(--bg-surface)",
                  color: active ? "#fff" : "var(--text-secondary)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(e) => onSave(e)}
          style={{ display: "grid", gap: 12 }}
        >
          {modalError && (
            <div
              role="alert"
              style={{
                background: "var(--au-danger-bg)",
                border: "1px solid var(--alert-nc-border)",
                color: "var(--au-danger-fg)",
                borderRadius: "var(--d-input-radius)",
                padding: "8px 12px",
                fontSize: "var(--d-small)",
                lineHeight: 1.5,
              }}
            >
              {modalError}
            </div>
          )}
          {tab === "basic" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                }}
              >
                <Field label="Nome da regra">
                  <input
                    type="text"
                    required
                    placeholder="Ex.: Críticas indisponíveis"
                    value={form.name}
                    onInput={(e) => update({ name: e.currentTarget.value })}
                    style={inputSt}
                  />
                </Field>
                <Field label="Prioridade / Entrega">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      title="Prioridade"
                      value={form.priority}
                      aria-invalid={numCoercionError(form.priority) !==
                        null}
                      onInput={(e) =>
                        update({ priority: e.currentTarget.value })}
                      style={{ ...inputSt, maxWidth: 90 }}
                    />
                    <select
                      value={form.notifyImmediate ? "now" : "digest"}
                      onChange={(e) =>
                        update({
                          notifyImmediate: e.currentTarget.value === "now",
                        })}
                      style={inputSt}
                    >
                      <option value="digest">Digest</option>
                      <option value="now">Imediato</option>
                    </select>
                    <select
                      value={form.urgency}
                      onChange={(e) =>
                        update({
                          urgency: e.currentTarget
                            .value as Draft["urgency"],
                        })}
                      style={inputSt}
                    >
                      <option value="any">Qualquer urgência</option>
                      <option value="urgent">Urgente+</option>
                      <option value="critical">Só crítica</option>
                    </select>
                  </div>
                  {numCoercionError(form.priority) && (
                    <div
                      role="alert"
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--au-danger-fg)",
                        marginTop: 4,
                      }}
                    >
                      Prioridade: {numCoercionError(form.priority)}
                    </div>
                  )}
                </Field>
              </div>
              <Field label="Descrição (opcional)">
                <input
                  type="text"
                  placeholder="Para que serve esta regra…"
                  value={form.description}
                  onInput={(e) =>
                    update({ description: e.currentTarget.value })}
                  style={inputSt}
                />
              </Field>
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: "var(--d-small)",
                  color: "var(--text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => update({ active: e.currentTarget.checked })}
                />
                Regra ativa
              </label>
            </div>
          )}
          {tab === "scope" && (
            <RuleScopeFields
              form={form}
              update={update}
              lookups={lookups}
            />
          )}
          {tab === "timing" && <RuleTimingFields form={form} update={update} />}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="lift"
              style={{
                ...primaryBtn,
                opacity: busy ? 0.7 : 1,
                flex: "1 1 160px",
              }}
            >
              {busy
                ? "Salvando…"
                : editingId !== null
                ? "Salvar alterações"
                : "Criar regra"}
            </button>
            <button
              type="button"
              disabled={previewBusy}
              onClick={() => onPreview()}
              style={ghostBtn}
            >
              {previewBusy ? "Testando…" : "Testar escopo"}
            </button>
          </div>
          {preview !== null && (
            <div
              style={{
                fontSize: "var(--d-small)",
                color: "var(--text-secondary)",
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--d-input-radius)",
                padding: "8px 12px",
              }}
            >
              Escopo atual casa com <strong>{preview.count}</strong> barreira(s)
              {preview.tags.length > 0 &&
                ` - ex.: ${preview.tags.join(", ")}`}.
            </div>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}
