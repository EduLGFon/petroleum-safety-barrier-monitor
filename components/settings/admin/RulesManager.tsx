// RulesManager - alert rule builder with a focused modal editor.
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
  Field,
  ghostBtn,
  inputSt,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useEffect, useState } from "preact/hooks";

import { createPortal } from "preact/compat";

interface AlertRule {
  id: number;
  name: string;
  description: string;
  category_id: number | null;
  to_status_id: number | null;
  critical_only: boolean;
  include_recovery: boolean;
  stale_days: number | null;
  stale_repeat_days: number | null;
  notify_immediate: boolean;
  active: boolean;
  category_ids: number[] | null;
  from_status_ids: number[] | null;
  to_status_ids: number[] | null;
  location_ids: number[] | null;
  criticality_ids: number[] | null;
  typology_ids: number[] | null;
  grouping_ids: number[] | null;
  owner_ids: number[] | null;
  urgency: "any" | "urgent" | "critical";
  only_no_action_plan: boolean;
  on_transition: boolean;
  cooldown_minutes: number | null;
  max_per_day: number | null;
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
  active_days: number[] | null;
  priority: number;
  valid_from: string | null;
  valid_to: string | null;
  last_triggered_at: string | null;
}

interface LookupOpt {
  id: number;
  label: string;
}

interface Lookups {
  availabilities: LookupOpt[];
  categories: LookupOpt[];
  locations: { id: number; code: string; name: string | null }[];
  criticalities: LookupOpt[];
  typologies: LookupOpt[];
  groupings: LookupOpt[];
  owners: LookupOpt[];
}

interface Draft {
  name: string;
  description: string;
  categoryIds: number[];
  fromStatusIds: number[];
  toStatusIds: number[];
  locationIds: number[];
  criticalityIds: number[];
  typologyIds: number[];
  groupingIds: number[];
  ownerIds: number[];
  urgency: "any" | "urgent" | "critical";
  includeRecovery: boolean;
  onTransition: boolean;
  onlyNoActionPlan: boolean;
  criticalOnly: boolean;
  staleDays: string;
  staleRepeatDays: string;
  cooldownMinutes: string;
  maxPerDay: string;
  quietStart: string;
  quietEnd: string;
  activeDays: number[];
  priority: string;
  validFrom: string;
  validTo: string;
  notifyImmediate: boolean;
  active: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  categoryIds: [],
  fromStatusIds: [],
  toStatusIds: [],
  locationIds: [],
  criticalityIds: [],
  typologyIds: [],
  groupingIds: [],
  ownerIds: [],
  urgency: "any",
  includeRecovery: false,
  onTransition: true,
  onlyNoActionPlan: false,
  criticalOnly: false,
  staleDays: "",
  staleRepeatDays: "",
  cooldownMinutes: "",
  maxPerDay: "",
  quietStart: "",
  quietEnd: "",
  activeDays: [],
  priority: "0",
  validFrom: "",
  validTo: "",
  notifyImmediate: false,
  active: true,
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

function draftToPayload(d: Draft): Record<string, unknown> {
  return {
    name: d.name,
    description: d.description,
    categoryIds: d.categoryIds,
    fromStatusIds: d.fromStatusIds,
    toStatusIds: d.toStatusIds,
    locationIds: d.locationIds,
    criticalityIds: d.criticalityIds,
    typologyIds: d.typologyIds,
    groupingIds: d.groupingIds,
    ownerIds: d.ownerIds,
    urgency: d.urgency,
    includeRecovery: d.includeRecovery,
    onTransition: d.onTransition,
    onlyNoActionPlan: d.onlyNoActionPlan,
    criticalOnly: d.criticalOnly,
    staleDays: numOrNull(d.staleDays),
    staleRepeatDays: numOrNull(d.staleRepeatDays),
    cooldownMinutes: numOrNull(d.cooldownMinutes),
    maxPerDay: numOrNull(d.maxPerDay),
    quietStartHour: numOrNull(d.quietStart),
    quietEndHour: numOrNull(d.quietEnd),
    activeDays: d.activeDays,
    priority: Number(d.priority) || 0,
    validFrom: d.validFrom.trim() === "" ? null : d.validFrom,
    validTo: d.validTo.trim() === "" ? null : d.validTo,
    notifyImmediate: d.notifyImmediate,
    active: d.active,
  };
}

function ruleToDraft(r: AlertRule): Draft {
  return {
    name: r.name,
    description: r.description ?? "",
    categoryIds: r.category_ids ?? [],
    fromStatusIds: r.from_status_ids ?? [],
    toStatusIds: r.to_status_ids ?? [],
    locationIds: r.location_ids ?? [],
    criticalityIds: r.criticality_ids ?? [],
    typologyIds: r.typology_ids ?? [],
    groupingIds: r.grouping_ids ?? [],
    ownerIds: r.owner_ids ?? [],
    urgency: r.urgency ?? "any",
    includeRecovery: r.include_recovery,
    onTransition: r.on_transition,
    onlyNoActionPlan: r.only_no_action_plan,
    criticalOnly: r.critical_only,
    staleDays: r.stale_days?.toString() ?? "",
    staleRepeatDays: r.stale_repeat_days?.toString() ?? "",
    cooldownMinutes: r.cooldown_minutes?.toString() ?? "",
    maxPerDay: r.max_per_day?.toString() ?? "",
    quietStart: r.quiet_start_hour?.toString() ?? "",
    quietEnd: r.quiet_end_hour?.toString() ?? "",
    activeDays: r.active_days ?? [],
    priority: String(r.priority ?? 0),
    validFrom: r.valid_from ?? "",
    validTo: r.valid_to ?? "",
    notifyImmediate: r.notify_immediate,
    active: r.active,
  };
}

function CheckGrid(
  { options, selected, onToggle }: {
    options: { id: number; label: string }[];
    selected: number[];
    onToggle: (id: number) => void;
  },
) {
  if (options.length === 0) {
    return (
      <span style={{ fontSize: "var(--d-small)", color: "var(--text-muted)" }}>
        Nenhuma opção carregada.
      </span>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        maxHeight: 120,
        overflowY: "auto",
        border: "1.5px solid var(--border)",
        borderRadius: "var(--d-input-radius)",
        padding: 8,
        background: "var(--bg-surface)",
      }}
    >
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            title={o.label}
            style={{
              border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 99,
              background: on
                ? "color-mix(in srgb,var(--accent) 12%,transparent)"
                : "transparent",
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "var(--d-small)",
              fontWeight: on ? 700 : 500,
              cursor: "pointer",
              padding: "3px 10px",
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {on ? "✓ " : ""}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

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

type TabKey = "basic" | "scope" | "timing";

const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "Básico" },
  { key: "scope", label: "Escopo" },
  { key: "timing", label: "Anti-ruído" },
];

export function RulesManager({ onCount }: { onCount?: (n: number) => void }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("basic");
  const [preview, setPreview] = useState<
    { count: number; tags: string[] } | null
  >(null);
  const [previewBusy, setPreviewBusy] = useState(false);

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
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function update(patch: Partial<Draft>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_DRAFT);
    setPreview(null);
    setTab("basic");
    setModalOpen(true);
  }

  function openEdit(r: AlertRule) {
    setEditingId(r.id);
    setForm(ruleToDraft(r));
    setPreview(null);
    setTab("basic");
    setModalOpen(true);
  }

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setPreviewBusy(true);
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
      ) as { count: number; tags: string[] };
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
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

