// Import users from a roster file into the monitor.
// Blocks are blank-line separated and contain, in order: name, email
// (optional "|admin" suffix), stations split by "/", phone. "Todas" means
// every station in the locations catalog. When the phone field carries more
// than one number ("a / b"), only the first one is kept.
//
// Existing users are updated (name, phone and role; passwords are kept and
// never reset here) and every non-admin is scoped to the access group
// matching its station set. A group is created only when no existing group
// has exactly those stations. Each new local user gets a distinct password
// from generateTemporaryPassword(), hashed per user, with
// mustChangePassword set so the forced-change gate holds the account until
// the person picks a password of their own.
//
// Generated passwords are never printed to stdout. They are written to a
// credentials file, one "email<TAB>password" line per new user, created with
// mode 0600. The default path is scripts/fixtures/_users_credentials.txt
// (gitignored PII); pass --credentials-out <path> to override. The path must
// stay inside scripts/fixtures/ and end in .txt. Only the file path and the
// new-user count are printed. When the file cannot be written after users
// were created, the script prints a loud error with the count (never the
// passwords) and exits non-zero; the admin then uses the reset path in the
// admin users screen to hand out fresh passwords.
//
// --dry-run (alias --check) audits the roster read-only: it resolves station
// tokens against the locations catalog and reports only unknown tokens and
// user numbers, never names, emails or phones. It writes nothing and exits 1
// when any station token is unknown.
//
// Run with:
//   deno run -A --env-file=.env scripts/import-users.ts
//   deno run -A --env-file=.env scripts/import-users.ts --dry-run
//   deno run -A --env-file=.env scripts/import-users.ts --file roster.txt
//   deno run -A --env-file=.env scripts/import-users.ts --credentials-out scripts/fixtures/_users_credentials.txt
//   (defaults to scripts/fixtures/_users.txt; pass --file to override)
import {
  createAccessGroup,
  listAccessGroups,
  replaceUserGroups,
} from "../lib/server/sql/access-groups.ts";

import {
  createUser,
  getUserByEmail,
  normalizeEmail,
  updateUser,
} from "../lib/server/sql/users.ts";

import {
  generateTemporaryPassword,
  hashPassword,
} from "../lib/server/auth/password.ts";

import { normalizePhone } from "../lib/server/validation.ts";

import { queryRows } from "../lib/server/db.ts";

// Default local roster file. It is gitignored because it contains PII;
// pass --file to override.
export const DEFAULT_USERS_FILE = "scripts/fixtures/_users.txt";

// Default credentials output. It is gitignored via scripts/fixtures/*
// because it contains plaintext passwords; pass --credentials-out to
// override within the same directory.
export const DEFAULT_CREDENTIALS_FILE =
  "scripts/fixtures/_users_credentials.txt";

// Sentinel used by the audit when a block has no stations field at all.
export const MISSING_STATIONS_SENTINEL = "(missing stations)";

export interface ImportedUser {
  name: string;
  email: string;
  stations: string;
  phone: string;
  admin: boolean;
}

interface LocationRow {
  id: number;
  code: string;
}

export interface ResolvedStations {
  ids: number[];
  labels: string[];
  missing: string[];
}

export interface AuditUserRow {
  index: number;
  missing: string[];
}

export interface AuditResult {
  total: number;
  usersWithMissing: number;
  missingTokens: string[];
  rows: AuditUserRow[];
}

function flag(name: string): string | undefined {
  const idx = Deno.args.indexOf(name);
  if (idx < 0 || idx + 1 >= Deno.args.length) return undefined;
  return Deno.args[idx + 1];
}

function hasFlag(...names: string[]): boolean {
  return names.some((name) => Deno.args.includes(name));
}

// formatCredentialLine: one credentials-file line for a new user. The tab
// keeps the address parseable even when it carries no spaces, and the line
// holds nothing else so a later handover stays mechanical.
export function formatCredentialLine(
  email: string,
  password: string,
): string {
  return `${email}\t${password}`;
}

