// Tests for the user import parser, station resolution and audit mode.
import {
  auditUsers,
  DEFAULT_USERS_FILE,
  firstPhone,
  MISSING_STATIONS_SENTINEL,
  parseUsers,
  resolveStations,
} from "./import-users.ts";

import { assertEquals } from "jsr:@std/assert@^1";

Deno.test("default users file points at the local roster fixture", () => {
  assertEquals(DEFAULT_USERS_FILE, "scripts/fixtures/_users.txt");
});

Deno.test("parseUsers reads blocks, stations and the first phone", () => {
  const text = [
    'Name - Email - Stations split by "/" - Phone number, if exists',
    "",
    "Ada Example",
    "",
    "ada@example.com",
    "",
    "FAL/CNC",
    "",
    "27 99999-9999 / 27 88888-8888",
    "",
    "Grace Example",
    "",
    "grace@example.com|admin",
    "",
    "Todas",
    "",
    "NA",
  ].join("\n");

  assertEquals(parseUsers(text), [
    {
      name: "Ada Example",
      email: "ada@example.com",
      stations: "FAL/CNC",
      phone: "5527999999999",
      admin: false,
    },
    {
      name: "Grace Example",
      email: "grace@example.com",
      stations: "Todas",
      phone: "",
      admin: true,
    },
  ]);
});

Deno.test("parseUsers keeps the next user when a phone is omitted", () => {
  const text = [
    "Ada Example",
    "ada@example.com",
    "FAL",
    "Grace Example",
    "grace@example.com",
    "CNC",
    "NA",
  ].join("\n");

  assertEquals(parseUsers(text), [
    {
      name: "Ada Example",
      email: "ada@example.com",
      stations: "FAL",
      phone: "",
      admin: false,
    },
    {
      name: "Grace Example",
      email: "grace@example.com",
      stations: "CNC",
      phone: "",
      admin: false,
    },
  ]);
});

Deno.test("firstPhone keeps only the first number and ignores NA", () => {
  assertEquals(firstPhone("27 90000-0000 / 27 91111-1111"), "5527900000000");
  assertEquals(firstPhone("NA"), "");
  assertEquals(firstPhone(""), "");
});

Deno.test("resolveStations maps codes and TODAS to location ids", () => {
  const locations = [
    { id: 1, code: "FAL" },
    { id: 2, code: "CNC" },
    { id: 3, code: "UGVMs" },
  ];

  assertEquals(resolveStations("FAL/CNC", locations), {
    ids: [1, 2],
    labels: ["FAL", "CNC"],
    missing: [],
  });
  assertEquals(resolveStations("Todas", locations), {
    ids: [1, 2, 3],
    labels: ["FAL", "CNC", "UGVMs"],
    missing: [],
  });
  // Apostrophes and casing are ignored for matching.
  assertEquals(resolveStations("UGVM's/fal", locations), {
    ids: [1, 3],
    labels: ["FAL", "UGVMs"],
    missing: [],
  });
  assertEquals(resolveStations("FAL/UNKNOWN", locations), {
    ids: [1],
    labels: ["FAL"],
    missing: ["UNKNOWN"],
  });
});

function fixtureUser(stations: string) {
  return {
    name: "Fixture User",
    email: "fixture@example.test",
    stations,
    phone: "5527900000000",
    admin: false,
  };
}

Deno.test("auditUsers reports zero missing when every station resolves", () => {
  const locations = [
    { id: 1, code: "FAL" },
    { id: 2, code: "CNC" },
  ];
  const users = [fixtureUser("FAL/CNC"), fixtureUser("Todas")];

  const audit = auditUsers(users, locations);

  assertEquals(audit.total, 2);
  assertEquals(audit.usersWithMissing, 0);
  assertEquals(audit.missingTokens, []);
  assertEquals(audit.rows, [
    { index: 1, missing: [] },
    { index: 2, missing: [] },
  ]);
});

Deno.test("auditUsers reports the user row and distinct unknown token", () => {
  const audit = auditUsers(
    [fixtureUser("FAL/ZZZ")],
    [{ id: 1, code: "FAL" }],
  );

  assertEquals(audit.total, 1);
  assertEquals(audit.usersWithMissing, 1);
  assertEquals(audit.missingTokens, ["ZZZ"]);
  assertEquals(audit.rows, [{ index: 1, missing: ["ZZZ"] }]);
});

Deno.test("auditUsers dedupes shared unknown tokens and counts users", () => {
  const users = [
    fixtureUser("FAL/ZZZ"),
    fixtureUser("ZZZ/CNC"),
    fixtureUser("FAL"),
  ];

  const audit = auditUsers(users, [{ id: 1, code: "FAL" }]);

  assertEquals(audit.total, 3);
  assertEquals(audit.usersWithMissing, 2);
  assertEquals(audit.missingTokens, ["CNC", "ZZZ"]);
  assertEquals(audit.rows, [
    { index: 1, missing: ["ZZZ"] },
    { index: 2, missing: ["ZZZ", "CNC"] },
    { index: 3, missing: [] },
  ]);
});

Deno.test("auditUsers reports a sentinel for empty stations", () => {
  const audit = auditUsers([fixtureUser("")], [{ id: 1, code: "FAL" }]);

  assertEquals(audit.usersWithMissing, 1);
  assertEquals(audit.missingTokens, [MISSING_STATIONS_SENTINEL]);
  assertEquals(audit.rows, [
    { index: 1, missing: [MISSING_STATIONS_SENTINEL] },
  ]);
});

Deno.test("auditUsers output excludes names, emails and phones", () => {
  const name = "Ada Fixture";
  const email = "ada.fixture@example.test";
  const phone = "5527988887777";
  const audit = auditUsers(
    [{ name, email, stations: "FAL/UNKNOWN", phone, admin: false }],
    [{ id: 1, code: "FAL" }],
  );

  const report = JSON.stringify(audit);
  assertEquals(report.includes(name), false);
  assertEquals(report.includes(email), false);
  assertEquals(report.includes(phone), false);
});
