// Recipients CRUD integration (P5) - exercises the real SQL, including the
// parameterized UPDATE. Skipped without DATABASE_URL.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { queryRows } from "../db.ts";
import {
  createRecipient,
  deleteRecipient,
  listRecipients,
  updateRecipient,
} from "./recipients.ts";

Deno.test("recipients CRUD round-trips through Postgres", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `p5crud-${Date.now()}@example.com`;
  try {
    const created = await createRecipient(email, "Test");
    assertStrictEquals(created.email, email);
    assertStrictEquals(created.active, true);

    const renamed = await createRecipient(email, "Renamed");
    assertStrictEquals(renamed.id, created.id);
    assertStrictEquals(renamed.name, "Renamed");

    const list = await listRecipients();
    assertStrictEquals(list.some((r) => r.email === email), true);

    const deactivated = await updateRecipient(created.id, { active: false });
    assertStrictEquals(deactivated?.active, false);
    const activeOnly = await listRecipients(true);
    assertStrictEquals(activeOnly.some((r) => r.email === email), false);

    assertStrictEquals(
      await updateRecipient(999_999_999, { active: true }),
      null,
    );
    assertStrictEquals(await deleteRecipient(created.id), true);
    assertStrictEquals(await deleteRecipient(created.id), false);
  } finally {
    await queryRows(`delete from alert_recipients where email = $1`, [email]);
  }
});
