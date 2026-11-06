// Import users from a users.txt file into the monitor.
// Blocks are blank-line separated and contain, in order: name, email
// (optional "|admin" suffix), stations split by "/", phone. "Todas" means
// every station in the locations catalog. When the phone field carries more
// than one number ("a / b"), only the first one is kept.
//
// Existing users are updated (name, phone and role; passwords are kept) and
// every non-admin is scoped to the access group matching its station set. A
// group is created only when no existing group has exactly those stations.
// New local users get the default password below.
//
// Run with:
//   deno run -A --env-file=.env scripts/import-users.ts
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
  hashPassword,
  validateNewPassword,
} from "../lib/server/auth/password.ts";

import { normalizePhone } from "../lib/server/validation.ts";

import { queryRows } from "../lib/server/db.ts";

const DEFAULT_PASSWORD = "123456789012";

// Default local roster file. It is gitignored because it contains PII;
// pass --file to override.
export const DEFAULT_USERS_FILE = "scripts/fixtures/_users.txt";

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

function flag(name: string): string | undefined {
  const idx = Deno.args.indexOf(name);
  if (idx < 0 || idx + 1 >= Deno.args.length) return undefined;
  return Deno.args[idx + 1];
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

function locationSetKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

function uniqueGroupName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

if (import.meta.main) {
  const file = flag("--file") ?? DEFAULT_USERS_FILE;
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

  const groups = await listAccessGroups();
  const usedNames = new Set(groups.map((g) => g.name));
  const passwordHash = await hashPassword(
    validateNewPassword(DEFAULT_PASSWORD),
  );

  let ok = 0;
  let createdGroups = 0;
  for (const u of users) {
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
        console.log(`updated ${updated.email} (${updated.role})`);
      } else {
        const created = await createUser({
          email: normalizeEmail(u.email),
          name: u.name,
          phone: u.phone,
          passwordHash,
          role,
        });
        userId = created.id;
        console.log(`imported ${created.email} (${created.role})`);
      }

      // Admins bypass station scoping, so they do not need a group.
      if (role === "admin") {
        ok++;
        continue;
      }

      const setKey = locationSetKey(resolved.ids);
      let group = groups.find((g) => locationSetKey(g.locationIds) === setKey);
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
        `failed ${u.email}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `done: ${ok}/${users.length} users, ${createdGroups} group(s) created`,
  );
  if (ok !== users.length) Deno.exitCode = 1;
}