  async function duplicate(rule: AlertRule) {
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

  function renderScopeFields() {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Categorias (vazio = todas)">
          <CheckGrid
            options={lookups?.categories ?? []}
            selected={form.categoryIds}
            onToggle={(id) =>
              update({ categoryIds: toggleId(form.categoryIds, id) })}
          />
        </Field>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          }}
        >
          <Field label="Dispara ao chegar em (vazio = qualquer NC)">
            <CheckGrid
              options={lookups?.availabilities ?? []}
              selected={form.toStatusIds}
              onToggle={(id) =>
                update({ toStatusIds: toggleId(form.toStatusIds, id) })}
            />
          </Field>
          <Field label="Somente vindo de (origem, vazio = qualquer)">
            <CheckGrid
              options={lookups?.availabilities ?? []}
              selected={form.fromStatusIds}
              onToggle={(id) =>
                update({ fromStatusIds: toggleId(form.fromStatusIds, id) })}
            />
          </Field>
        </div>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          }}
        >
          <Field label="Locais (vazio = todos)">
            <CheckGrid
              options={(lookups?.locations ?? []).map((l) => ({
                id: l.id,
                label: l.name ? `${l.code} · ${l.name}` : l.code,
              }))}
              selected={form.locationIds}
              onToggle={(id) =>
                update({ locationIds: toggleId(form.locationIds, id) })}
            />
          </Field>
          <Field label="Criticidades (vazio = todas)">
            <CheckGrid
              options={lookups?.criticalities ?? []}
              selected={form.criticalityIds}
              onToggle={(id) =>
                update({ criticalityIds: toggleId(form.criticalityIds, id) })}
            />
          </Field>
        </div>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          }}
        >
          <Field label="Tipologias (vazio = todas)">
            <CheckGrid
              options={lookups?.typologies ?? []}
              selected={form.typologyIds}
              onToggle={(id) =>
                update({ typologyIds: toggleId(form.typologyIds, id) })}
            />
          </Field>
          <Field label="Agrupamentos (vazio = todos)">
            <CheckGrid
              options={lookups?.groupings ?? []}
              selected={form.groupingIds}
              onToggle={(id) =>
                update({ groupingIds: toggleId(form.groupingIds, id) })}
            />
          </Field>
          <Field label="Responsáveis (vazio = todos)">
            <CheckGrid
              options={lookups?.owners ?? []}
              selected={form.ownerIds}
              onToggle={(id) =>
                update({ ownerIds: toggleId(form.ownerIds, id) })}
            />
          </Field>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            fontSize: "var(--d-small)",
            color: "var(--text-secondary)",
          }}
        >
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.criticalOnly}
              onChange={(e) =>
                update({ criticalOnly: e.currentTarget.checked })}
            />
            Só ESO/A (legado)
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.includeRecovery}
              onChange={(e) =>
                update({ includeRecovery: e.currentTarget.checked })}
            />
            Incluir recuperação
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.onTransition}
              onChange={(e) =>
                update({ onTransition: e.currentTarget.checked })}
            />
            Disparar em transição
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.onlyNoActionPlan}
              onChange={(e) =>
                update({ onlyNoActionPlan: e.currentTarget.checked })}
            />
            Só sem plano de ação
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Urgência
            <select
              value={form.urgency}
              onChange={(e) =>
                update({ urgency: e.currentTarget.value as Draft["urgency"] })}
              style={inputSt}
            >
              <option value="any">Qualquer</option>
              <option value="urgent">Urgente+</option>
              <option value="critical">Só crítica</option>
            </select>
          </label>
        </div>
      </div>
    );
  }

  function renderTimingFields() {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          }}
        >
          <Field label="Parado há N dias (lembrete)">
            <input
              type="number"
              min={1}
              placeholder="-"
              value={form.staleDays}
              onInput={(e) => update({ staleDays: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Repetir lembrete a cada N dias">
            <input
              type="number"
              min={1}
              placeholder="1 = diário"
              value={form.staleRepeatDays}
              onInput={(e) =>
                update({ staleRepeatDays: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Pausa por barreira (min)">
            <input
              type="number"
              min={1}
              placeholder="-"
              value={form.cooldownMinutes}
              onInput={(e) =>
                update({ cooldownMinutes: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Máx por dia/barreira">
            <input
              type="number"
              min={1}
              placeholder="-"
              value={form.maxPerDay}
              onInput={(e) => update({ maxPerDay: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Prioridade (maior vence)">
            <input
              type="number"
              value={form.priority}
              onInput={(e) => update({ priority: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
        </div>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          }}
        >
          <Field label="Silêncio das (h UTC)">
            <input
              type="number"
              min={0}
              max={23}
              placeholder="-"
              value={form.quietStart}
              onInput={(e) => update({ quietStart: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Silêncio até (h UTC)">
            <input
              type="number"
              min={0}
              max={23}
              placeholder="-"
              value={form.quietEnd}
              onInput={(e) => update({ quietEnd: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Válida de">
            <input
              type="date"
              value={form.validFrom}
              onInput={(e) => update({ validFrom: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Válida até">
            <input
              type="date"
              value={form.validTo}
              onInput={(e) => update({ validTo: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
        </div>
        <Field label="Dias ativos (vazio = todos)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEEKDAYS.map((label, day) => {
              const on = form.activeDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    update({ activeDays: toggleId(form.activeDays, day) })}
                  style={{
                    border: `1.5px solid ${
                      on ? "var(--accent)" : "var(--border)"
                    }`,
                    borderRadius: 99,
                    background: on
                      ? "color-mix(in srgb,var(--accent) 12%,transparent)"
                      : "transparent",
                    color: on ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: "var(--d-small)",
                    fontWeight: on ? 700 : 500,
                    cursor: "pointer",
                    padding: "3px 12px",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Regras de alerta"
        hint="Sem regras, todo estado não conforme alerta. Com regras, só o que casar com escopo, gatilho e janela anti-ruído alerta — a de maior prioridade vence."
        count={`${rules.filter((r) => r.active).length} ativas`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={openCreate}
          className="lift"
          style={{ ...primaryBtn }}
        >
          + Nova regra
        </button>
      </div>
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
                    onClick={() => void toggle(r)}
                    style={ghostBtn}
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicate(r)}
                    style={ghostBtn}
                  >
                    Duplicar
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

      {modalOpen &&
        createPortal(
          <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0,0,0,.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
        >
          <div
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
                onClick={() => setModalOpen(false)}
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
            <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
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
                      onChange={(e) =>
                        update({ active: e.currentTarget.checked })}
                    />
                    Regra ativa
                  </label>
                </div>
              )}
              {tab === "scope" && renderScopeFields()}
              {tab === "timing" && renderTimingFields()}
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
                  onClick={() => void runPreview()}
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
                  Escopo atual casa com <strong>{preview.count}</strong>{" "}
                  barreira(s)
                  {preview.tags.length > 0 &&
                    ` - ex.: ${preview.tags.join(", ")}`}.
                </div>
              )}
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
