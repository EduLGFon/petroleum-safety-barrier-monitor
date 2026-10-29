// Import users from a users.txt file into the monitor.
// Format: name line, blank, email line (optional "|admin" suffix), blank,
// "Todas", blank, phone. "Todas" strings and phone numbers are ignored.
// Only name and email are imported; password defaults to "123456789012".
// Run with:
//   deno run -A --env-file=.env scripts/import-users.ts [--file users.txt]
import {
  createUser,
  getUserByEmail,
  normalizeEmail,
  updateUser,
} from "../lib/server/sql/users.ts";

import {
  hashPassword,
  validateNewPassword,
} from "../lib/server/auth/password.ts";

const DEFAULT_PASSWORD = "123456789012";

function flag(name: string): string | undefined {
  const idx = Deno.args.indexOf(name);
  if (idx < 0 || idx + 1 >= Deno.args.length) return undefined;
  return Deno.args[idx + 1];
}

function parseUsers(text: string): Array<{ name: string; email: string; phone: string; admin: boolean }> {
  const lines = text.split(/\r?\n/);
  const users: Array<{ name: string; email: string; phone: string; admin: boolean }> = [];
  let currentName = "";
  let lastUser: { name: string; email: string; phone: string; admin: boolean } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (line === "Todas") continue;
    if (/^\d[\d\s-]*$/.test(line)) {
      if (lastUser) lastUser.phone = line;
      continue;
    }
    if (/@/.test(line)) {
      const [emailPart, suffix] = line.split("|");
      const admin = (suffix ?? "").trim().toLowerCase() === "admin";
      const u = { name: currentName.trim(), email: emailPart.trim(), phone: "", admin };
      users.push(u);
      lastUser = u;
      currentName = "";
    } else {
      // new name block resets lastUser
      if (currentName === "" && lastUser) lastUser = null;
      if (currentName) currentName += " ";
      currentName += line;
    }
  }
  return users;
}

if (import.meta.main) {
  const file = flag("--file") ?? "users.txt";
  const text = await Deno.readTextFile(file);
  const users = parseUsers(text);
  const passwordHash = await hashPassword(validateNewPassword(DEFAULT_PASSWORD));
  let ok = 0;
  for (const u of users) {
    try {
      const existing = await getUserByEmail(normalizeEmail(u.email));
      if (existing) {
        const updated = await updateUser(existing.id, {
          name: u.name,
          phone: u.phone,
          role: u.admin ? "admin" : "user",
        });
        console.log(`updated ${updated?.email ?? u.email} (${updated?.role ?? ""})`);
      } else {
        const created = await createUser({
          email: normalizeEmail(u.email),
          name: u.name,
          phone: u.phone,
          passwordHash,
          role: u.admin ? "admin" : "user",
        });
        console.log(`imported ${created.email} (${created.role})`);
      }
      ok++;
    } catch (err) {
      console.error(
        `failed ${u.email}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(`done: ${ok}/${users.length}`);
}
