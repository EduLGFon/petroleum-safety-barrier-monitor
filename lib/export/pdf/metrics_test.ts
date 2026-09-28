// Unit tests for the PDF text metrics - encoding, measurement and wrap.
// The width tables were dumped from pdf-lib's AFM data, so the spot-checks
// below pin known Adobe values: a bad dump fails here, not in a reader.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { encodeWinAnsi, textWidth, winAnsiByte, wrapText } from "./metrics.ts";

Deno.test("winAnsiByte maps ASCII, Latin-1 and the printable extras", () => {
  assertStrictEquals(winAnsiByte("A"), 0x41);
  assertStrictEquals(winAnsiByte("ç"), 0xe7);
  assertStrictEquals(winAnsiByte("ã"), 0xe3);
  assertStrictEquals(winAnsiByte(" "), 0xa0);
  assertStrictEquals(winAnsiByte("…"), 0x85);
  assertStrictEquals(winAnsiByte("—"), 0x97);
  assertStrictEquals(winAnsiByte("·"), 0xb7);
  // Unencodable input becomes "?", never a control byte or multibyte output.
  assertStrictEquals(winAnsiByte("→"), 0x3f);
  assertStrictEquals(winAnsiByte("😀"), 0x3f);
  assertStrictEquals(winAnsiByte(""), 0x3f);
});

Deno.test("encodeWinAnsi emits one byte per char", () => {
  assertEquals([...encodeWinAnsi("PSV-001 ãç")], [
    0x50,
    0x53,
    0x56,
    0x2d,
    0x30,
    0x30,
    0x31,
    0x20,
    0xe3,
    0xe7,
  ]);
});

Deno.test("textWidth matches known AFM advances", () => {
  // Helvetica space is 278 units: 10 of them at 10pt span 27.8pt.
  assertStrictEquals(textWidth("          ", "regular", 10), 27.8);
  // Digits are 556 units in both weights.
  assertStrictEquals(textWidth("0123456789", "regular", 10), 55.6);
  assertStrictEquals(textWidth("0123456789", "bold", 10), 55.6);
  // A is 667 regular, 722 bold.
  assertStrictEquals(textWidth("A", "regular", 10), 6.67);
  assertStrictEquals(textWidth("A", "bold", 10), 7.22);
  // Italic shares the regular advances; mono is fixed 600.
  assertStrictEquals(textWidth("A", "italic", 10), 6.67);
  assertStrictEquals(textWidth("PSV-001", "mono", 8), 7 * 4.8);
});

Deno.test("wrapText keeps every line inside the column", () => {
  const lines = wrapText(
    "Válvula de Alívio de Pressão",
    "regular",
    6.5,
    40,
  );
  assert(lines.length > 1, lines.join("|"));
  for (const line of lines) {
    assert(textWidth(line, "regular", 6.5) <= 40 + 1e-9, line);
  }
  assertEquals(lines.join(" "), "Válvula de Alívio de Pressão");
});

Deno.test("wrapText breaks an overlong token anywhere", () => {
  const token = "a".repeat(100);
  const lines = wrapText(token, "regular", 6.5, 40);
  assert(lines.length > 1);
  assertEquals(lines.join(""), token);
  for (const line of lines) {
    assert(textWidth(line, "regular", 6.5) <= 40 + 1e-9, line);
  }
});

Deno.test("wrapText keeps empty and single-line input intact", () => {
  assertEquals(wrapText("", "regular", 6.5, 40), [""]);
  assertEquals(wrapText("FAL", "regular", 6.5, 40), ["FAL"]);
});
