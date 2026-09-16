// Chart repository - per-category Conforme totals for the dashboard chart.
// This is why it exists: the server-paginated dashboard cannot aggregate the
// chart client-side, so SQL groups by category_id. nonCompliant is derived as
// total - compliant (fail-closed novel handling, same as computeChartData).
import type { BarriersQuery, WireCategoryCompliance } from "../../wireTypes.ts";
import { buildWhere } from "./where.ts";
import { queryRows } from "../db.ts";

// Per-category Conforme totals over the given filters (location-only callers
// pass a bare id, which keeps the old call shape working); biggest first.
export async function getChartData(
  filter?: number | BarriersQuery,
): Promise<WireCategoryCompliance[]> {
  const q: BarriersQuery = typeof filter === "number"
    ? { locationId: filter }
    : filter ?? {};
  const where = buildWhere(q);
  const rows = await queryRows<{
    category_id: string;
    compliant: string;
    total: string;
  }>(
    `select b.category_id::text as category_id,
       count(*) filter (where b.compliance_id = 0)::text as compliant,
       count(*)::text as total
     from barriers b join locations loc on loc.id = b.location_id ${where.text}
     group by b.category_id order by count(*) desc`,
    where.args,
  );
  return rows.map((r) => ({
    categoryId: Number(r.category_id),
    compliant: Number(r.compliant ?? 0),
    total: Number(r.total ?? 0),
  }));
}