// maskEmail: user emails are protected data, so logs and stdout never carry
// the full address. The first letter plus the domain still matches a row
// against the roster. Matching and payloads stay exact; only output is
// masked.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

// safeReason: provider and error text can echo an address, so stdout must
// never print a reason verbatim. Masks every email-looking token (exact
// account address first, case-insensitive, then any other address shape)
// and caps the printed length. Pure and side-effect free.
export function safeReason(
  reason: string | null | undefined,
  email: string,
  maxLen = 120,
): string {
  let out = (reason ?? "sem motivo").trim();
  if (out === "") out = "sem motivo";
  const target = email.trim();
  if (target !== "" && target.includes("@")) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), maskEmail(target));
  }
  out = out.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    (m) => maskEmail(m),
  );
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out;
}

// resolveCredentialsOutPath: validates the credentials output path. It must
// stay inside scripts/fixtures/ and end in .txt so generated passwords never
// land next to source or in an unexpected directory. Throws on violation.
export function resolveCredentialsOutPath(
  raw: string | undefined,
): string {
  const candidate = (raw ?? DEFAULT_CREDENTIALS_FILE).trim();
  if (candidate === "") throw new Error("credentials-out path is empty");
  if (!candidate.endsWith(".txt")) {
    throw new Error("credentials-out path must end in .txt");
  }
  const normalized = candidate.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.includes("..")) {
    throw new Error("credentials-out path must stay inside scripts/fixtures/");
  }
  if (!normalized.startsWith("scripts/fixtures/")) {
    throw new Error("credentials-out path must stay inside scripts/fixtures/");
  }
  return normalized;
}

// firstPhone: the fixture/export sometimes stores two numbers separated by
// "/"; the monitor has a single phone column, so keep the first one.
export function firstPhone(raw: string): string {
  const first = (raw.split("/")[0] ?? "").trim();
  if (!/\d/.test(first)) return "";
  return normalizePhone(first);
}

function isPhoneField(line: string): boolean {
  return /\d/.test(line) || /^(na|n\/a|-)$/i.test(line);
}

export function parseUsers(text: string): ImportedUser[] {
  const users: ImportedUser[] = [];
  let nameLines: string[] = [];
  let emailLine: string | null = null;
  let stations = "";
  let hasStations = false;

  const finish = (phoneRaw = "") => {
    if (emailLine === null) return;
    const [emailPart, suffix] = emailLine.split("|");
    users.push({
      name: nameLines.join(" ").trim(),
      email: emailPart.trim(),
      stations,
      phone: firstPhone(phoneRaw),
      admin: (suffix ?? "").trim().toLowerCase() === "admin",
    });
    nameLines = [];
    emailLine = null;
    stations = "";
    hasStations = false;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (/^(name|nome)\s*-\s*(email|e-mail)\b/i.test(line)) continue;

    if (emailLine === null) {
      if (line.includes("@")) emailLine = line;
      else nameLines.push(line);
      continue;
    }
    if (!hasStations) {
      stations = line;
      hasStations = true;
      continue;
    }
    // The phone is the last field of a block; its line closes the user. If
    // the phone is omitted, the next name line starts a new user instead.
    if (!isPhoneField(line)) {
      finish();
      nameLines.push(line);
      continue;
    }
    finish(line);
  }
  finish();
  return users;
}

// stationKey: case/accent/punctuation-insensitive comparison so "UGVM's"
// and "UGVMs" point at the same catalog row.
function stationKey(code: string): string {
  return code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

export function resolveStations(
  raw: string,
  locations: LocationRow[],
): ResolvedStations {
  if (stationKey(raw) === "TODAS") {
    const sorted = [...locations].sort((a, b) => a.id - b.id);
    return {
      ids: sorted.map((l) => l.id),
      labels: sorted.map((l) => l.code),
      missing: [],
    };
  }

  const byCode = new Map<string, LocationRow>();
  for (const loc of locations) byCode.set(stationKey(loc.code), loc);

  const found = new Map<number, string>();
  const missing: string[] = [];
  for (const token of raw.split("/").map((part) => part.trim())) {
    if (token === "") continue;
    const loc = byCode.get(stationKey(token));
    if (!loc) missing.push(token);
    else if (!found.has(loc.id)) found.set(loc.id, loc.code);
  }

  return {
    ids: [...found.keys()].sort((a, b) => a - b),
    labels: [...found.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, code]) => code),
    missing,
  };
}

