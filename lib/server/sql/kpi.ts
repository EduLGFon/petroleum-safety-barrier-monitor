// KPI SQL - one snapshot per filtered scope.
// Split out of barriers.ts; the list/detail/write path re-exports getKpi.
import type { BarriersQuery, WireKpiSnapshot } from "../../wireTypes.ts";
import { queryRows } from "../db.ts";
import { buildWhere } from "./where.ts";

export async function getKpi(
  filter?: number | BarriersQuery,
  opts: { scopeCounts?: boolean } = {},
): Promise<WireKpiSnapshot> {
  const q: BarriersQuery = typeof filter === "number"
    ? { locationId: filter }
    : filter ?? {};
  const where = buildWhere(q);
  const from =
    `from barriers b join locations loc on loc.id = b.location_id ${where.text}`;
  // Scope-wide visibility counts ignore rowScope but keep every other
  // filter, so the band segments match the table they shortcut to.
  const scopeWhere = opts.scopeCounts
    ? buildWhere({ ...q, rowScope: "all" })
    : null;
  // Effective availability (docs/STATUSES.md display overlay, mirrors
  // effectiveAvailabilityId): stored 4/5 with Há Contingência?=Sim read as
  // 3/2. Fixed counts, buckets and compliance all derive from it so the
  // server snapshot matches resolveBarrier on the client.
  const eff = `effective_availability_id(b.availability_id, b.has_contingency)`;
  const effCompliant = `(${eff} in (0, 1, 2, 3))`;
  const [rows, bucketRows] = await Promise.all([
    queryRows<{
      total: string;
      available: string;
      out_of_service: string;
      contingency_outage: string;
      degraded_contingency: string;
      degraded: string;
      unavailable: string;
      other: string;
      compliant: string;
      non_compliant: string;
      critical_non_compliant: string;
      without_action_plan: string;
    }>(
      `select
        count(*)::text as total,
        count(*) filter (where ${eff} = 0 and coalesce(b.is_active, true) and b.deleted_at is null)::text as available,
        count(*) filter (where ${eff} = 1 and coalesce(b.is_active, true) and b.deleted_at is null)::text as out_of_service,
        count(*) filter (where ${eff} = 2 and coalesce(b.is_active, true) and b.deleted_at is null)::text as contingency_outage,
        count(*) filter (where ${eff} = 3 and coalesce(b.is_active, true) and b.deleted_at is null)::text as degraded_contingency,
        count(*) filter (where ${eff} = 4 and coalesce(b.is_active, true) and b.deleted_at is null)::text as degraded,
        count(*) filter (where ${eff} = 5 and coalesce(b.is_active, true) and b.deleted_at is null)::text as unavailable,
        count(*) filter (where ${eff} not in (0, 1, 2, 3, 4, 5)
          or not coalesce(b.is_active, true) or b.deleted_at is not null)::text as other,
        count(*) filter (where ${effCompliant})::text as compliant,
        count(*) filter (where not ${effCompliant})::text as non_compliant,
        count(*) filter (where not ${effCompliant} and b.criticality_id in (0, 1))::text as critical_non_compliant,
        count(*) filter (where b.action_plan is null or b.action_plan = '')::text as without_action_plan
      from barriers b join locations loc on loc.id = b.location_id ${where.text}`,
      where.args,
    ),
    // One round-trip for all four dynamic buckets: each branch is the
    // previous GROUP BY verbatim (same filter subset, same fail-closed NC
    // definition), tagged and concatenated, grouped once outside.
    // NOTE: ${from} already contains the WHERE clause; the fourth branch
    // appends AND so its filter subset stays identical to the old query.
    queryRows<{ grp: string; id: string; count: string }>(
      `select grp, id, count(*)::text as count from (
        select 'avail' as grp, ${eff}::text as id
        ${from} and coalesce(b.is_active, true) and b.deleted_at is null
        union all
        select 'conf' as grp, (case when ${effCompliant} then 0 else 1 end)::text as id
        ${from}
        union all
        select 'crit' as grp, b.criticality_id::text as id
        ${from}
        union all
        select 'nccrit' as grp, b.criticality_id::text as id
        ${from} and not ${effCompliant}
      ) g group by grp, id`,
      where.args,
    ),
  ]);
  const dispRows = bucketRows.filter((r) => r.grp === "avail");
  const confRows = bucketRows.filter((r) => r.grp === "conf");
  const critRows = bucketRows.filter((r) => r.grp === "crit");
  const ncCritRows = bucketRows.filter((r) => r.grp === "nccrit");

  // Visibility scope counts (admin band segments only): live-but-disabled
  // rows plus soft-deleted rows over the unscoped filter subset. A separate
  // round-trip gated on the flag, so non-admin snapshots never observe
  // hidden rows.
  const scopeRows = scopeWhere
    ? await queryRows<{ inactive: string; deleted: string }>(
      `select
         count(*) filter (where b.deleted_at is null and not coalesce(b.is_active, true))::text as inactive,
         count(*) filter (where b.deleted_at is not null)::text as deleted
       from barriers b join locations loc on loc.id = b.location_id ${scopeWhere.text}`,
      scopeWhere.args,
    )
    : [];

  const r = rows[0];
  const total = Number(r?.total ?? 0);
  const compliant = Number(r?.compliant ?? 0);

  // Collects GROUP BY rows into id-keyed buckets (wire keys stay numeric).
  const toBucket = (bucketRows: { id: string; count: string }[]) => {
    const bucket: Record<string, number> = {};
    for (const row of bucketRows) bucket[row.id] = Number(row.count ?? 0);
    return bucket;
  };

  return {
    total,
    available: Number(r?.available ?? 0),
    outOfService: Number(r?.out_of_service ?? 0),
    contingencyOutage: Number(r?.contingency_outage ?? 0),
    degradedContingency: Number(r?.degraded_contingency ?? 0),
    degraded: Number(r?.degraded ?? 0),
    unavailable: Number(r?.unavailable ?? 0),
    other: Number(r?.other ?? 0),
    compliant,
    nonCompliant: Number(r?.non_compliant ?? 0),
    criticalNonCompliant: Number(r?.critical_non_compliant ?? 0),
    withoutActionPlan: Number(r?.without_action_plan ?? 0),
    pctCompliant: total > 0 ? Math.round((compliant / total) * 1000) / 10 : 0,
    byAvailability: toBucket(dispRows),
    byCompliance: toBucket(confRows),
    byCriticality: toBucket(critRows),
    ncByCriticality: toBucket(ncCritRows),
    inactive: Number(scopeRows[0]?.inactive ?? 0),
    deleted: Number(scopeRows[0]?.deleted ?? 0),
    syncedAt: new Date().toISOString(),
  };
}
