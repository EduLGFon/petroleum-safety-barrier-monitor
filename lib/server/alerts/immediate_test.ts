// Unit tests for the immediate provider send - fake store + sender, no DB.
import type { AlertPayload, AlertStore, UnsentAlert } from "./store.ts";

import { maybeSendProviderImmediate } from "./immediate.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { WireBarrier } from "../../wireTypes.ts";

function wire(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 7,
    tag: "TAG-007",
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
    statusSince: "2026-11-17",
    statusHistory: [],
    origin: "",
    externalCode: "EXT-007",
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

function payload(): AlertPayload {
  return {
    tag: "TAG-007",
    location: "L-01",
    availability: "Indisponivel",
    criticality: "A",
    urgency: "critical",
    attempts: 0,
    lastError: null,
    deadLetter: false,
    delivered: [],
  };
}

function fakeStore(pending: UnsentAlert): AlertStore & {
  accepted: number[];
  enqueued: number;
} {
  const store = {
    accepted: [] as number[],
    enqueued: 0,
    watermark() {
      return Promise.resolve(null);
    },
    recentTransitions() {
      return Promise.resolve([]);
    },
    enqueue() {
      store.enqueued++;
      return Promise.resolve(1);
    },
    listUnsent() {
      return Promise.resolve([pending]);
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
  } as unknown as AlertStore & { accepted: number[]; enqueued: number };
  return store;
}

function pendingEvent(): UnsentAlert {
  return {
    id: 10,
    barrierId: 7,
    transitionDate: "2026-11-17",
    statusId: 5,
    dedupKey: "7:2026-11-17:5",
    payload: payload(),
  };
}

Deno.test("immediate send filters recipients by the barrier station", async () => {
  const store = fakeStore(pendingEvent());
  const seen: string[][] = [];
  const result = await maybeSendProviderImmediate({
    store,
    loadBarriers: () => Promise.resolve(new Map()),
    sender: {
      post: (alert) => {
        seen.push(
          alert.destinatarios
            .filter((dest) => dest.canal === "email")
            .map((dest) => dest.valor),
        );
        return Promise.resolve({
          ok: true,
          duplicado: false,
          parcial: false,
          enfileirados: alert.destinatarios.length,
          fila_ids: [],
          por_canal: {},
          rejeitados: [],
          avisos: [],
          aviso_token: null,
          mensagem: "ok",
        });
      },
    },
    barrier: wire({ locationId: 1 }),
    statusId: 5,
    transitionDate: "2026-11-17",
    companyId: 1,
    recipients: [
      { email: "one@example.com", locationIds: [1] },
      { email: "two@example.com", locationIds: [2] },
    ],
  });
  assertStrictEquals(result.enqueued, 1);
  assertStrictEquals(result.posted, 1);
  assertStrictEquals(seen.length, 1);
  assertStrictEquals(seen[0]!.join(","), "one@example.com");
  assertStrictEquals(store.accepted.join(","), "10");
});

Deno.test("immediate send enqueues only when no recipient covers the station", async () => {
  const store = fakeStore(pendingEvent());
  let posts = 0;
  const result = await maybeSendProviderImmediate({
    store,
    loadBarriers: () => Promise.resolve(new Map()),
    sender: {
      post: () => {
        posts++;
        return Promise.reject(new Error("must not post"));
      },
    },
    barrier: wire({ locationId: 1 }),
    statusId: 5,
    transitionDate: "2026-11-17",
    companyId: 1,
    recipients: [{ email: "two@example.com", locationIds: [2] }],
  });
  assertStrictEquals(posts, 0);
  assertStrictEquals(result.enqueued, 1);
  assertStrictEquals(result.posted, 0);
  assertStrictEquals(store.accepted.length, 0);
});
