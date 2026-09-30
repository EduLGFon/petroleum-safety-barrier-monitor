// Alert rules SQL - which events trigger email, per category and beyond.
// This is why it exists: admins enable or disable alerts by category and
// define what fires (status landing, critical-only, recovery, stale days,
// immediate vs digest, plus multi-select scopes, urgency, anti-noise
// windows and priority). The detector reads active rows; the routes guard
// writes behind admin auth.
import { queryRows } from "../db.ts";

export type RuleUrgency = "any" | "urgent" | "critical";

export interface AlertRule {
  id: number;
  name: string;
  category_id: number | null;
  to_status_id: number | null;
  critical_only: boolean;
  include_recovery: boolean;
  stale_days: number | null;
  notify_immediate: boolean;
  active: boolean;
  description: string;
  category_ids: number[] | null;
  from_status_ids: number[] | null;
  to_status_ids: number[] | null;
  location_ids: number[] | null;
  criticality_ids: number[] | null;
  typology_ids: number[] | null;
  grouping_ids: number[] | null;
  owner_ids: number[] | null;
  urgency: RuleUrgency;
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
  stale_repeat_days: number | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAlertRule {
  name?: unknown;
  description?: unknown;
  categoryId?: unknown;
  toStatusId?: unknown;
  criticalOnly?: unknown;
  includeRecovery?: unknown;
  staleDays?: unknown;
  notifyImmediate?: unknown;
  active?: unknown;
  categoryIds?: unknown;
  fromStatusIds?: unknown;
  toStatusIds?: unknown;
  locationIds?: unknown;
  criticalityIds?: unknown;
  typologyIds?: unknown;
  groupingIds?: unknown;
  ownerIds?: unknown;
  urgency?: unknown;
  onlyNoActionPlan?: unknown;
  onTransition?: unknown;
  cooldownMinutes?: unknown;
  maxPerDay?: unknown;
  quietStartHour?: unknown;
  quietEndHour?: unknown;
  activeDays?: unknown;
  priority?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
  staleRepeatDays?: unknown;
}

// normalizeRuleName: trims and caps; throws as 400 on empty.
export function normalizeRuleName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("name must be a string");
  const name = raw.trim().slice(0, 200);
  if (!name) throw new Error("name must not be empty");
  return name;
}

// normalizeDescription: optional free text, capped.
export function normalizeDescription(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new Error("description must be a string");
  return raw.trim().slice(0, 2000);
}

// normalizeOptionalId: null/undefined stays null (means "all"); otherwise a
// non-negative integer id. Throws as 400 on anything else.
export function normalizeOptionalId(
  raw: unknown,
  field: string,
): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new Error(`${field} must be a non-negative integer or null`);
  }
  return raw;
}

// normalizeIdList: null/undefined/empty means "all" (stored as null);
// otherwise a deduped array of non-negative integer ids.
export function normalizeIdList(
  raw: unknown,
  field: string,
  opts: { min?: number; max?: number } = {},
): number[] | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw)) throw new Error(`${field} must be an array or null`);
  if (raw.length === 0) return null;
  const seen = new Set<number>();
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v)) {
      throw new Error(`${field} must be an array of integers`);
    }
    if (opts.min !== undefined && v < opts.min) {
      throw new Error(`${field} values must be >= ${opts.min}`);
    }
    if (opts.max !== undefined && v > opts.max) {
      throw new Error(`${field} values must be <= ${opts.max}`);
    }
    if (v < 0) throw new Error(`${field} values must be non-negative`);
    seen.add(v);
  }
  return [...seen].sort((a, b) => a - b);
}

// normalizeOptionalBoolean: undefined stays undefined (no change on PATCH).
export function normalizeOptionalBoolean(
  raw: unknown,
  field: string,
): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") throw new Error(`${field} must be a boolean`);
  return raw;
}

// normalizeStaleDays: null/undefined disables the time trigger.
export function normalizeStaleDays(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new Error("staleDays must be a positive integer or null");
  }
  return raw;
}

// normalizePositiveInt: null/undefined handling for throttle-style fields.
export function normalizePositiveInt(
  raw: unknown,
  field: string,
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(`${field} must be a positive integer or null`);
  }
  return raw;
}

// normalizeHour: 0-23 UTC hour or null (no bound).
export function normalizeHour(
  raw: unknown,
  field: string,
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (
    typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 23
  ) {
    throw new Error(`${field} must be an hour 0-23 or null`);
  }
  return raw;
}

