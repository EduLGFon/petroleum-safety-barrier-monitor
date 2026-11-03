// Tests for the user import parser and station resolution.
import { firstPhone, parseUsers, resolveStations } from "./import-users.ts";

import { assertEquals } from "jsr:@std/assert@^1";

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
  assertEquals(firstPhone("27 996490272 / 27 995184989"), "5527996490272");
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