// auditUsers: pure read-only roster check. Rows keep only the 1-based user
// index and unknown tokens so the audit can be printed without personal data.
export function auditUsers(
  users: ImportedUser[],
  locations: LocationRow[],
): AuditResult {
  const rows: AuditUserRow[] = [];
  const distinct = new Set<string>();
  let usersWithMissing = 0;

  for (const [index, user] of users.entries()) {
    const missing = user.stations.trim() === ""
      ? [MISSING_STATIONS_SENTINEL]
      : resolveStations(user.stations, locations).missing;
    if (missing.length > 0) usersWithMissing++;
    for (const token of missing) distinct.add(token);
    rows.push({ index: index + 1, missing });
  }

  return {
    total: users.length,
    usersWithMissing,
    missingTokens: [...distinct].sort(),
    rows,
  };
}

function locationSetKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

function uniqueGroupName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

function printUsage(): void {
  console.log(
    [
      "usage: scripts/import-users.ts [--file <path>] [--dry-run|--check] [--credentials-out <path>] [--help]",
      "  --file <path>             roster input (default scripts/fixtures/_users.txt)",
      "  --dry-run, --check        audit station tokens read-only, write nothing",
      "  --credentials-out <path>  new-user passwords file (default scripts/fixtures/_users_credentials.txt)",
      "                            must stay inside scripts/fixtures/ and end in .txt",
      "  --help                    show this help",
    ].join("\n"),
  );
}