// normalizeUrgency: any | urgent | critical.
export function normalizeUrgency(raw: unknown): RuleUrgency | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "any" && raw !== "urgent" && raw !== "critical") {
    throw new Error("urgency must be one of any, urgent, critical");
  }
  return raw;
}

// normalizePriority: integer (negative allowed for deprioritizing).
export function normalizePriority(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error("priority must be an integer");
  }
  if (raw < -1000 || raw > 1000) {
    throw new Error("priority must be between -1000 and 1000");
  }
  return raw;
}

// normalizeIsoDate: YYYY-MM-DD date or null.
export function normalizeIsoDate(
  raw: unknown,
  field: string,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${field} must be YYYY-MM-DD or null`);
  }
  const t = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`${field} must be a valid date`);
  return raw;
}

const COLUMNS =
  "id, name, category_id, to_status_id, critical_only, include_recovery, " +
  "stale_days, notify_immediate, active, " +
  "coalesce(description, '') as description, category_ids, from_status_ids, " +
  "to_status_ids, location_ids, criticality_ids, typology_ids, grouping_ids, " +
  "owner_ids, coalesce(urgency, 'any') as urgency, " +
  "coalesce(only_no_action_plan, false) as only_no_action_plan, " +
  "coalesce(on_transition, true) as on_transition, cooldown_minutes, " +
  "max_per_day, quiet_start_hour, quiet_end_hour, active_days, " +
  "coalesce(priority, 0) as priority, valid_from::text, valid_to::text, " +
  "stale_repeat_days, last_triggered_at::text, " +
  "created_at::text, updated_at::text";

function rowToRule(row: Record<string, unknown>): AlertRule {
  return {
    ...(row as unknown as AlertRule),
    description: (row.description as string) ?? "",
    urgency: ((row.urgency as string) ?? "any") as RuleUrgency,
    priority: Number(row.priority ?? 0),
    valid_from: row.valid_from != null
      ? String(row.valid_from).slice(0, 10)
      : null,
    valid_to: row.valid_to != null ? String(row.valid_to).slice(0, 10) : null,
    last_triggered_at: row.last_triggered_at != null
      ? String(row.last_triggered_at)
      : null,
  };
}

export async function listAlertRules(activeOnly = false): Promise<AlertRule[]> {
  const rows = await queryRows<Record<string, unknown>>(
    `select ${COLUMNS} from alert_rules
     ${activeOnly ? "where active" : ""} order by priority desc, id`,
  );
  return rows.map(rowToRule);
}

export async function getAlertRule(id: number): Promise<AlertRule | null> {
  const rows = await queryRows<Record<string, unknown>>(
    `select ${COLUMNS} from alert_rules where id = $1`,
    [id],
  );
  return rows[0] ? rowToRule(rows[0]) : null;
}

// buildInsert: shared column/value builder for create.
function buildRuleArgs(input: NewAlertRule): {
  columns: string[];
  values: unknown[];
} {
  return {
    columns: [
      "name",
      "category_id",
      "to_status_id",
      "critical_only",
      "include_recovery",
      "stale_days",
      "notify_immediate",
      "active",
      "description",
      "category_ids",
      "from_status_ids",
      "to_status_ids",
      "location_ids",
      "criticality_ids",
      "typology_ids",
      "grouping_ids",
      "owner_ids",
      "urgency",
      "only_no_action_plan",
      "on_transition",
      "cooldown_minutes",
      "max_per_day",
      "quiet_start_hour",
      "quiet_end_hour",
      "active_days",
      "priority",
      "valid_from",
      "valid_to",
      "stale_repeat_days",
    ],
    values: [
      normalizeRuleName(input.name),
      normalizeOptionalId(input.categoryId, "categoryId"),
      normalizeOptionalId(input.toStatusId, "toStatusId"),
      normalizeOptionalBoolean(input.criticalOnly, "criticalOnly") ?? false,
      normalizeOptionalBoolean(input.includeRecovery, "includeRecovery") ??
        false,
      normalizeStaleDays(input.staleDays) ?? null,
      normalizeOptionalBoolean(input.notifyImmediate, "notifyImmediate") ??
        false,
      normalizeOptionalBoolean(input.active, "active") ?? true,
      normalizeDescription(input.description) ?? "",
      normalizeIdList(input.categoryIds, "categoryIds") ?? null,
      normalizeIdList(input.fromStatusIds, "fromStatusIds") ?? null,
      normalizeIdList(input.toStatusIds, "toStatusIds") ?? null,
      normalizeIdList(input.locationIds, "locationIds") ?? null,
      normalizeIdList(input.criticalityIds, "criticalityIds") ?? null,
      normalizeIdList(input.typologyIds, "typologyIds") ?? null,
      normalizeIdList(input.groupingIds, "groupingIds") ?? null,
      normalizeIdList(input.ownerIds, "ownerIds") ?? null,
      normalizeUrgency(input.urgency) ?? "any",
      normalizeOptionalBoolean(input.onlyNoActionPlan, "onlyNoActionPlan") ??
        false,
      normalizeOptionalBoolean(input.onTransition, "onTransition") ?? true,
      normalizePositiveInt(input.cooldownMinutes, "cooldownMinutes") ?? null,
      normalizePositiveInt(input.maxPerDay, "maxPerDay") ?? null,
      normalizeHour(input.quietStartHour, "quietStartHour") ?? null,
      normalizeHour(input.quietEndHour, "quietEndHour") ?? null,
      normalizeIdList(input.activeDays, "activeDays", { min: 0, max: 6 }) ??
        null,
      normalizePriority(input.priority) ?? 0,
      normalizeIsoDate(input.validFrom, "validFrom") ?? null,
      normalizeIsoDate(input.validTo, "validTo") ?? null,
      normalizePositiveInt(input.staleRepeatDays, "staleRepeatDays") ?? null,
    ],
  };
}

// createAlertRule: inserts a validated rule; duplicate names surface as a
// unique-violation error the route turns into a 400.
export async function createAlertRule(input: NewAlertRule): Promise<AlertRule> {
  const { columns, values } = buildRuleArgs(input);
  const placeholders = values.map((_, i) => {
    const col = columns[i];
    if (col === "valid_from" || col === "valid_to") {
      return `$${i + 1}::date`;
    }
    return `$${i + 1}`;
  });
  const rows = await queryRows<Record<string, unknown>>(
    `insert into alert_rules (${columns.join(", ")})
     values (${placeholders.join(", ")})
     returning ${COLUMNS}`,
    values,
  );
  const created = rows[0];
  if (!created) throw new Error("createAlertRule returned no row");
  return rowToRule(created);
}

// updateAlertRule: partial update; empty patches throw as 400.
export async function updateAlertRule(
  id: number,
  patch: NewAlertRule,
): Promise<AlertRule | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const push = (expr: string, value: unknown) => {
    args.push(value);
    sets.push(`${expr} = $${args.length}`);
  };
  if (patch.name !== undefined) {
    push("name", normalizeRuleName(patch.name));
  }
  if (patch.description !== undefined) {
    push("description", normalizeDescription(patch.description) ?? "");
  }
  if (patch.categoryId !== undefined) {
    push("category_id", normalizeOptionalId(patch.categoryId, "categoryId"));
  }
  if (patch.toStatusId !== undefined) {
    push("to_status_id", normalizeOptionalId(patch.toStatusId, "toStatusId"));
  }
  if (patch.criticalOnly !== undefined) {
    push(
      "critical_only",
      normalizeOptionalBoolean(patch.criticalOnly, "criticalOnly"),
    );
  }
  if (patch.includeRecovery !== undefined) {
    push(
      "include_recovery",
      normalizeOptionalBoolean(patch.includeRecovery, "includeRecovery"),
    );
  }
  if (patch.staleDays !== undefined) {
    push("stale_days", normalizeStaleDays(patch.staleDays));
  }
  if (patch.notifyImmediate !== undefined) {
    push(
      "notify_immediate",
      normalizeOptionalBoolean(patch.notifyImmediate, "notifyImmediate"),
    );
  }
  if (patch.active !== undefined) {
    push("active", normalizeOptionalBoolean(patch.active, "active"));
  }
  if (patch.categoryIds !== undefined) {
    push("category_ids", normalizeIdList(patch.categoryIds, "categoryIds"));
  }
  if (patch.fromStatusIds !== undefined) {
    push(
      "from_status_ids",
      normalizeIdList(patch.fromStatusIds, "fromStatusIds"),
    );
  }
  if (patch.toStatusIds !== undefined) {
    push("to_status_ids", normalizeIdList(patch.toStatusIds, "toStatusIds"));
  }
  if (patch.locationIds !== undefined) {
    push("location_ids", normalizeIdList(patch.locationIds, "locationIds"));
  }
  if (patch.criticalityIds !== undefined) {
    push(
      "criticality_ids",
      normalizeIdList(patch.criticalityIds, "criticalityIds"),
    );
  }
  if (patch.typologyIds !== undefined) {
    push("typology_ids", normalizeIdList(patch.typologyIds, "typologyIds"));
  }
  if (patch.groupingIds !== undefined) {
    push("grouping_ids", normalizeIdList(patch.groupingIds, "groupingIds"));
  }
  if (patch.ownerIds !== undefined) {
    push("owner_ids", normalizeIdList(patch.ownerIds, "ownerIds"));
  }
  if (patch.urgency !== undefined) {
    push("urgency", normalizeUrgency(patch.urgency) ?? "any");
  }
  if (patch.onlyNoActionPlan !== undefined) {
    push(
      "only_no_action_plan",
      normalizeOptionalBoolean(patch.onlyNoActionPlan, "onlyNoActionPlan"),
    );
  }
  if (patch.onTransition !== undefined) {
    push(
      "on_transition",
      normalizeOptionalBoolean(patch.onTransition, "onTransition"),
    );
  }
  if (patch.cooldownMinutes !== undefined) {
    push(
      "cooldown_minutes",
      normalizePositiveInt(patch.cooldownMinutes, "cooldownMinutes"),
    );
  }
  if (patch.maxPerDay !== undefined) {
    push("max_per_day", normalizePositiveInt(patch.maxPerDay, "maxPerDay"));
  }
  if (patch.quietStartHour !== undefined) {
    push(
      "quiet_start_hour",
      normalizeHour(patch.quietStartHour, "quietStartHour"),
    );
  }
  if (patch.quietEndHour !== undefined) {
    push("quiet_end_hour", normalizeHour(patch.quietEndHour, "quietEndHour"));
  }
  if (patch.activeDays !== undefined) {
    push(
      "active_days",
      normalizeIdList(patch.activeDays, "activeDays", { min: 0, max: 6 }),
    );
  }
  if (patch.priority !== undefined) {
    push("priority", normalizePriority(patch.priority) ?? 0);
  }
  if (patch.validFrom !== undefined) {
    args.push(normalizeIsoDate(patch.validFrom, "validFrom"));
    sets.push(`valid_from = $${args.length}::date`);
  }
  if (patch.validTo !== undefined) {
    args.push(normalizeIsoDate(patch.validTo, "validTo"));
    sets.push(`valid_to = $${args.length}::date`);
  }
  if (patch.staleRepeatDays !== undefined) {
    push(
      "stale_repeat_days",
      normalizePositiveInt(patch.staleRepeatDays, "staleRepeatDays"),
    );
  }
  if (sets.length === 0) throw new Error("nothing to update");
  args.push(id);
  const rows = await queryRows<Record<string, unknown>>(
    `update alert_rules set ${sets.join(", ")} where id = $${args.length}
     returning ${COLUMNS}`,
    args,
  );
  return rows[0] ? rowToRule(rows[0]) : null;
}

export async function deleteAlertRule(id: number): Promise<boolean> {
  const rows = await queryRows<{ id: number }>(
    `delete from alert_rules where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}

