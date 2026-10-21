// Users password-reset integration - exercises the real SQL behind the
// admin-only PATCH /api/users/:id path. Skipped without DATABASE_URL.
import { createUser, deleteUser, getUserById, updateUser } from "./users.ts";

import { createSession, deleteSessionsForUser } from "./sessions.ts";

import { hashPassword, verifyPassword } from "../auth/password.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

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
      await verifyPassword("old-password-1234", before!.password_hash),
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
    await deleteSessionsForUser(userId);

    const after = await getUserById(userId);
    assertStrictEquals(
      await verifyPassword("new-password-5678", after!.password_hash),
      true,
    );
    assertStrictEquals(
      await verifyPassword("old-password-1234", after!.password_hash),
      false,
    );
    assertStrictEquals(await countSessions(userId), 0);

    const otherAfter = await getUserById(otherId);
    assertStrictEquals(
      await verifyPassword("other-password-9012", otherAfter!.password_hash),
      true,
    );
  } finally {
    if (userId !== undefined) await deleteUser(userId);
    if (otherId !== undefined) await deleteUser(otherId);
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
