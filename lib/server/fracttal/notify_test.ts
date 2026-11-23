// Unit tests for ops failure notifications: console always, and a throwing
// notifier must never break the fanout.
import {
  consoleNotifier,
  maskEmail,
  notifyFailureToAll,
  type SyncFailureInfo,
} from "./notify.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

const info: SyncFailureInfo = {
  scope: "fracttal-live:FAL",
  startedAt: "2026-09-12T10:00:00.000Z",
  note: "upstream error 500",
  runId: 7,
};

Deno.test("consoleNotifier emits a loud structured line", async () => {
  const calls: string[] = [];
  const original = console.error;
  console.error = (l: string) => calls.push(l);
  try {
    await consoleNotifier.syncFailed(info);
  } finally {
    console.error = original;
  }
  assertStrictEquals(calls.length, 1);
  assertStrictEquals(calls[0]!.includes("ERROR"), true);
  assertStrictEquals(calls[0]!.includes("[fracttal-live:FAL]"), true);
  assertStrictEquals(calls[0]!.includes('note="upstream error 500"'), true);
  assertStrictEquals(calls[0]!.includes("runId=7"), true);
});

Deno.test("notifyFailureToAll fans out and swallows a throwing notifier", async () => {
  const called: string[] = [];
  const bad = {
    name: "bad",
    syncFailed(): Promise<void> {
      throw new Error("relay down");
    },
  };
  const good = {
    name: "good",
    syncFailed(i: SyncFailureInfo) {
      called.push(i.scope);
      return Promise.resolve();
    },
  };
  const errors: string[] = [];
  const original = console.error;
  console.error = (l: string) => errors.push(l);
  try {
    await notifyFailureToAll([bad, good], info);
  } finally {
    console.error = original;
  }
  assertStrictEquals(called.join(","), "fracttal-live:FAL");
  assertStrictEquals(errors.length, 1);
  assertStrictEquals(errors[0]!.includes("relay down"), true);
});

Deno.test("maskEmail hides the local part of emails", () => {
  const out = maskEmail("user@example.com failed");
  assertStrictEquals(out.includes("user"), false);
  assertStrictEquals(out.includes("u***@example.com"), true);
});

Deno.test("consoleNotifier masks emails in the note", async () => {
  const calls: string[] = [];
  const original = console.error;
  console.error = (l: string) => calls.push(l);
  try {
    await consoleNotifier.syncFailed({
      scope: "fracttal-live:FAL",
      startedAt: "2026-09-12T10:00:00.000Z",
      note: "boom user@example.com",
      runId: 7,
    });
  } finally {
    console.error = original;
  }
  assertStrictEquals(calls.length, 1);
  assertStrictEquals(calls[0]!.includes("user@example.com"), false);
  assertStrictEquals(calls[0]!.includes("u***@example.com"), true);
});
