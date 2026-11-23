// Unit tests for recipient batch id validation and list bounds (pure, no DB).
import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@^1";

import {
  batchRecipients,
  LIST_RECIPIENTS_MAX_ROWS,
  listRecipients,
  validateRecipientIds,
} from "./recipients.ts";

import type { TxQuery } from "../db.ts";

import { ValidationError } from "../validation.ts";

Deno.test("validateRecipientIds accepts and dedupes positive ids", () => {
  assertEquals(validateRecipientIds([3, 1, 3]), [3, 1]);
});

Deno.test("validateRecipientIds rejects empty, oversized, and bad values", () => {
  assertThrows(() => validateRecipientIds([]), ValidationError);
  assertThrows(() => validateRecipientIds([0]), ValidationError);
  assertThrows(() => validateRecipientIds([1.5]), ValidationError);
  assertThrows(
    () => validateRecipientIds([Number.MAX_SAFE_INTEGER + 1]),
    ValidationError,
  );
  assertThrows(
    () => validateRecipientIds("no" as unknown),
    ValidationError,
  );
  const big = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => validateRecipientIds(big), ValidationError);
});

Deno.test("validateRecipientIds dedupes before the max cap", () => {
  assertEquals(validateRecipientIds(new Array(501).fill(7)), [7]);
  const distinct = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => validateRecipientIds(distinct), ValidationError);
});

Deno.test("batchRecipients accepts the four canonical actions", async () => {
  for (const action of ["activate", "deactivate", "delete"]) {
    await assertRejects(
      () => batchRecipients(action, []),
      ValidationError,
    );
  }
  await assertRejects(
    () => batchRecipients("addUsers", undefined, []),
    ValidationError,
  );
});

Deno.test("batchRecipients rejects unknown action", async () => {
  await assertRejects(() => batchRecipients("nope", [1]), ValidationError);
});

Deno.test("listRecipients bounds the manual list with a documented cap", async () => {
  const calls: Array<{ text: string; args: Array<unknown> }> = [];
  const query: TxQuery = <U>(
    text: string,
    args: Array<unknown> = [],
  ): Promise<U[]> => {
    calls.push({ text, args });
    return Promise.resolve([] as U[]);
  };

  assertEquals(await listRecipients(false, query), []);
  assert(calls[0]!.text.includes("order by id"));
  assert(calls[0]!.text.includes("limit $1"));
  assertEquals(calls[0]!.args, [LIST_RECIPIENTS_MAX_ROWS]);
  assert(LIST_RECIPIENTS_MAX_ROWS > 0 && LIST_RECIPIENTS_MAX_ROWS <= 5000);

  await listRecipients(true, query);
  assert(calls[1]!.text.includes("where active"));
  assertEquals(calls[1]!.args, [LIST_RECIPIENTS_MAX_ROWS]);
});
