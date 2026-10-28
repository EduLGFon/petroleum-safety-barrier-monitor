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
  typologies: Record<number, string>;
  groupings: Record<number, string>;
  owners: Record<number, string>;
  locDescs: Record<number, string>;
  authors: Record<number, string>;
}> {
  const [
    locRows,
    catRows,
    typRows,
    grpRows,
    ownRows,
    locDescRows,
    authorRows,
  ] = await Promise.all([
    queryRows<{ id: number; code: string }>(
      `select id, code from locations`,
    ),
    queryRows<{ id: number; label: string }>(
      `select id, label from categories`,
    ),
    queryRows<{ id: number; label: string }>(
      `select id, label from typologies`,
    ),
    queryRows<{ id: number; label: string }>(
      `select id, label from groupings`,
    ),
    queryRows<{ id: number; label: string }>(
      `select id, label from owners`,
    ),
    queryRows<{ id: number; label: string }>(
      `select id, label from loc_descs`,
    ),
    queryRows<{ id: number; name: string }>(
      `select id, name from authors`,
    ),
  ]);
  return {
    locations: Object.fromEntries(locRows.map((r) => [r.id, r.code])),
    categories: Object.fromEntries(catRows.map((r) => [r.id, r.label])),
    typologies: Object.fromEntries(typRows.map((r) => [r.id, r.label])),
    groupings: Object.fromEntries(grpRows.map((r) => [r.id, r.label])),
    owners: Object.fromEntries(ownRows.map((r) => [r.id, r.label])),
    locDescs: Object.fromEntries(locDescRows.map((r) => [r.id, r.label])),
    authors: Object.fromEntries(authorRows.map((r) => [r.id, r.name])),
  };
}

// Distinct display labels plus per-station counts in one parallel batch.
// Station names ride along for hover tooltips (null falls back to code);
// codes stay the filter keys everywhere.
export async function getVocabularies(
  allowedLocationIds?: number[] | null,
): Promise<Vocabularies> {
  const allowed = allowedLocationIds === undefined ? null : allowedLocationIds;
  if (Array.isArray(allowed) && allowed.length === 0) {
    return {
      locations: [],
      availabilities: [],
      compliances: [],
      criticalities: [],
      categories: [],
      typologies: [],
      authors: [],
    };
  }
  const locFilter = Array.isArray(allowed)
    ? `where loc.id = any($1::int[])`
    : "";
  const barrierFilter = Array.isArray(allowed)
    ? `and b.location_id = any($1::int[])`
    : "";
  const arg = Array.isArray(allowed) ? allowed : null;
  const [locRows, dispRows, confRows, critRows, catRows, typRows, authorRows] =
    await Promise.all([
      queryRows<{ id: number; code: string; name: string; count: string }>(
        `select loc.id as id, loc.code as code,
        coalesce(loc.name, loc.code) as name, count(b.id)::text as count
       from locations loc
       left join barriers b on b.location_id = loc.id and b.deleted_at is null
       where ($1::int[] is null or loc.id = any($1::int[]))
       group by loc.id, loc.code, loc.name
       order by count(b.id) desc, loc.code`,
        [arg],
      ),
      queryRows<{ label: string }>(
        `select distinct disp.label as label from barriers b
        join availability_statuses disp on disp.id = (case when b.availability_id in (4, 5) and lower(trim(coalesce(b.has_contingency, ''))) = 'sim' then case when b.availability_id = 4 then 3 else 2 end else b.availability_id end)
        where b.deleted_at is null
          and ($1::int[] is null or b.location_id = any($1::int[]))
        order by disp.label`,
        [arg],
      ),
      queryRows<{ label: string }>(
        `select distinct case when (case when b.availability_id in (4, 5) and lower(trim(coalesce(b.has_contingency, ''))) = 'sim' then case when b.availability_id = 4 then 3 else 2 end else b.availability_id end) in (0, 1, 2, 3) then 'Conforme'
         else 'Não Conforme' end as label
        from barriers b
        where b.deleted_at is null
          and ($1::int[] is null or b.location_id = any($1::int[]))
        order by label`,
        [arg],
      ),
      queryRows<{ label: string }>(
        `select distinct crit.label as label from barriers b
       join criticality_levels crit on crit.id = b.criticality_id
       where b.deleted_at is null
         and ($1::int[] is null or b.location_id = any($1::int[]))
       order by crit.label`,
        [arg],
      ),
      queryRows<{ id: number; label: string }>(
        `select distinct cat.id as id, cat.label as label from barriers b
        join categories cat on cat.id = b.category_id
        where b.deleted_at is null
          and ($1::int[] is null or b.location_id = any($1::int[]))
        order by cat.label`,
        [arg],
      ),
      queryRows<{ id: number; label: string }>(
        `select distinct typ.id as id, typ.label as label from barriers b
        join typologies typ on typ.id = b.typology_id
        where b.deleted_at is null
          and ($1::int[] is null or b.location_id = any($1::int[]))
        order by typ.label`,
        [arg],
      ),
      queryRows<{ id: number; name: string }>(
        `select id, name from authors order by name`,
      ),
    ]);
  return {
    locations: locRows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      count: Number(r.count),
    })),
    availabilities: dispRows.map((r) => r.label),
    compliances: confRows.map((r) => r.label),
    criticalities: critRows.map((r) => r.label),
    categories: catRows.map((r) => ({ id: r.id, label: r.label })),
    typologies: typRows.map((r) => ({ id: r.id, label: r.label })),
    authors: authorRows.map((r) => ({ id: r.id, name: r.name })),
  };
}
