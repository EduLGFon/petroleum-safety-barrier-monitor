// Chart repository - per-category Conforme totals for the dashboard chart.
// This is why it exists: the server-paginated dashboard cannot aggregate the
// chart client-side, so SQL groups by category_id. nonCompliant is derived as
// total - compliant (fail-closed novel handling, same as computeChartData).
import type { WireCategoryCompliance } from "../../wireTypes.ts";
import { queryRows } from "../db.ts";

// Per-category Conforme totals, optionally scoped; biggest volume first.
export async function getChartData(
  locationId?: number,
): Promise<WireCategoryCompliance[]> {
  const scoped = locationId !== undefined && locationId !== 0;
  const rows = await queryRows<{
    category_id: string;
    compliant: string;
    total: string;
  }>(
    `select b.category_id::text as category_id,
       count(*) filter (where b.compliance_id = 0)::text as compliant,
       count(*)::text as total
     from barriers b ${
      scoped
        ? "where b.deleted_at is null and b.location_id = $1"
        : "where b.deleted_at is null"
    }
     group by b.category_id order by count(*) desc`,
    scoped ? [locationId] : [],
  );
  return rows.map((r) => ({
    categoryId: Number(r.category_id),
    compliant: Number(r.compliant ?? 0),
    total: Number(r.total ?? 0),
  }));
}
