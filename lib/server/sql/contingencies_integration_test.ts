// Contingency relationship SQL integration test; requires a disposable Postgres.
import {
  addBarrierContingency,
  listBarrierContingencies,
  removeBarrierContingency,
  updateBarrierContingency,
} from "./contingencies.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { queryRows } from "../db.ts";

Deno.test("contingency links enforce eligibility and support many-to-many", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a disposable Postgres");
    return;
  }
  const rows = await queryRows<{ id: number }>(
    `select b.id
     from barriers b
     join availability_statuses a on a.id = b.availability_id
     where b.deleted_at is null and b.is_active
       and a.label = 'Disponível' and a.is_compliant
       and b.location_id = (
         select candidate.location_id
         from barriers candidate
         join availability_statuses status
           on status.id = candidate.availability_id
         where candidate.deleted_at is null and candidate.is_active
           and status.label = 'Disponível' and status.is_compliant
           and not exists (
             select 1 from barrier_contingencies bc
             where bc.barrier_id = candidate.id
                or bc.contingency_barrier_id = candidate.id
           )
         group by candidate.location_id
         having count(*) >= 3
         order by candidate.location_id
         limit 1
       )
       and not exists (
         select 1 from barrier_contingencies bc
         where bc.barrier_id = b.id
            or bc.contingency_barrier_id = b.id
       )
     order by b.location_id, b.id
     limit 3`,
  );
  if (rows.length < 3) {
    console.log("skip: requires three active available barriers");
    return;
  }
  const [first, second, contingency] = rows.map((row) => row.id);
  if (
    first === undefined || second === undefined || contingency === undefined
  ) {
    throw new Error("expected three eligible test barriers");
  }
  const pairs = [[first, contingency], [second, contingency]] as const;
  try {
    assertStrictEquals(
      await addBarrierContingency(first, first, "", ""),
      "ineligible",
    );
    assertStrictEquals(
      await addBarrierContingency(first, contingency, "GM-TEST", "APR-TEST"),
      "created",
    );
    assertStrictEquals(
      await addBarrierContingency(first, contingency, "", ""),
      "duplicate",
    );
    assertStrictEquals(
      await addBarrierContingency(second, contingency, "", ""),
      "created",
    );
    assertStrictEquals(
      await updateBarrierContingency(
        first,
        contingency,
        "GM-TEST-UPDATED",
        "APR-TEST-UPDATED",
      ),
      true,
    );
    const firstView = await listBarrierContingencies(first, "", true);
    assertEquals(
      firstView.outgoing.map((link) => [
        link.barrierId,
        link.contingencyBarrierId,
        link.managementChange,
        link.riskAnalysis,
      ]),
      [[first, contingency, "GM-TEST-UPDATED", "APR-TEST-UPDATED"]],
    );
    const contingencyView = await listBarrierContingencies(
      contingency,
      "",
      true,
    );
    assertEquals(
      contingencyView.incoming.map((link) => link.barrierId).sort(),
      [first, second].sort(),
    );
    assertStrictEquals(
      await removeBarrierContingency(first, contingency),
      true,
    );
    assertStrictEquals(
      await removeBarrierContingency(first, contingency),
      false,
    );
  } finally {
    for (const [barrierId, contingencyId] of pairs) {
      await queryRows(
        `delete from barrier_contingencies
         where barrier_id = $1 and contingency_barrier_id = $2`,
        [barrierId, contingencyId],
      );
    }
  }
});