if (import.meta.main) {
  if (hasFlag("--help", "-h")) {
    printUsage();
    Deno.exit(0);
  }
  const file = flag("--file") ?? DEFAULT_USERS_FILE;
  let credentialsOut: string;
  try {
    credentialsOut = resolveCredentialsOutPath(
      flag("--credentials-out"),
    );
  } catch (err) {
    console.error(
      `invalid --credentials-out:`,
      err instanceof Error ? err.message : err,
    );
    Deno.exit(1);
  }
  let text: string;
  try {
    text = await Deno.readTextFile(file);
  } catch (err) {
    console.error(
      `cannot read ${file}:`,
      err instanceof Error ? err.message : err,
      "\ncreate scripts/fixtures/_users.txt locally (see scripts/fixtures/README.md) or pass --file <path>",
    );
    Deno.exit(1);
  }

  const users = parseUsers(text);
  if (users.length === 0) {
    console.error(`no users found in ${file}`);
    Deno.exit(1);
  }

  const locations = await queryRows<LocationRow>(
    `select id, code from locations order by id`,
  );
  if (locations.length === 0) {
    console.error(
      "locations is empty: run the upstream import/sync before importing users.",
    );
    Deno.exit(1);
  }

  if (hasFlag("--dry-run", "--check")) {
    const audit = auditUsers(users, locations);
    for (const row of audit.rows) {
      if (row.missing.length === 0) continue;
      console.log(
        `user #${row.index}: unknown station(s): ${row.missing.join(", ")}`,
      );
    }
    console.log(
      `audit: ${audit.total} users, ${audit.usersWithMissing} with unknown ` +
        `stations, ${audit.missingTokens.length} distinct unknown token(s)`,
    );
    Deno.exitCode = audit.usersWithMissing > 0 ? 1 : 0;
  } else {
    const groups = await listAccessGroups();
    const usedNames = new Set(groups.map((g) => g.name));

    let ok = 0;
    let createdGroups = 0;
    let createdUsers = 0;
    const credentials: string[] = [];
    for (const [index, u] of users.entries()) {
      try {
        if (!u.email) throw new Error("missing email");
        if (!u.stations) throw new Error("missing stations");
        const resolved = resolveStations(u.stations, locations);
        if (resolved.missing.length > 0) {
          throw new Error(
            `unknown station(s): ${resolved.missing.join(", ")} ` +
              "(import/sync the locations catalog first)",
          );
        }

        const role = u.admin ? "admin" : "user";
        const existing = await getUserByEmail(normalizeEmail(u.email));
        let userId: number;
        if (existing) {
          const updated = await updateUser(existing.id, {
            name: u.name,
            phone: u.phone,
            role,
          });
          if (!updated) throw new Error("user disappeared during update");
          userId = updated.id;
          console.log(`updated user #${index + 1} (${updated.role})`);
        } else {
          // One distinct password per person: the hash is per-user and the
          // account stays gated until the person replaces it.
          const password = generateTemporaryPassword();
          const created = await createUser({
            email: normalizeEmail(u.email),
            name: u.name,
            phone: u.phone,
            passwordHash: await hashPassword(password),
            role,
            mustChangePassword: true,
          });
          userId = created.id;
          createdUsers++;
          credentials.push(
            formatCredentialLine(normalizeEmail(u.email), password),
          );
          console.log(`imported user #${index + 1} (${created.role})`);
        }

        // Admins bypass station scoping, so they do not need a group.
        if (role === "admin") {
          ok++;
          continue;
        }

        const setKey = locationSetKey(resolved.ids);
        let group = groups.find((g) =>
          locationSetKey(g.locationIds) === setKey
        );
        if (!group) {
          const baseName = resolved.labels.join("/") || "Sem estações";
          const name = uniqueGroupName(baseName, usedNames);
          group = await createAccessGroup({
            name,
            description: `Estações: ${resolved.labels.join("/")}.`,
            locationIds: resolved.ids,
          });
          groups.push(group);
          usedNames.add(name);
          createdGroups++;
          console.log(
            `created group ${group.name} (${resolved.labels.join("/")})`,
          );
        }

        await replaceUserGroups(userId, [group.id]);
        ok++;
      } catch (err) {
        console.error(
          `failed user #${index + 1}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (createdUsers > 0) {
      try {
        const dir = credentialsOut.slice(
          0,
          Math.max(0, credentialsOut.lastIndexOf("/")),
        );
        if (dir !== "") await Deno.mkdir(dir, { recursive: true });
        await Deno.writeTextFile(
          credentialsOut,
          credentials.join("\n") + "\n",
          { mode: 0o600 },
        );
      } catch (err) {
        console.error(
          `CRITICAL: created ${createdUsers} user(s) but could not write ${credentialsOut}:`,
          err instanceof Error ? err.message : err,
          "\nPasswords were not stored anywhere. Use the admin reset path to issue fresh passwords.",
        );
        Deno.exit(1);
      }
      try {
        await Deno.chmod(credentialsOut, 0o600);
      } catch (err) {
        if (Deno.build.os === "windows") {
          // No POSIX permission bits; the create mode above is best effort.
        } else {
          console.error(
            `CRITICAL: wrote ${credentialsOut} with ${createdUsers} new password(s) but could not tighten permissions to 0600:`,
            err instanceof Error ? err.message : err,
            "\nThe passwords ARE in the file with potentially broad permissions. Restrict the file now (chmod 0600) or delete it and use the admin reset path to issue fresh passwords.",
          );
          Deno.exit(1);
        }
      }
      console.log(
        `credentials: ${createdUsers} new password(s) in ${credentialsOut}`,
      );
    } else {
      console.log(`credentials: 0 new password(s), nothing written`);
    }

    console.log(
      `done: ${ok}/${users.length} users, ${createdGroups} group(s) created`,
    );
    if (ok !== users.length) Deno.exitCode = 1;
  }
}
