// Flag local accounts that still use the legacy shared password.
// This is a one-time remediation: the roster import used to create every
// local account with the same default password. Those accounts must be held
// at the forced-change gate until each person picks a password of their own.
//
// The legacy password is never committed and never printed. Pass it via
// LEGACY_SHARED_PASSWORD env or --password <value>; the script refuses to
// run without it. Only counts are printed, never emails, hashes or
// passwords. Dry-run is the default; --apply writes the flag with updateUser
// (a flag-only change revokes no sessions). A second run finds zero matches,
// so the script is idempotent. Take a backup first with pg_dump -Fc.
//
// Run with:
//   LEGACY_SHARED_PASSWORD=... deno run -A --env-file=.env scripts/flag-shared-password-users.ts
//   LEGACY_SHARED_PASSWORD=... deno run -A --env-file=.env scripts/flag-shared-password-users.ts --limit 5
//   LEGACY_SHARED_PASSWORD=... deno run -A --env-file=.env scripts/flag-shared-password-users.ts --apply
import { verifyPassword } from "../lib/server/auth/password.ts";

import { updateUser } from "../lib/server/sql/users.ts";

import { queryRows } from "../lib/server/db.ts";

function flag(name: string): string | undefined {
  const idx = Deno.args.indexOf(name);
  if (idx < 0 || idx + 1 >= Deno.args.length) return undefined;
  return Deno.args[idx + 1];
}

function hasFlag(name: string): boolean {
  return Deno.args.includes(name);
}

function printUsage(): void {
  console.log(
    [
      "usage: scripts/flag-shared-password-users.ts [--password <value>] [--apply] [--limit N] [--help]",
      "  --password <value>  legacy shared password (or LEGACY_SHARED_PASSWORD env)",
      "  --apply             flag matches with must_change_password=true (default is dry-run)",
      "  --limit N           pilot: check only the first N candidates",
      "  --help              show this help",
    ].join("\n"),
  );
}

interface Candidate {
  id: number;
  password_hash: string | null;
}

if (import.meta.main) {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    Deno.exit(0);
  }
  const legacy = flag("--password") ?? Deno.env.get("LEGACY_SHARED_PASSWORD") ??
    "";
  if (legacy === "") {
    console.error(
      "refusing to run without the legacy password: pass --password <value> or set LEGACY_SHARED_PASSWORD.",
    );
    Deno.exit(1);
  }
  const apply = hasFlag("--apply");
  const limitRaw = flag("--limit");
  let limit = 0;
  if (limitRaw !== undefined) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error("--limit must be a positive integer");
      Deno.exit(1);
    }
  }

  console.log('back up first: pg_dump -Fc -f backup.dump "$DATABASE_URL"');
  console.log(apply ? "modo: APLICANDO" : "modo: ENSAIO (nada e gravado)");

  const candidates = await queryRows<Candidate>(
    `select id, password_hash from users
      where auth_source = 'local' and must_change_password = false and active
        and password_hash is not null
      order by id${limit > 0 ? ` limit ${limit}` : ""}`,
  );
  console.log(`contas locais verificadas: ${candidates.length}`);

  let matches = 0;
  const matchedIds: number[] = [];
  for (const candidate of candidates) {
    if (!candidate.password_hash) continue;
    let same = false;
    try {
      same = await verifyPassword(legacy, candidate.password_hash);
    } catch {
      same = false;
    }
    if (same) {
      matches++;
      matchedIds.push(candidate.id);
    }
  }

  if (!apply) {
    console.log(`contas com a senha antiga: ${matches}`);
    console.log(`contas com outra senha: ${candidates.length - matches}`);
    Deno.exit(0);
  }

  let flagged = 0;
  for (const id of matchedIds) {
    try {
      const updated = await updateUser(id, { mustChangePassword: true });
      if (!updated) throw new Error("account disappeared during flagging");
      flagged++;
    } catch (err) {
      console.error(
        `failed to flag account:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(`contas marcadas: ${flagged} de ${matches}`);
  if (flagged !== matches) Deno.exit(1);
}
