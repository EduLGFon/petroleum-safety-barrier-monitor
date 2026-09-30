// RulesManager - customizable alert triggers with preview and inline edit.
// This is why it exists: admins enable or mute alerts by scope (categories,
// statuses, locations, criticality and more) and tune trigger, anti-noise
// windows and delivery without code changes; this manager wraps
// /api/alert-rules plus the read-only /api/alert-rules/preview counter.
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

// CheckGrid: scrollable checkbox multi-select (empty = all).
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
        maxHeight: 132,
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
              maxWidth: 220,
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
  if (crit) parts.push(crit ?? (r.critical_only ? "só críticas" : ""));
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
    parts.push(`silêncio ${r.quiet_start_hour}–${r.quiet_end_hour}h`);
  }
  if (!r.on_transition) parts.push("só lembrete");
  if (r.include_recovery) parts.push("+recuperação");
  if (r.only_no_action_plan) parts.push("s/ plano");
  if (parts.length === 0) return "Qualquer não conforme";
  return parts.join(" · ");
}

// RulesManager: alert rule CRUD with scope builder, preview and inline edit.
export function RulesManager({ onCount }: { onCount?: (n: number) => void }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState<
    { count: number; tags: string[] } | null
  >(
    null,
  );
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
    // Refresh once per mount; the count reporter is stable for the session.
  }, []);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setEdit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEditDraft((d) => ({ ...d, [key]: value }));
  }

  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi("/api/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      setDraft(EMPTY_DRAFT);
      setPreview(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    setBusy(true);
    try {
      await adminApi(`/api/alert-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(editDraft)),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(d: Draft) {
    setPreviewBusy(true);
    try {
      const q = new URLSearchParams();
      const put = (k: string, ids: number[]) => {
        if (ids.length > 0) q.set(k, ids.join(","));
      };
      put("categoryIds", d.categoryIds);
      put("locationIds", d.locationIds);
      put("criticalityIds", d.criticalityIds);
      put("typologyIds", d.typologyIds);
      put("groupingIds", d.groupingIds);
      put("ownerIds", d.ownerIds);
      if (d.staleDays.trim() !== "") q.set("staleDays", d.staleDays.trim());
      if (d.onlyNoActionPlan) q.set("onlyNoActionPlan", "1");
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

  function renderScopeFields(
    d: Draft,
    update: (patch: Partial<Draft>) => void,
  ) {
    const merge = (patch: Partial<Draft>) =>
      update(
        patch as Partial<Draft> & Record<string, unknown> as Partial<Draft>,
      );
    void merge;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Field label="Categorias (vazio = todas)">
          <CheckGrid
            options={lookups?.categories ?? []}
            selected={d.categoryIds}
            onToggle={(id) =>
              update({ categoryIds: toggleId(d.categoryIds, id) })}
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
              selected={d.toStatusIds}
              onToggle={(id) =>
                update({ toStatusIds: toggleId(d.toStatusIds, id) })}
            />
          </Field>
          <Field label="Somente vindo de (origem, vazio = qualquer)">
            <CheckGrid
              options={lookups?.availabilities ?? []}
              selected={d.fromStatusIds}
              onToggle={(id) =>
                update({ fromStatusIds: toggleId(d.fromStatusIds, id) })}
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
              selected={d.locationIds}
              onToggle={(id) =>
                update({ locationIds: toggleId(d.locationIds, id) })}
            />
          </Field>
          <Field label="Criticidades (vazio = todas)">
            <CheckGrid
              options={lookups?.criticalities ?? []}
              selected={d.criticalityIds}
              onToggle={(id) =>
                update({ criticalityIds: toggleId(d.criticalityIds, id) })}
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
          <Field label="Tipologias (vazio = todas)">
            <CheckGrid
              options={lookups?.typologies ?? []}
              selected={d.typologyIds}
              onToggle={(id) =>
                update({ typologyIds: toggleId(d.typologyIds, id) })}
            />
          </Field>
          <Field label="Agrupamentos (vazio = todos)">
            <CheckGrid
              options={lookups?.groupings ?? []}
              selected={d.groupingIds}
              onToggle={(id) =>
                update({ groupingIds: toggleId(d.groupingIds, id) })}
            />
          </Field>
          <Field label="Responsáveis (vazio = todos)">
            <CheckGrid
              options={lookups?.owners ?? []}
              selected={d.ownerIds}
              onToggle={(id) => update({ ownerIds: toggleId(d.ownerIds, id) })}
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
              checked={d.criticalOnly}
              onChange={(e) =>
                update({ criticalOnly: e.currentTarget.checked })}
            />
            Só ESO/A (legado)
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={d.includeRecovery}
              onChange={(e) =>
                update({ includeRecovery: e.currentTarget.checked })}
            />
            Incluir recuperação
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={d.onTransition}
              onChange={(e) =>
                update({ onTransition: e.currentTarget.checked })}
            />
            Disparar em transição
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={d.onlyNoActionPlan}
              onChange={(e) =>
                update({ onlyNoActionPlan: e.currentTarget.checked })}
            />
            Só sem plano de ação
          </label>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            Urgência
            <select
              value={d.urgency}
              onChange={(e) => update({
                urgency: e.currentTarget.value as Draft["urgency"],
              })}
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

  function renderTimingFields(
    d: Draft,
    update: (patch: Partial<Draft>) => void,
  ) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
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
              placeholder="—"
              value={d.staleDays}
              onInput={(e) => update({ staleDays: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Repetir lembrete a cada N dias">
            <input
              type="number"
              min={1}
              placeholder="1 = diário"
              value={d.staleRepeatDays}
              onInput={(e) =>
                update({ staleRepeatDays: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Pausa por barreira (min)">
            <input
              type="number"
              min={1}
              placeholder="—"
              value={d.cooldownMinutes}
              onInput={(e) =>
                update({ cooldownMinutes: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Máx por dia/barreira">
            <input
              type="number"
              min={1}
              placeholder="—"
              value={d.maxPerDay}
              onInput={(e) => update({ maxPerDay: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Prioridade (maior vence)">
            <input
              type="number"
              value={d.priority}
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
              placeholder="—"
              value={d.quietStart}
              onInput={(e) => update({ quietStart: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Silêncio até (h UTC)">
            <input
              type="number"
              min={0}
              max={23}
              placeholder="—"
              value={d.quietEnd}
              onInput={(e) => update({ quietEnd: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Válida de">
            <input
              type="date"
              value={d.validFrom}
              onInput={(e) => update({ validFrom: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
          <Field label="Válida até">
            <input
              type="date"
              value={d.validTo}
              onInput={(e) => update({ validTo: e.currentTarget.value })}
              style={inputSt}
            />
          </Field>
        </div>
        <Field label="Dias ativos (vazio = todos)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEEKDAYS.map((label, day) => {
              const on = d.activeDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    update({ activeDays: toggleId(d.activeDays, day) })}
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
      <AdminCard>
        <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
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
                value={draft.name}
                onInput={(e) => set("name", e.currentTarget.value)}
                style={inputSt}
              />
            </Field>
            <Field label="Prioridade / Entrega">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  title="Prioridade"
                  value={draft.priority}
                  onInput={(e) => set("priority", e.currentTarget.value)}
                  style={{ ...inputSt, maxWidth: 90 }}
                />
                <select
                  value={draft.notifyImmediate ? "now" : "digest"}
                  onChange={(e) =>
                    set("notifyImmediate", e.currentTarget.value === "now")}
                  style={inputSt}
                >
                  <option value="digest">Digest</option>
                  <option value="now">Imediato</option>
                </select>
                <select
                  value={draft.urgency}
                  onChange={(e) =>
                    set("urgency", e.currentTarget.value as Draft["urgency"])}
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
              value={draft.description}
              onInput={(e) => set("description", e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
          {renderScopeFields(draft, (p) =>
            setDraft((prev) => ({ ...prev, ...p })))}
          <button
            type="button"
            onClick={() =>
              setShowAdvanced((v) => !v)}
            style={{ ...ghostBtn, justifySelf: "start" }}
          >
            {showAdvanced
              ? "▾ Ocultar anti-ruído e janelas"
              : "▸ Anti-ruído e janelas"}
          </button>
          {showAdvanced && renderTimingFields(draft, (p) =>
            setDraft((prev) => ({ ...prev, ...p })))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={busy}
              className="lift"
              style={{
                ...primaryBtn,
                opacity: busy ? 0.7 : 1,
                flex: "1 1 200px",
              }}
            >
              {busy ? "Criando…" : "Criar regra"}
            </button>
            <button
              type="button"
              disabled={previewBusy}
              onClick={() =>
                void runPreview(draft)}
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
              {preview.tags.length > 0 && ` — ex.: ${preview.tags.join(", ")}`}.
            </div>
          )}
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
              <div key={r.id} style={{ display: "grid", gap: 8 }}>
                <AdminRow>
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
                      onClick={() => {
                        setEditingId(editingId === r.id ? null : r.id);
                        setEditDraft(ruleToDraft(r));
                      }}
                      style={ghostBtn}
                    >
                      {editingId === r.id ? "Fechar" : "Editar"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void toggle(r)}
                      style={ghostBtn}
                    >
                      {r.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void duplicate(r)}
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
                {editingId === r.id && (
                  <AdminCard>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(220px,1fr))",
                        }}
                      >
                        <Field label="Nome">
                          <input
                            type="text"
                            value={editDraft.name}
                            onInput={(e) =>
                              setEdit("name", e.currentTarget.value)}
                            style={inputSt}
                          />
                        </Field>
                        <Field label="Prioridade / Entrega">
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              type="number"
                              value={editDraft.priority}
                              onInput={(e) =>
                                setEdit("priority", e.currentTarget.value)}
                              style={{ ...inputSt, maxWidth: 90 }}
                            />
                            <select
                              value={editDraft.notifyImmediate
                                ? "now"
                                : "digest"}
                              onChange={(e) =>
                                setEdit(
                                  "notifyImmediate",
                                  e.currentTarget.value === "now",
                                )}
                              style={inputSt}
                            >
                              <option value="digest">Digest</option>
                              <option value="now">Imediato</option>
                            </select>
                          </div>
                        </Field>
                      </div>
                      <Field label="Descrição">
                        <input
                          type="text"
                          value={editDraft.description}
                          onInput={(e) =>
                            setEdit("description", e.currentTarget.value)}
                          style={inputSt}
                        />
                      </Field>
                      {renderScopeFields(
                        editDraft,
                        (p) => setEditDraft((prev) => ({ ...prev, ...p })),
                      )}
                      {renderTimingFields(
                        editDraft,
                        (p) => setEditDraft((prev) => ({ ...prev, ...p })),
                      )}
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveEdit(r.id)}
                          style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
                        >
                          {busy ? "Salvando…" : "Salvar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void runPreview(editDraft)}
                          style={ghostBtn}
                        >
                          Testar escopo
                        </button>
                      </div>
                    </div>
                  </AdminCard>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
