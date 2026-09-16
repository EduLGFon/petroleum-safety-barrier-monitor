// Vocabularies repository - dynamic filter option lists for server mode.
// This is why it exists: the server-paginated dashboard cannot derive filter
// vocabularies client-side, so SQL returns display labels directly (dynamic
// stations, statuses, and categories appear with no code change).
import type { Vocabularies } from "../../types.ts";
import { queryRows } from "../db.ts";

// Resolver labels: lean id->label maps from the lookup tables so server-side
// consumers (CSV export) resolve real imported values instead of seed-enum
// sentinels. Shape matches ResolverLabels (lib/resolve.ts) structurally.
export async function getResolverLabels(): Promise<{
  locations: Record<number, string>;
  categories: Record<number, string>;
}> {
  const [locRows, catRows] = await Promise.all([
    queryRows<{ id: number; code: string }>(
      `select id, code from locations`,
    ),
    queryRows<{ id: number; label: string }>(
      `select id, label from categories`,
    ),
  ]);
  return {
    locations: Object.fromEntries(locRows.map((r) => [r.id, r.code])),
    categories: Object.fromEntries(catRows.map((r) => [r.id, r.label])),
  };
}

// Distinct display labels plus per-station counts in one parallel batch.
export async function getVocabularies(): Promise<Vocabularies> {
  const [locRows, dispRows, confRows, catRows] = await Promise.all([
    queryRows<{ id: number; code: string; count: string }>(
      `select loc.id as id, loc.code as code, count(b.id)::text as count
       from locations loc
       left join barriers b on b.location_id = loc.id and b.deleted_at is null
       group by loc.id, loc.code order by loc.code`,
    ),
    queryRows<{ label: string }>(
      `select distinct disp.label as label from barriers b
       join availability_statuses disp on disp.id = b.availability_id
       where b.deleted_at is null
       order by disp.label`,
    ),
    queryRows<{ label: string }>(
      `select distinct case when disp.is_compliant then 'Conforme'
         else 'Não Conforme' end as label
       from barriers b
       join availability_statuses disp on disp.id = b.availability_id
       where b.deleted_at is null
       order by label`,
    ),
    queryRows<{ id: number; label: string }>(
      `select distinct cat.id as id, cat.label as label from barriers b
       join categories cat on cat.id = b.category_id
       where b.deleted_at is null
       order by cat.label`,
    ),
  ]);
  return {
    locations: locRows.map((r) => ({
      id: r.id,
      code: r.code,
      count: Number(r.count),
    })),
    availabilities: dispRows.map((r) => r.label),
    compliances: confRows.map((r) => r.label),
    categories: catRows.map((r) => ({ id: r.id, label: r.label })),
  };
}
