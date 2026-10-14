// Unit tests for the provider cycle - fake store + fake sender, no DB.
import { runProviderCycle } from "./run-provider.ts";

import type { AlertStore, UnsentAlert } from "./store.ts";

import { dedupKey } from "./store.ts";

import type { WireBarrier } from "../../wireTypes.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

function wire(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 1,
    tag: "TAG-001",
    typologyId: 0,
    locationId: 1,
    locDescId: 0,
    criticalityId: 1,
    categoryId: 1,
    groupingId: 0,
    ownerId: -1,
    availabilityId: 5,
    comments: "",
    actionPlan: "",
    statusSince: "2026-10-14",
    statusHistory: [],
    origin: "",
    externalCode: "EXT-001",
    locationName: "",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "",
    contingencyDesc: "",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
    ...over,
  };
}

function fakeStore(events: UnsentAlert[] = []): AlertStore & {
  accepted: number[];
  posted: number;
} {
  const store = {
    accepted: [] as number[],
    posted: 0,
    watermark() {
      return Promise.resolve(null);
    },
    recentTransitions() {
      return Promise.resolve([]);
    },
    enqueue() {
      return Promise.resolve(0);
    },
    listUnsent() {
      return Promise.resolve(events);
    },
    countDead() {
      return Promise.resolve(0);
    },
    markDelivered() {
      return Promise.resolve();
    },
    markFailed() {
      return Promise.resolve();
    },
    reprocessDeadLetters() {
      return Promise.resolve(0);
    },
    markProviderAccepted(id: number) {
      store.accepted.push(id);
      return Promise.resolve();
    },
  } as unknown as AlertStore & { accepted: number[]; posted: number };
  return store;
}

function unsent(
  over: Partial<UnsentAlert> = {},
): UnsentAlert {
  return {
    id: 10,
    barrierId: 1,
    transitionDate: "2026-10-14",
    statusId: 5,
    dedupKey: dedupKey(1, "2026-10-14", 5),
    payload: {
      tag: "TAG-001",
      location: "L-01",
      availability: "Indisponivel",
      criticality: "A",
      urgency: "critical",
      attempts: 0,
      lastError: null,
      deadLetter: false,
      delivered: [],
    },
    ...over,
  };
}

Deno.test("provider cycle posts violada with messaging when phone exists", async () => {
  const store = fakeStore([unsent()]);
  const seen: string[][] = [];
  const result = await runProviderCycle({
    store,
    loadBarriers: () => Promise.resolve(new Map([[1, wire()]])),
    sender: {
      post: (payload) => {
        seen.push(payload.canais);
        return Promise.resolve({
          ok: true,
          duplicado: false,
          parcial: false,
          enfileirados: payload.destinatarios.length,
          fila_ids: [],
          por_canal: {},
          rejeitados: [],
          avisos: [],
          aviso_token: null,
          mensagem: "ok",
        });
      },
    },
    recipients: [{ email: "a@example.com", phone: "5527999999999" }],
    companyId: 1,
    dryRun: false,
    statusInfo: {
      labelOf: () => "Indisponivel",
      compliantOf: () => false,
    },
  });
  assertStrictEquals(result.sent, 1);
  assertStrictEquals(result.posted, 1);
  assertStrictEquals(seen[0]!.join(","), "email,messaging");
});

Deno.test("provider cycle keeps degraded email-only", async () => {
  const store = fakeStore([unsent({ statusId: 4 })]);
  const seen: string[][] = [];
  const result = await runProviderCycle({
    store,
    loadBarriers: () =>
      Promise.resolve(new Map([[1, wire({ availabilityId: 4 })]])),
    sender: {
      post: (payload) => {
        seen.push(payload.canais);
        return Promise.resolve({
          ok: true,
          duplicado: false,
          parcial: false,
          enfileirados: 1,
          fila_ids: [],
          por_canal: {},
          rejeitados: [],
          avisos: [],
          aviso_token: null,
          mensagem: "ok",
        });
      },
    },
    recipients: [{ email: "a@example.com", phone: "5527999999999" }],
    companyId: 1,
    dryRun: false,
    statusInfo: {
      labelOf: () => "Degradado",
      compliantOf: () => false,
    },
  });
  assertStrictEquals(result.sent, 1);
  assertStrictEquals(seen[0]!.join(","), "email");
});

Deno.test("provider cycle accepts planned stop without posting", async () => {
  const store = fakeStore([unsent({ statusId: 1 })]);
  let posts = 0;
  const result = await runProviderCycle({
    store,
    loadBarriers: () =>
      Promise.resolve(new Map([[1, wire({ availabilityId: 1 })]])),
    sender: {
      post: () => {
        posts++;
        return Promise.reject(new Error("must not post"));
      },
    },
    recipients: [{ email: "a@example.com" }],
    companyId: 1,
    dryRun: false,
  });
  assertStrictEquals(posts, 0);
  assertStrictEquals(result.sent, 1);
});
