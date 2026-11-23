// Alert rule helper types and pure helpers extracted from RulesManager.
export interface AlertRule {
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

export interface LookupOpt {
  id: number;
  label: string;
}

export interface Lookups {
  availabilities: LookupOpt[];
  categories: LookupOpt[];
  locations: { id: number; code: string; name: string | null }[];
  criticalities: LookupOpt[];
  typologies: LookupOpt[];
  groupings: LookupOpt[];
  owners: LookupOpt[];
}

export interface Draft {
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

export const EMPTY_DRAFT: Draft = {
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

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

// numCoercionError: field-level feedback for numeric rule inputs. numOrNull
// silently maps "abc" to null (payload drops the value); callers use this to
// show "não é um número inteiro" next to the offending field instead.
export function numCoercionError(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n)) return `"${raw}" não é um número inteiro válido`;
  return null;
}

export function draftToPayload(d: Draft): Record<string, unknown> {
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

export function ruleToDraft(r: AlertRule): Draft {
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

export function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// numListsDiffer: order-sensitive id list compare (multi-selects keep
// click order; a different order was a different user action).
function numListsDiffer(a: number[], b: number[]): boolean {
  return a.length !== b.length || a.some((x, i) => x !== b[i]);
}

// draftsDiffer: dirty check for the rule editor. The editor keeps a large
// multi-tab draft, so the close guard compares it against the baseline
// loaded from the server row (or EMPTY_DRAFT on create). Exported pure so
// the regression tests cover the exact comparison.
export function draftsDiffer(a: Draft, b: Draft): boolean {
  return (
    a.name !== b.name ||
    a.description !== b.description ||
    a.urgency !== b.urgency ||
    numListsDiffer(a.categoryIds, b.categoryIds) ||
    numListsDiffer(a.fromStatusIds, b.fromStatusIds) ||
    numListsDiffer(a.toStatusIds, b.toStatusIds) ||
    numListsDiffer(a.locationIds, b.locationIds) ||
    numListsDiffer(a.criticalityIds, b.criticalityIds) ||
    numListsDiffer(a.typologyIds, b.typologyIds) ||
    numListsDiffer(a.groupingIds, b.groupingIds) ||
    numListsDiffer(a.ownerIds, b.ownerIds) ||
    a.includeRecovery !== b.includeRecovery ||
    a.onTransition !== b.onTransition ||
    a.onlyNoActionPlan !== b.onlyNoActionPlan ||
    a.criticalOnly !== b.criticalOnly ||
    a.staleDays !== b.staleDays ||
    a.staleRepeatDays !== b.staleRepeatDays ||
    a.cooldownMinutes !== b.cooldownMinutes ||
    a.maxPerDay !== b.maxPerDay ||
    a.quietStart !== b.quietStart ||
    a.quietEnd !== b.quietEnd ||
    numListsDiffer(a.activeDays, b.activeDays) ||
    a.priority !== b.priority ||
    a.validFrom !== b.validFrom ||
    a.validTo !== b.validTo ||
    a.notifyImmediate !== b.notifyImmediate ||
    a.active !== b.active
  );
}
