// SQL WHERE/ORDER helpers - whitelist sorting and filter building for barriers.
// This is why it exists: keeps client-controlled sort/search from becoming SQL
// by centralizing the fixed column map and bound-arg WHERE construction.
import type { BarriersQuery } from "../../wireTypes.ts";

// Maps frontend SortableColumn values (lib/types.ts) to fixed SQL.
// Never derive this from user input.
export const SORTABLE: Record<string, string> = {
  id: "b.id",
  tag: "b.tag",
  criticality: "b.criticality_id",
  category: "b.category_id",
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
  if (q.criticalityId !== undefined) {
    push("and b.criticality_id = ", q.criticalityId);
  }
  if (q.hasActionPlan === true) {
    conds.push("and b.action_plan is not null and b.action_plan <> ''");
  } else if (q.hasActionPlan === false) {
    conds.push("and (b.action_plan is null or b.action_plan = '')");
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
  if (q.since) push("and b.status_since >= ", q.since);
  if (q.until) push("and b.status_since <= ", q.until);
  // Soft-delete scope: default views hide deleted rows; the admin deleted
  // listing (GET /api/barriers/deleted) flips to deleted-only. Keeps the
  // clause first so every barrier query inherits the filter without callers
  // remembering it.
  const scope = q.includeDeleted === true
    ? "where b.deleted_at is not null"
    : "where b.deleted_at is null";
  return {
    text: `${scope}${conds.length > 0 ? ` ${conds.join(" ")}` : ""}`,
    args,
  };
}
