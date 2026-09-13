// Alert cycle integration (P5 acceptance, DB-backed).
// Real sqlAlertStore + fake mailer: a seeded barrier transitions into
// urgent, the first run sends exactly one digest, the rerun sends zero.
// Skipped with a log line when DATABASE_URL is unset.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { queryRows } from "../db.ts";
import { getBarrierById, transitionBarrierStatus } from "./barriers.ts";
import { sqlAlertStore } from "./alerts.ts";
import { runAlertCycle } from "../alerts/run.ts";
import type { AlertMailer } from "../alerts/mailer.ts";

async function cleanup(barrierId: number): Promise<void> {
  await queryRows(`delete from alert_events where barrier_id = $1`, [
    barrierId,
  ]);
}

Deno.test("urgent transition sends one digest, rerun sends zero", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const seed = await queryRows<{ id: number; disponibilidade_id: number }>(
    `select id, disponibilidade_id from barriers
     where deleted_at is null order by id limit 1`,
  );
  const barrierId = seed[0]!.id;
  const original = seed[0]!.disponibilidade_id;

  const sent: Array<{ to: string[]; subject: string }> = [];
  const mailer: AlertMailer = {
    name: "fake",
    send: (to, subject) => {
      sent.push({ to, subject });
      return Promise.resolve();
    },
  };
  const base = {
    store: sqlAlertStore,
    loadBarrier: getBarrierById,
    mailer,
    recipients: [{ email: "p5test@example.com" }],
    onlyBarrierIds: [barrierId],
    dryRun: false,
    retry: { attempts: 1 },
  };

  await cleanup(barrierId);
  try {
    await transitionBarrierStatus(barrierId, 5, 1, "p5test to urgent");
    const first = await runAlertCycle(base);
    assertStrictEquals(first.enqueued >= 1, true);
    assertStrictEquals(first.emails, 1);
    assertStrictEquals(sent.length, 1);
    assertStrictEquals(sent[0]!.to.join(","), "p5test@example.com");

    const second = await runAlertCycle(base);
    assertStrictEquals(second.enqueued, 0);
    assertStrictEquals(second.emails, 0);
    assertStrictEquals(sent.length, 1);
  } finally {
    await transitionBarrierStatus(barrierId, original, 1, "p5test revert");
    await cleanup(barrierId);
  }
});
