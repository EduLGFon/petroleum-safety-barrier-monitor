// SQL WHERE/ORDER helpers - whitelist sorting and filter building for barriers.
// This is why it exists: keeps client-controlled sort/search from becoming SQL
// by centralizing the fixed column map and bound-arg WHERE construction.
import { CRITICALITY_A, CRITICALITY_ESO } from "../fracttal/barrier-rules.ts";

import type { BarriersQuery } from "../../wireTypes.ts";

// Maps frontend SortableColumn values (lib/types.ts) to fixed SQL.
// Never derive this from user input.
export const SORTABLE: Record<string, string> = {
  id: "b.id",
  tag: "b.tag",
  location: "loc.code",
  typology: "b.typology_id",
  criticality: "b.criticality_id",
  category: "b.category_id",
  owner: "b.owner_id",
  availability: "b.availability_id",
  compliance: "b.compliance_id",
  statusSince: "b.status_since",
};

// Resolves client sortCol/sortDir to a whitelisted ORDER BY fragment.
export function resolveOrderBy(sortCol?: string, sortDir?: string): string {
  const col = SORTABLE[sortCol ?? "id"] ?? SORTABLE.id;
  const dir = sortDir === "desc" ? "desc" : "asc";
  // Safe: both parts come from fixed strings above and a two-value check.
  return `${col} ${dir}`;
}

// Escapes LIKE wildcards so search text matches literally, not as a pattern.
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Builds WHERE text plus bound args. Placeholders are numbered from $1.
export function buildWhere(
  q: BarriersQuery,
): { text: string; args: unknown[] } {
  const conds: string[] = [];
  const args: unknown[] = [];
  const push = (text: string, value: unknown) => {
    args.push(value);
    conds.push(`${text}$${args.length}`);
  };
  if (q.locationId !== undefined && q.locationId !== 0) {
    push("and b.location_id = ", q.locationId);
  }
  if (q.availabilityId !== undefined) {
    push("and b.availability_id = ", q.availabilityId);
  }
  if (q.complianceId !== undefined) {
    push("and b.compliance_id = ", q.complianceId);
  }
  if (q.categoryId !== undefined) {
    push("and b.category_id = ", q.categoryId);
  }
  if (q.typologyId !== undefined) {
    push("and b.typology_id = ", q.typologyId);
  }
  if (q.criticalityId !== undefined) {
    push("and b.criticality_id = ", q.criticalityId);
  }
  // Row whitelist (export selection). Passed as one array parameter so an
  // 18k-row selection costs a single bind instead of 18k placeholders.
  if (q.ids && q.ids.length > 0) {
    args.push(q.ids);
    conds.push(`and b.id = any($${args.length})`);
  }
  if (q.hasActionPlan === true) {
    conds.push("and b.action_plan is not null and b.action_plan <> ''");
  } else if (q.hasActionPlan === false) {
    conds.push("and (b.action_plan is null or b.action_plan = '')");
  }
  // Rank gate: critical tiers only (ESO/A). Absent means every rank, so old
  // clients without the toggle keep the unfiltered behavior.
  if (q.criticalOnly === true) {
    args.push(CRITICALITY_ESO, CRITICALITY_A);
    const a = args.length - 1;
    const b = args.length;
    conds.push(`and b.criticality_id in ($${a}, $${b})`);
  }
  if (q.query) {
    const lit = `%${escapeLike(q.query)}%`;
    args.push(lit, lit);
    const a = args.length - 1;
    const b = args.length;
    conds.push(
      `and (b.tag ilike $${a} escape '\\' or loc.code ilike $${b} escape '\\')`,
    );
  }
  // Date bounds are inclusive YYYY-MM-DD on the date column. The explicit
  // ::date cast keeps text-typed bound params comparing as dates (not text),
  // so same-day Desde/Até ranges include that day instead of missing by
  // collation/timezone coercion.
  if (q.since) {
    args.push(q.since);
    conds.push(`and b.status_since >= $${args.length}::date`);
  }
  if (q.until) {
    args.push(q.until);
    conds.push(`and b.status_since <= $${args.length}::date`);
  }
  // Row visibility scope (admin Situacao filter). Default hides both
  // disabled and soft-deleted rows; each scope keeps the clause first so
  // every barrier query inherits it without callers remembering it.
  // includeDeleted stays as a legacy alias for deleted-only callers.
  const scope = resolveRowScope(q);
  const scopeText = scope === "deleted"
    ? "where b.deleted_at is not null"
    : scope === "inactive"
    ? "where b.deleted_at is null and not coalesce(b.is_active, true)"
    : scope === "all"
    ? "where true"
    : "where b.deleted_at is null and coalesce(b.is_active, true)";
  return {
    text: `${scopeText}${conds.length > 0 ? ` ${conds.join(" ")}` : ""}`,
    args,
  };
}

// resolveRowScope: canonical scope for a query. rowScope wins; legacy
// includeDeleted maps to deleted; absent means active.
export function resolveRowScope(q: BarriersQuery): string {
  if (q.rowScope !== undefined) return q.rowScope;
  if (q.includeDeleted === true) return "deleted";
  return "active";
}
