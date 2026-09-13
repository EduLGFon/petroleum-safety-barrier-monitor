// Unit tests for the alert cycle (P5) - fake store + fake mailer, no DB.
// Proves the acceptance behaviors: exactly one email per recipient, rerun
// sends zero, partial delivery resumes without duplicates, failures
// dead-letter and reprocess on demand.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import type { WireBarrier } from "../../wireTypes.ts";
import { MAX_SEND_RUNS, runAlertCycle } from "./run.ts";
import type { AlertMailer } from "./mailer.ts";
import {
  type AlertStore,
  dedupKey,
  type NewAlertEvent,
  type TransitionCandidate,
  type UnsentAlert,
} from "./store.ts";

function wireBarrier(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 1,
    tag: "FAL-EQ-001",
    tipologiaId: 3,
    locationId: 1,
    locDescId: 0,
    criticidadeId: 1,
    categoriaId: 1,
    agrupamentoId: 0,
    donoId: -1,
    disponibilidadeId: 5,
    comentarios: "",
    planoAcao: "",
    statusSince: "2026-09-13",
    statusHistory: [],
    ...over,
  };
}

class FakeStore implements AlertStore {
  transitions: TransitionCandidate[] = [];
  events: UnsentAlert[] = [];
  nextId = 1;
  sentIds = new Set<number>();
  enqueues = 0;

  watermark(): Promise<string | null> {
    return Promise.resolve(null);
  }

  recentTransitions(
    since: string | null,
    onlyBarrierIds?: number[],
  ): Promise<TransitionCandidate[]> {
    return Promise.resolve(
      this.transitions.filter((t) =>
        // >= like the SQL store: the watermark is an optimization, the
        // dedup_key is the correctness mechanism.
        (since === null || t.transitionDate >= since) &&
        (onlyBarrierIds === undefined || onlyBarrierIds.includes(t.barrierId))
      ),
    );
  }

  enqueue(events: NewAlertEvent[]): Promise<number> {
    this.enqueues++;
    let added = 0;
    for (const e of events) {
      if (this.events.some((x) => x.dedupKey === e.dedupKey)) continue;
      this.events.push({ ...e, id: this.nextId++ });
      added++;
    }
    return Promise.resolve(added);
  }

  listUnsent(): Promise<UnsentAlert[]> {
    return Promise.resolve(
      this.events.filter((e) =>
        !this.sentIds.has(e.id) && e.payload.deadLetter !== true
      ),
    );
  }

  countDead(): Promise<number> {
    return Promise.resolve(
      this.events.filter((e) =>
        !this.sentIds.has(e.id) && e.payload.deadLetter === true
      ).length,
    );
  }

  markDelivered(
    id: number,
    email: string,
    complete: boolean,
  ): Promise<void> {
    const e = this.events.find((x) => x.id === id)!;
    if (!e.payload.delivered.includes(email)) {
      e.payload.delivered.push(email);
    }
    if (complete) this.sentIds.add(id);
    return Promise.resolve();
  }

  markFailed(
    id: number,
    error: string,
    deadLetter: boolean,
  ): Promise<void> {
    const e = this.events.find((x) => x.id === id)!;
    e.payload.attempts++;
    e.payload.lastError = error;
    e.payload.deadLetter = deadLetter;
    return Promise.resolve();
  }

  reprocessDeadLetters(): Promise<number> {
    let n = 0;
    for (const e of this.events) {
      if (e.payload.deadLetter === true) {
        e.payload.deadLetter = false;
        e.payload.attempts = 0;
        e.payload.lastError = null;
        n++;
      }
    }
    return Promise.resolve(n);
  }
}

function batchLoader(barriers: Map<number, WireBarrier>) {
  return (ids: number[]): Promise<Map<number, WireBarrier>> => {
    const out = new Map<number, WireBarrier>();
    for (const id of ids) {
      const w = barriers.get(id);
      if (w !== undefined) out.set(id, w);
    }
    return Promise.resolve(out);
  };
}

interface SentMail {
  to: string[];
  subject: string;
  body: string;
}

function fakeMailer(opts: { failTo?: string[]; failAll?: boolean } = {}): {
  mailer: AlertMailer;
  sent: SentMail[];
} {
  const sent: SentMail[] = [];
  const failTo = new Set(opts.failTo ?? []);
  const mailer: AlertMailer = {
    name: "fake",
    send: (to, subject, body) => {
      if (opts.failAll || to.some((t) => failTo.has(t))) {
        throw new Error("relay down");
      }
      sent.push({ to, subject, body });
      return Promise.resolve();
    },
  };
  return { mailer, sent };
}

function urgentTransition(
  barrierId: number,
  date: string,
): TransitionCandidate {
  return { barrierId, transitionDate: date, statusId: 5 };
}

Deno.test("cycle sends exactly one digest and reruns send zero", async () => {
  const store = new FakeStore();
  store.transitions = [urgentTransition(1, "2026-09-13")];
  const barriers = new Map([[1, wireBarrier()]]);
  const { mailer, sent } = fakeMailer();
  const base = {
    store,
    loadBarriers: batchLoader(barriers),
    mailer,
    recipients: [{ email: "ops@example.com" }],
    dryRun: false,
    retry: { attempts: 1 },
  };
  const first = await runAlertCycle(base);
  assertStrictEquals(first.enqueued, 1);
  assertStrictEquals(first.sent, 1);
  assertStrictEquals(first.emails, 1);
  assertStrictEquals(sent.length, 1);
  assertStrictEquals(sent[0]!.to.join(","), "ops@example.com");
  assertStrictEquals(sent[0]!.body.includes("FAL-EQ-001"), true);

  const second = await runAlertCycle(base);
  assertStrictEquals(second.enqueued, 0);
  assertStrictEquals(second.sent, 0);
  assertStrictEquals(second.emails, 0);
  assertStrictEquals(sent.length, 1);
});

