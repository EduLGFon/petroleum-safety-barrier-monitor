// Chart repository - per-category Conforme totals for the dashboard chart.
// This is why it exists: the server-paginated dashboard cannot aggregate the
// chart client-side, so SQL groups by categoria_id. naoConforme is derived as
// total - conforme (fail-closed novel handling, same as computeChartData).
import type { WireCategoryConformidade } from "../../wireTypes.ts";
import { queryRows } from "../db.ts";

// Per-category Conforme totals, optionally scoped; biggest volume first.
export async function getChartData(
  locationId?: number,
): Promise<WireCategoryConformidade[]> {
  const scoped = locationId !== undefined && locationId !== 0;
  const rows = await queryRows<{
    categoria_id: string;
    conforme: string;
    total: string;
  }>(
    `select b.categoria_id::text as categoria_id,
       count(*) filter (where b.conformidade_id = 0)::text as conforme,
       count(*)::text as total
     from barriers b ${scoped ? "where b.location_id = $1" : ""}
     group by b.categoria_id order by count(*) desc`,
    scoped ? [locationId] : [],
  );
  return rows.map((r) => ({
    categoriaId: Number(r.categoria_id),
    conforme: Number(r.conforme ?? 0),
    total: Number(r.total ?? 0),
  }));
}
