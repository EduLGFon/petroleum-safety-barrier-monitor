// Rule editor tab bodies - scope and anti-noise fields.
// Split out of RulesManager so each tab can be reviewed on its own.
import { Field, inputSt } from "./AdminPrimitives.tsx";
import {
  CheckGrid,
  numCoercionError,
  toggleId,
  WEEKDAYS,
} from "./rules-helpers.tsx";
import type { Draft, Lookups } from "./rules-helpers.tsx";

interface TabProps {
  form: Draft;
  update: (patch: Partial<Draft>) => void;
  lookups?: Lookups | null;
}

export function RuleScopeFields({ form, update, lookups }: TabProps) {
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
            onToggle={(id) => update({ ownerIds: toggleId(form.ownerIds, id) })}
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
            onChange={(e) => update({ criticalOnly: e.currentTarget.checked })}
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
            onChange={(e) => update({ onTransition: e.currentTarget.checked })}
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

export function RuleTimingFields({ form, update }: TabProps) {
  // Field-level numeric feedback: "12a" no longer vanishes to null.
  const fieldErr = (raw: string): string | null => numCoercionError(raw);
  const errStyle = {
    fontSize: "var(--d-small)",
    color: "var(--au-danger-fg)",
    marginTop: 4,
  } as const;
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
            aria-invalid={fieldErr(form.staleDays) !== null}
          />
          {fieldErr(form.staleDays) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.staleDays)}
            </div>
          )}
        </Field>
        <Field label="Repetir lembrete a cada N dias">
          <input
            type="number"
            min={1}
            placeholder="1 = diário"
            value={form.staleRepeatDays}
            onInput={(e) => update({ staleRepeatDays: e.currentTarget.value })}
            style={inputSt}
            aria-invalid={fieldErr(form.staleRepeatDays) !== null}
          />
          {fieldErr(form.staleRepeatDays) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.staleRepeatDays)}
            </div>
          )}
        </Field>
        <Field label="Pausa por barreira (min)">
          <input
            type="number"
            min={1}
            placeholder="-"
            value={form.cooldownMinutes}
            onInput={(e) => update({ cooldownMinutes: e.currentTarget.value })}
            style={inputSt}
            aria-invalid={fieldErr(form.cooldownMinutes) !== null}
          />
          {fieldErr(form.cooldownMinutes) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.cooldownMinutes)}
            </div>
          )}
        </Field>
        <Field label="Máx por dia/barreira">
          <input
            type="number"
            min={1}
            placeholder="-"
            value={form.maxPerDay}
            onInput={(e) => update({ maxPerDay: e.currentTarget.value })}
            style={inputSt}
            aria-invalid={fieldErr(form.maxPerDay) !== null}
          />
          {fieldErr(form.maxPerDay) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.maxPerDay)}
            </div>
          )}
        </Field>
        <Field label="Prioridade (maior vence)">
          <input
            type="number"
            value={form.priority}
            onInput={(e) => update({ priority: e.currentTarget.value })}
            style={inputSt}
            aria-invalid={fieldErr(form.priority) !== null}
          />
          {fieldErr(form.priority) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.priority)}
            </div>
          )}
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
            aria-invalid={fieldErr(form.quietStart) !== null}
          />
          {fieldErr(form.quietStart) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.quietStart)}
            </div>
          )}
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
            aria-invalid={fieldErr(form.quietEnd) !== null}
          />
          {fieldErr(form.quietEnd) && (
            <div role="alert" style={errStyle}>
              {fieldErr(form.quietEnd)}
            </div>
          )}
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
                aria-pressed={on}
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
