// Vocabularies repository - dynamic filter option lists for server mode.
// This is why it exists: the server-paginated dashboard cannot derive filter
// vocabularies client-side, so SQL returns display labels directly (dynamic
// stations, statuses, and categories appear with no code change).
import type { Vocabularies } from "../../types.ts";
import { queryRows } from "../db.ts";

// Distinct display labels plus per-station counts in one parallel batch.
export async function getVocabularies(): Promise<Vocabularies> {
  const [locRows, dispRows, confRows, catRows] = await Promise.all([
    queryRows<{ code: string; count: string }>(
      `select loc.code as code, count(b.id)::text as count
       from locations loc left join barriers b on b.location_id = loc.id
       group by loc.code order by loc.code`,
    ),
    queryRows<{ label: string }>(
      `select distinct disp.label as label from barriers b
       join disponibilidades disp on disp.id = b.disponibilidade_id
       order by disp.label`,
    ),
    queryRows<{ label: string }>(
      `select distinct case when disp.is_conforme then 'Conforme'
         else 'Não Conforme' end as label
       from barriers b
       join disponibilidades disp on disp.id = b.disponibilidade_id
       order by label`,
    ),
    queryRows<{ label: string }>(
      `select distinct cat.label as label from barriers b
       join categorias cat on cat.id = b.categoria_id
       order by cat.label`,
    ),
  ]);
  return {
    locations: locRows.map((r) => ({ code: r.code, count: Number(r.count) })),
    disponibilidades: dispRows.map((r) => r.label),
    conformidades: confRows.map((r) => r.label),
    categorias: catRows.map((r) => r.label),
  };
}
