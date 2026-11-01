// Vocabularies repository - dynamic filter option lists for server mode.
// This is why it exists: the server-paginated dashboard cannot derive filter
// vocabularies client-side, so SQL returns display labels directly (dynamic
// stations, statuses, and categories appear with no code change).
import type { Vocabularies } from "../../types.ts";
import { queryRows } from "../db.ts";
import { memoGetOrCompute } from "../cache.ts";

// Resolver labels: lean id->label maps from the lookup tables so server-side
// consumers (CSV export) resolve real imported values instead of seed-enum
// sentinels. Shape matches ResolverLabels (lib/resolve.ts) structurally.
// 60s memo: lookup tables change on import only; per-cycle reloads share it.
export async function getResolverLabels(): Promise<{
  locations: Record<number, string>;
  categories: Record<number, string>;
  typologies: Record<number, string>;
  groupings: Record<number, string>;
  owners: Record<number, string>;
  locDescs: Record<number, string>;
  authors: Record<number, string>;
}> {
  return await memoGetOrCompute("resolver-labels", 60_000, async () => {
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
  });
}

// Distinct display labels plus per-station counts in a collapsed batch.
// Availability/compliance/criticality come from ONE grouped scan (same
// filter subset, three GROUP BY keys) instead of three separate DISTINCT
// scans; categories/typologies ride one UNION ALL statement (two scans,
// one trip). Locations keep their counted query, authors stay a tiny
// lookup-table read. 4 statements / 4 scans vs 7 statements / 6 scans.
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

  const arg = Array.isArray(allowed) ? allowed : null;
  const eff =
    `(case when b.availability_id in (4, 5) and lower(trim(coalesce(b.has_contingency, ''))) = 'sim' then case when b.availability_id = 4 then 3 else 2 end else b.availability_id end)`;
  const [locRows, comboRows, catTypRows, authorRows] = await Promise.all([
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
    // One scan: availability label + compliance label + criticality label
    // grouped together, split client-side into three distinct lists.
    queryRows<{ avail: string; conf: string; crit: string }>(
      `select disp.label as avail,
        (case when ${eff} in (0, 1, 2, 3) then 'Conforme' else 'Não Conforme' end) as conf,
        crit.label as crit
       from barriers b
       join availability_statuses disp on disp.id = ${eff}
       join criticality_levels crit on crit.id = b.criticality_id
       where b.deleted_at is null
         and ($1::int[] is null or b.location_id = any($1::int[]))
       group by disp.label, 2, crit.label`,
      [arg],
    ),
    // One statement, two grouped branches (tag + concat, grouped once
    // outside like the KPI buckets): categories and typologies.
    queryRows<{ grp: string; id: string; label: string }>(
      `select grp, id, label from (
        select 'cat' as grp, cat.id::text as id, cat.label as label
        from barriers b
        join categories cat on cat.id = b.category_id
        where b.deleted_at is null
          and ($1::int[] is null or b.location_id = any($1::int[]))
        group by cat.id, cat.label
        union all
        select 'typ' as grp, typ.id::text as id, typ.label as label
        from barriers b
        join typologies typ on typ.id = b.typology_id
        where b.deleted_at is null
          and ($1::int[] is null or b.location_id = any($1::int[]))
        group by typ.id, typ.label
      ) g order by label`,
      [arg],
    ),
    queryRows<{ id: number; name: string }>(
      `select id, name from authors order by name`,
    ),
  ]);
  const availSet = new Map<string, true>();
  const confSet = new Map<string, true>();
  const critSet = new Map<string, true>();
  for (const r of comboRows) {
    if (r.avail) availSet.set(r.avail, true);
    if (r.conf) confSet.set(r.conf, true);
    if (r.crit) critSet.set(r.crit, true);
  }
  const catRows = catTypRows.filter((r) => r.grp === "cat").map((r) => ({
    id: Number(r.id),
    label: r.label,
  }));
  const typRows = catTypRows.filter((r) => r.grp === "typ").map((r) => ({
    id: Number(r.id),
    label: r.label,
  }));
  return {
    locations: locRows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      count: Number(r.count),
    })),
    availabilities: [...availSet.keys()].sort(),
    compliances: [...confSet.keys()].sort(),
    criticalities: [...critSet.keys()].sort(),
    categories: catRows,
    typologies: typRows,
    authors: authorRows.map((r) => ({ id: r.id, name: r.name })),
  };
}
