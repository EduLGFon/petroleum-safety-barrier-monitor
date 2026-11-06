// Users password-reset integration - exercises the real SQL behind the
// admin-only PATCH /api/users/:id path. Skipped without DATABASE_URL.
import {
  bindEntraIdentity,
  createUser,
  deleteUser,
  getPendingEntraUserByEmail,
  getUserById,
  selectPendingEntraMatch,
  updateUser,
} from "./users.ts";

import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

import { hashPassword, verifyPassword } from "../auth/password.ts";

import { createSession } from "./sessions.ts";

import { queryRows } from "../db.ts";

Deno.test("admin password reset replaces the hash and revokes sessions", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `pwreset-${Date.now()}@example.com`;
  const otherEmail = `pwreset-other-${Date.now()}@example.com`;
  let userId: number | undefined;
  let otherId: number | undefined;
  try {
    const created = await createUser({
      email,
      name: "Reset Test",
      passwordHash: await hashPassword("old-password-1234"),
      role: "user",
    });
    userId = created.id;
    const other = await createUser({
      email: otherEmail,
      name: "Other Test",
      passwordHash: await hashPassword("other-password-9012"),
      role: "user",
    });
    otherId = other.id;
    const before = await getUserById(userId);
    assertStrictEquals(
      await verifyPassword(
        "old-password-1234",
        before!.password_hash as string,
      ),
      true,
    );

    await createSession(
      userId,
      `pwreset-${crypto.randomUUID()}`,
      new Date(Date.now() + 60_000),
    );
    assertStrictEquals(await countSessions(userId), 1);

    const updated = await updateUser(userId, {
      passwordHash: await hashPassword("new-password-5678"),
    });
    assertStrictEquals(updated?.id, userId);

    const after = await getUserById(userId);
    assertStrictEquals(
      await verifyPassword("new-password-5678", after!.password_hash as string),
      true,
    );
    assertStrictEquals(
      await verifyPassword("old-password-1234", after!.password_hash as string),
      false,
    );
    assertStrictEquals(await countSessions(userId), 0);

    const otherAfter = await getUserById(otherId);
    assertStrictEquals(
      await verifyPassword(
        "other-password-9012",
        otherAfter!.password_hash as string,
      ),
      true,
    );
  } finally {
    if (userId !== undefined) await deleteUser(userId);
    if (otherId !== undefined) await deleteUser(otherId);
  }
});

Deno.test("changing active state revokes the user's sessions", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `pwdeactivate-${Date.now()}@example.com`;
  let userId: number | undefined;
  try {
    const created = await createUser({
      email,
      name: "Deactivate Test",
      passwordHash: await hashPassword("active-password-1234"),
      role: "user",
    });
    userId = created.id;
    await createSession(
      userId,
      `pwdeactivate-${crypto.randomUUID()}`,
      new Date(Date.now() + 60_000),
    );
    assertStrictEquals(await countSessions(userId), 1);

    const updated = await updateUser(userId, { active: false });
    assertStrictEquals(updated?.active, false);
    assertStrictEquals(await countSessions(userId), 0);

    // A dormant session that predates the deactivation must not come back when
    // the account is reactivated.
    await createSession(
      userId,
      `pwreactivate-${crypto.randomUUID()}`,
      new Date(Date.now() + 60_000),
    );
    assertStrictEquals(await countSessions(userId), 1);
    const reactivated = await updateUser(userId, { active: true });
    assertStrictEquals(reactivated?.active, true);
    assertStrictEquals(await countSessions(userId), 0);
  } finally {
    if (userId !== undefined) await deleteUser(userId);
  }
});

Deno.test("conditional password update rejects a stale hash", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `pwstale-${Date.now()}@example.com`;
  let userId: number | undefined;
  try {
    const firstHash = await hashPassword("first-password-1234");
    const secondHash = await hashPassword("second-password-5678");
    const staleHash = await hashPassword("stale-password-9012");
    const created = await createUser({
      email,
      name: "Stale Test",
      passwordHash: firstHash,
      role: "user",
    });
    userId = created.id;

    const changed = await updateUser(
      userId,
      { passwordHash: secondHash },
      { expectedPasswordHash: firstHash, requireActive: true },
    );
    assertStrictEquals(changed?.id, userId);

    const stale = await updateUser(
      userId,
      { passwordHash: staleHash },
      { expectedPasswordHash: firstHash, requireActive: true },
    );
    assertStrictEquals(stale, null);

    const after = await getUserById(userId);
    assertStrictEquals(
      await verifyPassword(
        "second-password-5678",
        after!.password_hash as string,
      ),
      true,
    );
    assertStrictEquals(
      await verifyPassword(
        "stale-password-9012",
        after!.password_hash as string,
      ),
      false,
    );
  } finally {
    if (userId !== undefined) await deleteUser(userId);
  }
});

