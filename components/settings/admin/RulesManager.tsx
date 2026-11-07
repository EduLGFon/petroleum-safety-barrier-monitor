// RulesManager - alert rule list with paging, search, selection and bulk actions.
// This is why it exists: admins enable/mute alerts by scope (categories,
// statuses, locations, criticality and more) and tune triggers, anti-noise
// windows and delivery without code changes. The editor keeps the heavy form
// out of the list view so rules stay scannable.
import {
  AdminHero,
  AdminRow,
  Avatar,
  dangerBtn,
  EmptyState,
  ErrorBanner,
  ghostBtn,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";

import {
  AdminBulkButton,
  AdminSearchInput,
  AdminSelectionBar,
} from "./AdminListControls.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import {
  AlertRule,
  Draft,
  draftToPayload,
  EMPTY_DRAFT,
  Lookups,
  numCoercionError,
  ruleToDraft,
} from "./rules-helpers.tsx";

import { RuleEditorModal, type TabKey } from "./RuleEditorModal.tsx";

import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { useAdminList } from "../../../hooks/useAdminList.ts";

import { useAdminResource } from "../../../hooks/useAdminResource.ts";

import { useFocusTrap } from "../../../hooks/useFocusTrap.ts";

import { Pagination } from "../../table/Pagination.tsx";

function scopeSummary(r: AlertRule): string {
  const parts: string[] = [];
  const n = (list: number[] | null, singular: string) =>
    list && list.length > 0 ? `${list.length} ${singular}` : null;
  const cat = n(r.category_ids, "cat.") ??
    (r.category_id !== null ? "1 cat." : null);
  if (cat) parts.push(cat);
  const land = n(r.to_status_ids, "status") ??
    (r.to_status_id !== null ? "1 status" : null);
  if (land) parts.push(land);
  if (r.from_status_ids && r.from_status_ids.length > 0) {
    parts.push(`de ${r.from_status_ids.length} origem`);
  }
  const loc = n(r.location_ids, "locais");
  if (loc) parts.push(loc);
  const crit = n(r.criticality_ids, "crit.");
  if (crit) parts.push(crit);
  else if (r.critical_only) parts.push("só críticas");
  if (r.urgency !== "any") parts.push(r.urgency);
  if (r.stale_days != null) {
    parts.push(
      `${r.stale_days}d parado${
        r.stale_repeat_days ? ` / repete ${r.stale_repeat_days}d` : ""
      }`,
    );
  }
  if (r.cooldown_minutes != null) parts.push(`pausa ${r.cooldown_minutes}min`);
  if (r.max_per_day != null) parts.push(`máx ${r.max_per_day}/dia`);
  if (r.quiet_start_hour !== null && r.quiet_end_hour !== null) {
    parts.push(`silêncio ${r.quiet_start_hour}-${r.quiet_end_hour}h`);
  }
  if (!r.on_transition) parts.push("só lembrete");
  if (r.include_recovery) parts.push("+recuperação");
  if (r.only_no_action_plan) parts.push("s/ plano");
  if (parts.length === 0) return "Qualquer não conforme";
  return parts.join(" · ");
}

