// create-admin: provisions the first (or an extra) admin user.
// This is why it exists: a fresh database has no logins, and /api/users
// requires an admin session, so the first account must come from here.
// Password source (in order): --password (DEPRECATED: leaks via argv -
// warns), ADMIN_PASSWORD env, or a masked stdin prompt. When users already
// exist, --confirm-existing is required to avoid accidental extra admins.
// Run with:
//   ADMIN_PASSWORD='long-enough-1234' deno run -A --env-file=.env scripts/create-admin.ts --email a@x [--name 'Ops']
//   # extra admin later:
//   ADMIN_PASSWORD='...' deno run -A --env-file=.env scripts/create-admin.ts --email b@x --confirm-existing
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
  const argvPassword = flag("--password");
  const name = flag("--name") ?? "";
  const confirmExisting = Deno.args.includes("--confirm-existing");
  // Secrets must not ride on the CLI (visible in shell history + process
  // list). Prefer ADMIN_PASSWORD env or an interactive prompt; --password is
  // accepted only with an explicit leak warning for legacy callers.
  if (argvPassword !== undefined) {
    console.warn(
      "[create-admin] WARNING: --password exposes the secret via shell history and process list; prefer ADMIN_PASSWORD env or the interactive prompt.",
    );
  }
  let password = argvPassword ?? Deno.env.get("ADMIN_PASSWORD");
  if (!password) {
    // Masked stdin prompt: no echo so shoulder-surfing / logs cannot sniff
    // it. Deno has no built-in secret prompt, so raw mode + asterisk-free
    // read is implemented inline (falls back to prompt() when not a TTY).
    password = await readSecretStdin("admin password (12+ chars): ");
  }
  if (!email || !password) {
    console.error(
      "usage: create-admin.ts --email <email> [--name <name>] [--confirm-existing]\n" +
        "  password via ADMIN_PASSWORD env or interactive prompt (avoid --password: leaks via argv).",
    );
    Deno.exit(1);
  }
  try {
    const total = await countUsers();
    if (total > 0 && !confirmExisting) {
      console.error(
        `refusing: ${total} user(s) already exist. Re-run with --confirm-existing to create an extra admin (prevents accidental second-admin creation).`,
      );
      Deno.exit(1);
    }
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

async function readSecretStdin(label: string): Promise<string | undefined> {
  try {
    await Deno.stdout.write(new TextEncoder().encode(label));
    // Try no-echo raw read; non-TTY (piped) falls back to a line read.
    if (Deno.stdin.isTerminal()) {
      Deno.stdin.setRaw(true);
    }
    const chunks: Uint8Array[] = [];
    const buf = new Uint8Array(1024);
    for (;;) {
      const n = await Deno.stdin.read(buf);
      if (n === null || n === 0) break;
      const slice = buf.subarray(0, n);
      // Enter (CR/LF) ends input; Ctrl-C/D aborts.
      if (slice.includes(13) || slice.includes(10)) break;
      if (slice[0] === 3 || slice[0] === 4) return undefined;
      chunks.push(slice.slice());
    }
    if (Deno.stdin.isTerminal()) {
      try {
        Deno.stdin.setRaw(false);
      } catch { /* best effort */ }
      await Deno.stdout.write(new TextEncoder().encode("\n"));
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      joined.set(c, off);
      off += c.length;
    }
    const value = new TextDecoder().decode(joined).trim();
    return value === "" ? undefined : value;
  } catch {
    try {
      const fallback = globalThis.prompt(label);
      return fallback ?? undefined;
    } catch {
      return undefined;
    }
  }
}