Deno.test("selectPendingEntraMatch refuses an ambiguous claim set", () => {
  assertEquals(selectPendingEntraMatch([]), null);
  assertEquals(
    selectPendingEntraMatch([{ id: 7, email: "a@example.com" }]),
    { id: 7, email: "a@example.com" },
  );
  // Two claims that resolve to the same account are still one account.
  assertEquals(
    selectPendingEntraMatch([
      { id: 7, email: "a@example.com" },
      { id: 7, email: "alias@example.com" },
    ]),
    { id: 7, email: "a@example.com" },
  );
  // Two addresses pointing at two accounts must never pick a winner.
  assertEquals(
    selectPendingEntraMatch([
      { id: 7, email: "a@example.com" },
      { id: 8, email: "b@example.com" },
    ]),
    null,
  );
});

Deno.test("bindEntraIdentity is atomic and email-bound", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `entra-bind-${Date.now()}@example.com`;
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const objectId = crypto.randomUUID();
  let userId: number | undefined;
  try {
    const created = await createUser({
      email,
      name: "Bind Test",
      role: "user",
      authSource: "entra",
    });
    userId = created.id;
    assertStrictEquals(created.entra_oid, null);

    const pending = await getPendingEntraUserByEmail(email.toUpperCase());
    assertStrictEquals(pending?.id, created.id);

    // Wrong address loses: the row must not be bound by a claim it did not
    // match.
    const wrong = await bindEntraIdentity(
      created.id,
      tenantId,
      objectId,
      "other@example.com",
    );
    assertStrictEquals(wrong, null);
    assertStrictEquals((await getUserById(created.id))?.entra_oid, null);

    const bound = await bindEntraIdentity(
      created.id,
      tenantId,
      objectId,
      email,
    );
    assertStrictEquals(bound?.entra_tid, tenantId);
    assertStrictEquals(bound?.entra_oid, objectId);
    // A second racer loses instead of overwriting the binding.
    const second = await bindEntraIdentity(
      created.id,
      tenantId,
      crypto.randomUUID(),
      email,
    );
    assertStrictEquals(second, null);
    assertStrictEquals(await getPendingEntraUserByEmail(email), null);
  } finally {
    if (userId !== undefined) await deleteUser(userId);
  }
});

Deno.test("a drawn password sets the pending flag and clears with the hash", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `pwtemp-${Date.now()}@example.com`;
  let userId: number | undefined;
  try {
    const created = await createUser({
      email,
      name: "Temp Password Test",
      passwordHash: await hashPassword("temp-password-1234"),
      role: "user",
      mustChangePassword: true,
    });
    userId = created.id;
    assertStrictEquals(created.must_change_password, true);

    const newHash = await hashPassword("chosen-password-5678");
    const updated = await updateUser(userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });
    assertStrictEquals(updated?.must_change_password, false);
    const after = await getUserById(userId);
    assertStrictEquals(
      await verifyPassword("chosen-password-5678", after!.password_hash!),
      true,
    );
  } finally {
    if (userId !== undefined) await deleteUser(userId);
  }
});

Deno.test("converting to Entra clears the flag and refuses a password", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const email = `entra-convert-${Date.now()}@example.com`;
  let userId: number | undefined;
  try {
    const created = await createUser({
      email,
      name: "Convert Test",
      passwordHash: await hashPassword("convert-password-1234"),
      role: "user",
      mustChangePassword: true,
    });
    userId = created.id;

    const conflictHash = await hashPassword("conflict-password-9012");
    await assertRejects(
      () =>
        updateUser(userId!, {
          authSource: "entra",
          passwordHash: conflictHash,
        }),
      Error,
      "cannot set a password while converting to Entra",
    );
    // The rejected call wrote nothing: the account is still a local one.
    const stillLocal = await getUserById(userId);
    assertStrictEquals(stillLocal?.auth_source, "local");
    assertStrictEquals(stillLocal?.must_change_password, true);

    const converted = await updateUser(userId, {
      authSource: "entra",
      entraTid: null,
      entraOid: null,
    });
    assertStrictEquals(converted?.auth_source, "entra");
    assertStrictEquals(converted?.must_change_password, false);
    const after = await getUserById(userId);
    assertStrictEquals(after?.password_hash, null);
    assertStrictEquals(after?.entra_tid, null);
    assertStrictEquals(after?.entra_oid, null);
  } finally {
    if (userId !== undefined) await deleteUser(userId);
  }
});

// countSessions: rows currently stored for one user.
async function countSessions(userId: number): Promise<number> {
  const rows = await queryRows<{ n: string }>(
    `select count(*)::text as n from sessions where user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}