export function RulesManager({ onCount }: { onCount?: (n: number) => void }) {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("basic");
  const [preview, setPreview] = useState<
    { count: number; tags: string[] } | null
  >(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >(
    "all",
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previewTimer = useRef<number | undefined>(undefined);
  const previewAbort = useRef<AbortController | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useFocusTrap(modalRef, modalOpen);

  const resource = useAdminResource<AlertRule>(
    async (signal?: AbortSignal) => {
      const [r, l] = await Promise.all([
        adminApi("/api/alert-rules", { signal }) as Promise<AlertRule[]>,
        adminApi("/api/lookups", { signal }) as Promise<Lookups>,
      ]);
      setLookups(l);
      return r;
    },
  );
  const { items: rules, loading, reload } = resource;
  const listError = resource.error;

  useEffect(() => {
    onCount?.(rules.filter((x) => x.active).length);
  }, [rules, onCount]);

  useEffect(() => {
    if (listError) setError(listError);
  }, [listError]);

  async function refresh() {
    setError("");
    await reload();
  }

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = globalThis.setTimeout(() => {
      const node = modalRef.current;
      const first = node?.querySelector<HTMLElement>(
        "input, select, textarea, button",
      );
      first?.focus();
    }, 0);
    return () => {
      globalThis.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      previewAbort.current?.abort();
      if (previewTimer.current !== undefined) {
        globalThis.clearTimeout(previewTimer.current);
      }
      lastFocus.current?.focus?.();
    };
  }, [modalOpen]);

  useEffect(() => {
    return () => {
      if (previewTimer.current !== undefined) {
        globalThis.clearTimeout(previewTimer.current);
      }
      previewAbort.current?.abort();
    };
  }, []);

  const scopedRules = useMemo(
    () =>
      statusFilter === "all"
        ? rules
        : rules.filter((r) => statusFilter === "active" ? r.active : !r.active),
    [rules, statusFilter],
  );

  const list = useAdminList<AlertRule, number>({
    items: scopedRules,
    getId: (r) => r.id,
    getSearchText: (r) => `${r.name} ${r.description} ${scopeSummary(r)}`,
  });

  function update(patch: Partial<Draft>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_DRAFT);
    setPreview(null);
    setModalError("");
    setTab("basic");
    setModalOpen(true);
  }

  function openEdit(r: AlertRule) {
    setEditingId(r.id);
    setForm(ruleToDraft(r));
    setPreview(null);
    setModalError("");
    setTab("basic");
    setModalOpen(true);
  }

  async function save(e: Event) {
    e.preventDefault();
    const bad = [
      ["staleDays", form.staleDays],
      ["staleRepeatDays", form.staleRepeatDays],
      ["cooldownMinutes", form.cooldownMinutes],
      ["maxPerDay", form.maxPerDay],
      ["priority", form.priority],
      ["quietStart", form.quietStart],
      ["quietEnd", form.quietEnd],
    ] as const;
    for (const [, raw] of bad) {
      const err = numCoercionError(raw);
      if (err) {
        setModalError(`Corrija os campos numéricos: ${err}`);
        return;
      }
    }
    setBusy(true);
    setModalError("");
    try {
      if (editingId !== null) {
        await adminApi(`/api/alert-rules/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftToPayload(form)),
        });
      } else {
        await adminApi("/api/alert-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftToPayload(form)),
        });
      }
      setModalOpen(false);
      await refresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runPreviewImmediate() {
    previewAbort.current?.abort();
    const ctrl = new AbortController();
    previewAbort.current = ctrl;
    setPreviewBusy(true);
    setModalError("");
    try {
      const q = new URLSearchParams();
      const put = (k: string, ids: number[]) => {
        if (ids.length > 0) q.set(k, ids.join(","));
      };
      put("categoryIds", form.categoryIds);
      put("locationIds", form.locationIds);
      put("criticalityIds", form.criticalityIds);
      put("typologyIds", form.typologyIds);
      put("groupingIds", form.groupingIds);
      put("ownerIds", form.ownerIds);
      if (form.staleDays.trim() !== "") {
        q.set("staleDays", form.staleDays.trim());
      }
      if (form.onlyNoActionPlan) q.set("onlyNoActionPlan", "1");
      const res = await adminApi(
        `/api/alert-rules/preview?${q.toString()}`,
        { signal: ctrl.signal },
      ) as { count: number; tags: string[] };
      if (ctrl.signal.aborted) return;
      setPreview(res);
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        ctrl.signal.aborted
      ) return;
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!ctrl.signal.aborted) setPreviewBusy(false);
    }
  }

  function runPreview() {
    if (previewTimer.current !== undefined) {
      globalThis.clearTimeout(previewTimer.current);
    }
    previewTimer.current = globalThis.setTimeout(() => {
      void runPreviewImmediate();
    }, 350) as unknown as number;
  }

  async function toggle(rule: AlertRule) {
    if (rowBusy !== null) return;
    setRowBusy(rule.id);
    try {
      await adminApi(`/api/alert-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
    }
  }

  async function duplicate(rule: AlertRule) {
    if (rowBusy !== null) return;
    setRowBusy(rule.id);
    try {
      const d = ruleToDraft(rule);
      d.name = `${rule.name} (cópia)`.slice(0, 200);
      await adminApi("/api/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(d)),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(rule: AlertRule) {
    if (confirmId !== rule.id) {
      setConfirmId(rule.id);
      return;
    }
    setConfirmId(null);
    if (rowBusy !== null) return;
    setRowBusy(rule.id);
    try {
      await adminApi(`/api/alert-rules/${rule.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
    }
  }

  async function bulkActivate() {
    const ids = [...list.selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await adminApi("/api/alert-rules/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", ids }),
      });
      list.clearAll();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDeactivate() {
    const ids = [...list.selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await adminApi("/api/alert-rules/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate", ids }),
      });
      list.clearAll();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = [...list.selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} regra(s) selecionada(s)?`)) return;
    setBulkBusy(true);
    try {
      await adminApi("/api/alert-rules/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      list.clearAll();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const selectedCount = list.selectedCount;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Regras de alerta"
        hint="Sem regras, todo estado não conforme alerta. Com regras, só o que casar com escopo, gatilho e janela anti-ruído alerta — a de maior prioridade vence."
        count={`${rules.filter((r) => r.active).length} ativas`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <AdminSearchInput
          value={list.query}
          onChange={list.setQuery}
          placeholder="Buscar regras..."
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.currentTarget.value as "all" | "active" | "inactive",
            )}
          style={{ padding: "6px 10px" }}
        >
          <option value="all">Todas</option>
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
        </select>
        <button
          type="button"
          onClick={openCreate}
          className="lift"
          style={{ ...primaryBtn, marginLeft: "auto" }}
        >
          + Nova regra
        </button>
      </div>

      <AdminSelectionBar
        pageIds={list.pageIds}
        selectedIds={list.selectedIds}
        total={list.total}
        onSelectPage={list.selectPage}
        onSelectAll={list.selectAll}
        onClearAll={list.clearAll}
      >
        {selectedCount > 0 && (
          <>
            <AdminBulkButton
              onClick={() => void bulkActivate()}
              disabled={bulkBusy}
              tone="primary"
            >
              {bulkBusy ? "Aguarde…" : "Ativar"}
            </AdminBulkButton>
            <AdminBulkButton
              onClick={() => void bulkDeactivate()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "Aguarde…" : "Desativar"}
            </AdminBulkButton>
            <AdminBulkButton
              onClick={() => void bulkDelete()}
              disabled={bulkBusy}
              tone="danger"
            >
              {bulkBusy ? "Aguarde…" : "Excluir"}
            </AdminBulkButton>
          </>
        )}
      </AdminSelectionBar>

      {loading && rules.length === 0
        ? <SkeletonRows />
        : list.filtered.length === 0
        ? (
          <EmptyState text="Nenhuma regra. Todo estado não conforme alerta até você criar uma." />
        )
        : (
          <div style={{ display: "grid", gap: 8 }}>
            {loading && (
              <div
                role="status"
                style={{
                  fontSize: "var(--d-small)",
                  color: "var(--text-muted)",
                }}
              >
                Atualizando regras…
              </div>
            )}
            {list.pageItems.map((r) => (
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
                    <span
                      style={{
                        fontWeight: 500,
                        color: "var(--text-muted)",
                        marginLeft: 8,
                      }}
                    >
                      prio {r.priority}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "var(--d-small)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {scopeSummary(r)}
                  </div>
                  {r.description && (
                    <div
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.description}
                    </div>
                  )}
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
                    onClick={() => openEdit(r)}
                    style={ghostBtn}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === r.id}
                    onClick={() => void toggle(r)}
                    style={ghostBtn}
                  >
                    {rowBusy === r.id
                      ? "Aguarde…"
                      : r.active
                      ? "Desativar"
                      : "Ativar"}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === r.id}
                    onClick={() => void duplicate(r)}
                    style={ghostBtn}
                  >
                    {rowBusy === r.id ? "Aguarde…" : "Duplicar"}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === r.id}
                    onClick={() => void remove(r)}
                    style={dangerBtn}
                  >
                    {rowBusy === r.id
                      ? "Aguarde…"
                      : confirmId === r.id
                      ? "Confirmar remoção?"
                      : "Remover"}
                  </button>
                </span>
              </AdminRow>
            ))}
          </div>
        )}

      {list.totalPages > 1 && (
        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          total={list.total}
          pageSize={list.pageSize}
          onChange={list.setPage}
          onPageSize={list.setPageSize}
        />
      )}

      <RuleEditorModal
        open={modalOpen}
        modalRef={modalRef}
        editingId={editingId}
        tab={tab}
        setTab={setTab}
        form={form}
        update={update}
        lookups={lookups}
        modalError={modalError}
        busy={busy}
        previewBusy={previewBusy}
        preview={preview}
        onClose={() => setModalOpen(false)}
        onSave={(e) => void save(e)}
        onPreview={() => void runPreview()}
      />
    </div>
  );
}
