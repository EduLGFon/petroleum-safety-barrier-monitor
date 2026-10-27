// Contingency relationship queries and eligibility checks.
import { queryRows, withTx } from "../db.ts";

import { escapeLike } from "./where.ts";

export interface ContingencyLink {
  barrierId: number;
  barrierTag: string;
  contingencyBarrierId: number;
  contingencyTag: string;
  managementChange: string;
  riskAnalysis: string;
  eligible: boolean;
}

export interface ContingencyCandidate {
  id: number;
  tag: string;
}

export interface BarrierContingencies {
  outgoing: ContingencyLink[];
  incoming: ContingencyLink[];
  candidates: ContingencyCandidate[];
  candidatesHaveMore: boolean;
}

interface ContingencyLinkRow {
  barrier_id: number;
  barrier_tag: string;
  contingency_barrier_id: number;
  contingency_tag: string;
  management_change: string | null;
  risk_analysis: string | null;
  eligible: boolean;
}

const CANDIDATE_LIMIT = 50;

function mapLinks(rows: ContingencyLinkRow[]): ContingencyLink[] {
  return rows.map((row) => ({
    barrierId: row.barrier_id,
    barrierTag: row.barrier_tag,
    contingencyBarrierId: row.contingency_barrier_id,
    contingencyTag: row.contingency_tag,
    managementChange: row.management_change ?? "",
    riskAnalysis: row.risk_analysis ?? "",
    eligible: row.eligible,
  }));
}

const LINK_SELECT = `
  select b.id as barrier_id, b.tag as barrier_tag,
    c.id as contingency_barrier_id, c.tag as contingency_tag,
    bc.management_change, bc.risk_analysis,
    (c.deleted_at is null and c.is_active
      and c.location_id = b.location_id
      and a.label = 'Disponível' and a.is_compliant) as eligible
  from barrier_contingencies bc
  join barriers b on b.id = bc.barrier_id
  join barriers c on c.id = bc.contingency_barrier_id
  join availability_statuses a on a.id = c.availability_id
`;

export async function listBarrierContingencies(
  barrierId: number,
  query: string,
  includeOffScope: boolean,
): Promise<BarrierContingencies> {
  const [outgoingRows, incomingRows, candidateRows] = await Promise.all([
    queryRows<ContingencyLinkRow>(
      `${LINK_SELECT} where b.id = $1
         and ($2 or (
           b.deleted_at is null and b.is_active
           and c.deleted_at is null and c.is_active
         ))
       order by c.tag, c.id`,
      [barrierId, includeOffScope],
    ),
    queryRows<ContingencyLinkRow>(
      `${LINK_SELECT} where c.id = $1
         and ($2 or (
           b.deleted_at is null and b.is_active
           and c.deleted_at is null and c.is_active
         ))
       order by b.tag, b.id`,
      [barrierId, includeOffScope],
    ),
    queryRows<ContingencyCandidate>(
      `select c.id, c.tag
       from barriers b
       join barriers c on c.location_id = b.location_id and c.id <> b.id
       join availability_statuses a on a.id = c.availability_id
       where b.id = $1 and b.deleted_at is null
         and c.deleted_at is null and c.is_active
         and a.label = 'Disponível' and a.is_compliant
         and c.tag ilike $2 escape '\\'
         and not exists (
           select 1 from barrier_contingencies bc
           where bc.barrier_id = b.id
             and bc.contingency_barrier_id = c.id
         )
       order by c.tag, c.id
       limit $3`,
      [
        barrierId,
        `%${escapeLike(query)}%`,
        CANDIDATE_LIMIT + 1,
      ],
    ),
  ]);
  return {
    outgoing: mapLinks(outgoingRows),
    incoming: mapLinks(incomingRows),
    candidates: candidateRows.slice(0, CANDIDATE_LIMIT).map(({ id, tag }) => ({
      id,
      tag,
    })),
    candidatesHaveMore: candidateRows.length > CANDIDATE_LIMIT,
  };
}

export async function addBarrierContingency(
  barrierId: number,
  contingencyBarrierId: number,
  managementChange: string,
  riskAnalysis: string,
): Promise<"created" | "duplicate" | "ineligible"> {
  return await withTx(async (tx) => {
    const inserted = await tx<{ barrier_id: number }>(
      `with eligible as (
         select b.id as barrier_id, c.id as contingency_barrier_id
         from barriers b
         join barriers c on c.location_id = b.location_id
         join availability_statuses a on a.id = c.availability_id
         where b.id = $1 and b.deleted_at is null
           and c.id = $2 and c.id <> b.id
           and c.deleted_at is null and c.is_active
           and a.label = 'Disponível' and a.is_compliant
         for update of b, c
       )
       insert into barrier_contingencies
         (barrier_id, contingency_barrier_id, management_change, risk_analysis)
       select barrier_id, contingency_barrier_id,
         nullif($3::text, ''), nullif($4::text, '')
       from eligible
       where true
       on conflict (barrier_id, contingency_barrier_id) do nothing
       returning barrier_id`,
      [barrierId, contingencyBarrierId, managementChange, riskAnalysis],
    );
    if (inserted.length > 0) return "created";
    const existing = await tx<{ found: boolean }>(
      `select exists (
         select 1 from barrier_contingencies
         where barrier_id = $1 and contingency_barrier_id = $2
       ) as found`,
      [barrierId, contingencyBarrierId],
    );
    return existing[0]?.found ? "duplicate" : "ineligible";
  });
}

export async function updateBarrierContingency(
  barrierId: number,
  contingencyBarrierId: number,
  managementChange: string,
  riskAnalysis: string,
): Promise<boolean> {
  const rows = await queryRows<{ barrier_id: number }>(
    `update barrier_contingencies bc
     set management_change = nullif($3, ''),
         risk_analysis = nullif($4, ''),
         updated_at = now()
     from barriers b
     where bc.barrier_id = $1
       and bc.contingency_barrier_id = $2
       and b.id = bc.barrier_id
       and b.deleted_at is null
     returning bc.barrier_id`,
    [barrierId, contingencyBarrierId, managementChange, riskAnalysis],
  );
  return rows.length > 0;
}

export async function removeBarrierContingency(
  barrierId: number,
  contingencyBarrierId: number,
): Promise<boolean> {
  const rows = await queryRows<{ barrier_id: number }>(
    `delete from barrier_contingencies bc
     using barriers b
     where bc.barrier_id = $1
       and bc.contingency_barrier_id = $2
       and b.id = bc.barrier_id
       and b.deleted_at is null
     returning bc.barrier_id`,
    [barrierId, contingencyBarrierId],
  );
  return rows.length > 0;
}
