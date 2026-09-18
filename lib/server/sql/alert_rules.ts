// Alert rules SQL - which events trigger email, per category.
// This is why it exists: admins enable or disable alerts by category and
// define what fires (status landing, critical-only, recovery, stale days,
// immediate vs digest). The detector reads active rows; the routes guard
// writes behind admin auth.
import { queryRows } from "../db.ts";

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
  created_at: string;
  updated_at: string;
}

export interface NewAlertRule {
  name: unknown;
  categoryId?: unknown;
  toStatusId?: unknown;
  criticalOnly?: unknown;
  includeRecovery?: unknown;
  staleDays?: unknown;
  notifyImmediate?: unknown;
  active?: unknown;
}

// normalizeRuleName: trims and caps; throws as 400 on empty.
export function normalizeRuleName(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("name must be a string");
  const name = raw.trim().slice(0, 200);
  if (!name) throw new Error("name must not be empty");
  return name;
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

const COLUMNS =
  "id, name, category_id, to_status_id, critical_only, include_recovery, " +
  "stale_days, notify_immediate, active, created_at::text, updated_at::text";

export async function listAlertRules(activeOnly = false): Promise<AlertRule[]> {
  return await queryRows<AlertRule>(
    `select ${COLUMNS} from alert_rules
     ${activeOnly ? "where active" : ""} order by id`,
  );
}

export async function getAlertRule(id: number): Promise<AlertRule | null> {
  const rows = await queryRows<AlertRule>(
    `select ${COLUMNS} from alert_rules where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// createAlertRule: inserts a validated rule; duplicate names surface as a
// unique-violation error the route turns into a 400.
export async function createAlertRule(input: NewAlertRule): Promise<AlertRule> {
  const rows = await queryRows<AlertRule>(
    `insert into alert_rules
      (name, category_id, to_status_id, critical_only, include_recovery,
       stale_days, notify_immediate, active)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning ${COLUMNS}`,
    [
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
    ],
  );
  const created = rows[0];
  if (!created) throw new Error("createAlertRule returned no row");
  return created;
}

// updateAlertRule: partial update; empty patches throw as 400.
export async function updateAlertRule(
  id: number,
  patch: NewAlertRule,
): Promise<AlertRule | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    args.push(normalizeRuleName(patch.name));
    sets.push(`name = $${args.length}`);
  }
  if (patch.categoryId !== undefined) {
    args.push(normalizeOptionalId(patch.categoryId, "categoryId"));
    sets.push(`category_id = $${args.length}`);
  }
  if (patch.toStatusId !== undefined) {
    args.push(normalizeOptionalId(patch.toStatusId, "toStatusId"));
    sets.push(`to_status_id = $${args.length}`);
  }
  if (patch.criticalOnly !== undefined) {
    args.push(normalizeOptionalBoolean(patch.criticalOnly, "criticalOnly"));
    sets.push(`critical_only = $${args.length}`);
  }
  if (patch.includeRecovery !== undefined) {
    args.push(
      normalizeOptionalBoolean(patch.includeRecovery, "includeRecovery"),
    );
    sets.push(`include_recovery = $${args.length}`);
  }
  if (patch.staleDays !== undefined) {
    args.push(normalizeStaleDays(patch.staleDays));
    sets.push(`stale_days = $${args.length}`);
  }
  if (patch.notifyImmediate !== undefined) {
    args.push(
      normalizeOptionalBoolean(patch.notifyImmediate, "notifyImmediate"),
    );
    sets.push(`notify_immediate = $${args.length}`);
  }
  if (patch.active !== undefined) {
    args.push(normalizeOptionalBoolean(patch.active, "active"));
    sets.push(`active = $${args.length}`);
  }
  if (sets.length === 0) throw new Error("nothing to update");
  args.push(id);
  const rows = await queryRows<AlertRule>(
    `update alert_rules set ${sets.join(", ")} where id = $${args.length}
     returning ${COLUMNS}`,
    args,
  );
  return rows[0] ?? null;
}

export async function deleteAlertRule(id: number): Promise<boolean> {
  const rows = await queryRows<{ id: number }>(
    `delete from alert_rules where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
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
