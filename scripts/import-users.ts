// Import users from a users.txt file into the monitor.
// Format: name line, blank, email line (optional "|admin" suffix), blank,
// "Todas", blank, phone. "Todas" strings and phone numbers are ignored.
// Only name and email are imported; password defaults to "123456789012".
// Run with:
//   deno run -A --env-file=.env scripts/import-users.ts [--file users.txt]
import {
  createUser,
  normalizeEmail,
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

function parseUsers(text: string): Array<{ name: string; email: string; admin: boolean }> {
  const lines = text.split(/\r?\n/);
  const users: Array<{ name: string; email: string; admin: boolean }> = [];
  let currentName = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (line === "Todas") continue;
    if (/^\d[\d\s-]*$/.test(line)) continue; // phone numbers
    if (/@/.test(line)) {
      const [emailPart, suffix] = line.split("|");
      const admin = (suffix ?? "").trim().toLowerCase() === "admin";
      users.push({ name: currentName.trim(), email: emailPart.trim(), admin });
      currentName = "";
    } else {
      // name line (may span? accumulate if multiple consecutive non-email lines)
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
      const created = await createUser({
        email: normalizeEmail(u.email),
        name: u.name,
        passwordHash,
        role: u.admin ? "admin" : "user",
      });
      console.log(`imported ${created.email} (${created.role})`);
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