Deno.test("cycle skips calm landings and missing barriers", async () => {
  const store = new FakeStore();
  store.transitions = [
    { barrierId: 1, transitionDate: "2026-09-13", statusId: 0 }, // Disponível
    { barrierId: 2, transitionDate: "2026-09-13", statusId: 5 }, // gone
  ];
  const barriers = new Map([[1, wireBarrier({ disponibilidadeId: 0 })]]);
  const { mailer, sent } = fakeMailer();
  const r = await runAlertCycle({
    store,
    loadBarriers: batchLoader(barriers),
    mailer,
    recipients: [{ email: "ops@example.com" }],
    dryRun: false,
    retry: { attempts: 1 },
  });
  assertStrictEquals(r.detected, 0);
  assertStrictEquals(r.enqueued, 0);
  assertStrictEquals(sent.length, 0);
});

Deno.test("cycle sends one digest per recipient with the same events", async () => {
  const store = new FakeStore();
  store.transitions = [
    urgentTransition(1, "2026-09-13"),
    urgentTransition(2, "2026-09-13"),
  ];
  const barriers = new Map([
    [1, wireBarrier()],
    [2, wireBarrier({ id: 2, tag: "FAL-EQ-002" })],
  ]);
  const { mailer, sent } = fakeMailer();
  const r = await runAlertCycle({
    store,
    loadBarriers: batchLoader(barriers),
    mailer,
    recipients: [{ email: "a@x" }, { email: "b@x" }],
    dryRun: false,
    retry: { attempts: 1 },
  });
  assertStrictEquals(r.sent, 2);
  assertStrictEquals(r.emails, 2);
  assertStrictEquals(sent.length, 2);
  for (const s of sent) {
    assertStrictEquals(s.body.includes("FAL-EQ-001"), true);
    assertStrictEquals(s.body.includes("FAL-EQ-002"), true);
  }
});

Deno.test("cycle resumes partial delivery without duplicating", async () => {
  const store = new FakeStore();
  store.transitions = [urgentTransition(1, "2026-09-13")];
  const barriers = new Map([[1, wireBarrier()]]);
  const failing = fakeMailer({ failTo: ["b@x"] });
  const base = {
    store,
    loadBarriers: batchLoader(barriers),
    mailer: failing.mailer,
    recipients: [{ email: "a@x" }, { email: "b@x" }],
    dryRun: false,
    retry: { attempts: 1 },
  };
  const first = await runAlertCycle(base);
  assertStrictEquals(first.emails, 1); // a@x only
  assertStrictEquals(first.failed, 1);

  const fixed = fakeMailer();
  const second = await runAlertCycle({ ...base, mailer: fixed.mailer });
  assertStrictEquals(second.emails, 1);
  assertStrictEquals(fixed.sent.length, 1);
  assertStrictEquals(fixed.sent[0]!.to.join(","), "b@x"); // no dup to a@x
  assertStrictEquals(second.sent, 1);
});

Deno.test("cycle dead-letters after the run budget, reprocess retries", async () => {
  const store = new FakeStore();
  store.transitions = [urgentTransition(1, "2026-09-13")];
  const barriers = new Map([[1, wireBarrier()]]);
  const { mailer } = fakeMailer({ failAll: true });
  const base = {
    store,
    loadBarriers: batchLoader(barriers),
    mailer,
    recipients: [{ email: "ops@example.com" }],
    dryRun: false,
    retry: { attempts: 1 },
  };
  for (let i = 0; i < MAX_SEND_RUNS; i++) {
    await runAlertCycle(base);
  }
  const parked = await runAlertCycle(base);
  assertStrictEquals(parked.skippedDead, 1);
  assertStrictEquals(parked.emails, 0);

  const fixed = fakeMailer();
  const retried = await runAlertCycle({
    ...base,
    mailer: fixed.mailer,
    reprocess: true,
  });
  assertStrictEquals(retried.reprocessed, 1);
  assertStrictEquals(retried.emails, 1);
  assertStrictEquals(fixed.sent.length, 1);
});

Deno.test("dry-run detects but writes nothing and sends nothing", async () => {
  const store = new FakeStore();
  store.transitions = [urgentTransition(1, "2026-09-13")];
  const barriers = new Map([[1, wireBarrier()]]);
  const { mailer, sent } = fakeMailer();
  const r = await runAlertCycle({
    store,
    loadBarriers: batchLoader(barriers),
    mailer,
    recipients: [{ email: "ops@example.com" }],
    dryRun: true,
  });
  assertStrictEquals(r.detected, 1);
  assertStrictEquals(r.enqueued, 0);
  assertStrictEquals(sent.length, 0);
  assertStrictEquals(store.enqueues, 0);
  assertStrictEquals(store.events.length, 0);
});

Deno.test("dedupKey joins barrier, date and status", () => {
  assertStrictEquals(dedupKey(7, "2026-09-13", 5), "7:2026-09-13:5");
});
