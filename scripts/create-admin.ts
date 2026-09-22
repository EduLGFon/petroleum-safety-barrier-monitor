// create-admin: provisions the first (or an extra) admin user.
// This is why it exists: a fresh database has no logins, and /api/users
// requires an admin session, so the first account must come from here.
// Run with:
//   deno run -A --env-file=.env scripts/create-admin.ts --email a@x --password 'long-enough-1234' [--name 'Ops']
import {
  countUsers,
  createUser,
  normalizeEmail,
} from "../lib/server/sql/users.ts";

import {
  hashPassword,
  validateNewPassword,
} from "../lib/server/auth/password.ts";

function flag(name: string): string | undefined {
  const idx = Deno.args.indexOf(name);
  if (idx < 0 || idx + 1 >= Deno.args.length) return undefined;
  return Deno.args[idx + 1];
}

if (import.meta.main) {
  const email = flag("--email");
  const password = flag("--password");
  const name = flag("--name") ?? "";
  if (!email || !password) {
    console.error(
      "usage: create-admin.ts --email <email> --password <secret> [--name <name>]",
    );
    Deno.exit(1);
  }
  try {
    const total = await countUsers();
    const created = await createUser({
      email: normalizeEmail(email),
      name,
      passwordHash: await hashPassword(validateNewPassword(password)),
      role: "admin",
    });
    console.log(
      `admin ${created.email} ready (users total after: ${total + 1})`,
    );
  } catch (err) {
    console.error(
      "create-admin failed:",
      err instanceof Error ? err.message : err,
    );
    Deno.exit(1);
  }
}
