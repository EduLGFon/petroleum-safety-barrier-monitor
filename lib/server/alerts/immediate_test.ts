// Unit tests for immediate fan-out - fake store + fake mailer, no DB.
// Proves the hybrid contract: matches always enqueue, only immediate rules
// send at once, muted categories send nothing, and mail failures never
// throw (the digest cron retries from the enqueued row).
import { buildImmediateEvent, maybeSendImmediate } from "./immediate.ts";

import type { AlertStore, NewAlertEvent, UnsentAlert } from "./store.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { AlertRule } from "../sql/alert_rules.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import type { AlertMailer } from "./mailer.ts";

function wireBarrier(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 1,
    tag: "FAL-EQ-001",
    typologyId: 3,
    locationId: 1,
    locDescId: 0,
    criticalityId: 1,
    categoryId: 1,
    groupingId: 0,
    ownerId: -1,
    availabilityId: 5,
    comments: "",
    actionPlan: "",
    statusSince: "2026-09-13",
    statusHistory: [],
    ...over,
  };
}

function rule(over: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 1,
    name: "regra",
    category_id: null,
    to_status_id: null,
    critical_only: false,
    include_recovery: false,
    stale_days: null,
    notify_immediate: false,
    active: true,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

class FakeStore
  implements Pick<AlertStore, "enqueue" | "listUnsent" | "markDelivered"> {
  events: UnsentAlert[] = [];
  nextId = 1;
  sentIds = new Set<number>();

  enqueue(events: NewAlertEvent[]): Promise<number> {
    let added = 0;
    for (const e of events) {
      if (this.events.some((x) => x.dedupKey === e.dedupKey)) continue;
      this.events.push({ ...e, id: this.nextId++ });
      added++;
    }
    return Promise.resolve(added);
  }

  listUnsent(): Promise<UnsentAlert[]> {
    return Promise.resolve(this.events.filter((e) => !this.sentIds.has(e.id)));
  }

  markDelivered(id: number, email: string, complete: boolean): Promise<void> {
    const e = this.events.find((x) => x.id === id)!;
    if (!e.payload.delivered.includes(email)) e.payload.delivered.push(email);
    if (complete) this.sentIds.add(id);
    return Promise.resolve();
  }
}

function fakeMailer(opts: { fail?: boolean; hang?: boolean } = {}): {
  mailer: AlertMailer;
  sent: string[];
} {
  const sent: string[] = [];
  const mailer: AlertMailer = {
    name: "fake",
    send: (to) => {
      if (opts.fail) throw new Error("relay down");
      if (opts.hang) return new Promise<void>(() => {});
      sent.push(...to);
      return Promise.resolve();
    },
  };
  return { mailer, sent };
}

Deno.test("legacy match enqueues without sending", async () => {
  const store = new FakeStore();
  const { mailer, sent } = fakeMailer();
  const r = await maybeSendImmediate({
    store,
    barrier: wireBarrier(),
    statusId: 5,
    transitionDate: "2026-09-13",
    rules: [],
    hasAnyRule: false,
    mailer,
    recipients: [{ email: "ops@example.com" }],
  });
  assertStrictEquals(r.matched, true);
  assertStrictEquals(r.immediate, false);
  assertStrictEquals(r.enqueued, 1);
  assertStrictEquals(r.emailed, 0);
  assertStrictEquals(sent.length, 0);
});

Deno.test("immediate rule sends once and marks delivered", async () => {
  const store = new FakeStore();
  const { mailer, sent } = fakeMailer();
  const r = await maybeSendImmediate({
    store,
    barrier: wireBarrier(),
    statusId: 5,
    transitionDate: "2026-09-13",
    rules: [rule({ notify_immediate: true })],
    hasAnyRule: true,
    mailer,
    recipients: [{ email: "ops@example.com" }],
  });
  assertStrictEquals(r.matched, true);
  assertStrictEquals(r.immediate, true);
  assertStrictEquals(r.enqueued, 1);
  assertStrictEquals(r.emailed, 1);
  assertStrictEquals(sent.join(","), "ops@example.com");
  assertStrictEquals((await store.listUnsent()).length, 0);
});

Deno.test("muted category enqueues nothing and sends nothing", async () => {
  const store = new FakeStore();
  const { mailer, sent } = fakeMailer();
  const r = await maybeSendImmediate({
    store,
    barrier: wireBarrier({ categoryId: 3 }),
    statusId: 5,
    transitionDate: "2026-09-13",
    rules: [rule({ category_id: 7, notify_immediate: true })],
    hasAnyRule: true,
    mailer,
    recipients: [{ email: "ops@example.com" }],
  });
  assertStrictEquals(r.matched, false);
  assertStrictEquals(r.enqueued, 0);
  assertStrictEquals(sent.length, 0);
});

Deno.test("mail failure still enqueues and never throws", async () => {
  const store = new FakeStore();
  const { mailer, sent } = fakeMailer({ fail: true });
  const r = await maybeSendImmediate({
    store,
    barrier: wireBarrier(),
    statusId: 5,
    transitionDate: "2026-09-13",
    rules: [rule({ notify_immediate: true })],
    hasAnyRule: true,
    mailer,
    recipients: [{ email: "ops@example.com" }],
  });
  assertStrictEquals(r.matched, true);
  assertStrictEquals(r.enqueued, 1);
  assertStrictEquals(r.emailed, 0);
  assertStrictEquals(sent.length, 0);
  assertStrictEquals((await store.listUnsent()).length, 1);
});

Deno.test("hung relay trips the timeout and leaves the event unsent", async () => {
  const store = new FakeStore();
  const { mailer } = fakeMailer({ hang: true });
  const r = await maybeSendImmediate({
    store,
    barrier: wireBarrier(),
    statusId: 5,
    transitionDate: "2026-09-13",
    rules: [rule({ notify_immediate: true })],
    hasAnyRule: true,
    mailer,
    recipients: [{ email: "ops@example.com" }],
    timeoutMs: 20,
  });
  assertStrictEquals(r.matched, true);
  assertStrictEquals(r.enqueued, 1);
  assertStrictEquals(r.emailed, 0);
});

Deno.test("dedup hit on an already delivered event skips the send", async () => {
  const store = new FakeStore();
  const { mailer, sent } = fakeMailer();
  const base = {
    store,
    barrier: wireBarrier(),
    statusId: 5,
    transitionDate: "2026-09-13",
    rules: [rule({ notify_immediate: true })],
    hasAnyRule: true,
    mailer,
    recipients: [{ email: "ops@example.com" }],
  };
  await maybeSendImmediate(base);
  const second = await maybeSendImmediate(base);
  assertStrictEquals(second.enqueued, 0);
  assertStrictEquals(second.emailed, 0);
  assertStrictEquals(sent.length, 1);
});

Deno.test("buildImmediateEvent reuses the transition dedup key", () => {
  const event = buildImmediateEvent(wireBarrier(), "2026-09-13", 5, true);
  assertStrictEquals(event.dedupKey, "1:2026-09-13:5");
  assertStrictEquals(event.payload.immediate, true);
  assertStrictEquals(event.payload.tag, "FAL-EQ-001");
});