// touchRuleTriggered: best-effort last-fire stamp for observability.
export async function touchRuleTriggered(id: number): Promise<void> {
  await queryRows(
    `update alert_rules set last_triggered_at = now() where id = $1`,
    [
      id,
    ],
  );
}

// countRuleEventsSince: anti-noise helper - events already fired by this rule
// for a barrier since a timestamp (payload.ruleId match).
export async function countRuleEventsSince(
  ruleId: number,
  barrierId: number,
  sinceIso: string,
): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `select count(*)::text as n from alert_events
     where barrier_id = $1
       and (payload->>'ruleId')::int = $2
       and created_at >= $3::timestamptz`,
    [barrierId, ruleId, sinceIso],
  );
  return Number(rows[0]?.n ?? 0);
}

// listStaleBarriers: barriers still non-compliant for at least staleDays.
// The detector turns these into kind=stale events with their own dedup keys.
export async function listStaleBarriers(
  staleDays: number,
): Promise<{ id: number; categoryId: number; statusSince: string }[]> {
  const rows = await queryRows<
    { id: number; category_id: number; since: string }
  >(
    `select b.id as id, b.category_id as category_id,
            b.status_since::text as since
     from barriers b
     where b.deleted_at is null and b.compliance_id = 1
       and b.status_since <= (current_date - ($1::int * interval '1 day'))`,
    [staleDays],
  );
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    statusSince: r.since.slice(0, 10),
  }));
}
