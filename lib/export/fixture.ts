// Export test fixtures - a barrier factory plus batch/KPI builders.
// This is why it exists: the export tests (row mapping, the three server
// streamers) all need the same fully-populated Barrier, and the streamers now
// take batches plus a KPI snapshot instead of one array.
import type { Barrier, KpiSnapshot } from "../types.ts";

import { computeKpi } from "../utils.ts";

// mkBarrier: a complete, non-conforming-by-default barrier; override only the
// fields a test cares about.
export function mkBarrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "PSV-001",
    typology: "Estação Coletora",
    location: "FAL",
    locDesc: "FAL - Olinda",
    criticality: "D",
    category: "Válvula de Alívio de Pressão",
    grouping: "Sistemas de Alívio",
    owner: "Equipe de Manutenção",
    availability: "Disponível",
    compliance: "Conforme",
    comments: "",
    actionPlan: "",
    statusSince: "2026-01-01",
    statusHistory: [],
    origin: "",
    externalCode: "",
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

// mkCount: a barrier factory for n sequential rows (id 1..n).
export function mkCount(n: number): Barrier[] {
  return Array.from(
    { length: n },
    (_, i) => mkBarrier({ id: i + 1, tag: `PSV-${i + 1}` }),
  );
}

// batches: the shape the server streamers consume - an async iterable of
// batches, split every `size` rows the way the database paged them.
export function batchesOf(
  barriers: Barrier[],
  size = 500,
): AsyncIterable<Barrier[]> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let at = 0; at < barriers.length; at += size) {
        yield barriers.slice(at, at + size);
      }
    },
  };
}

// kpiOf: the aggregate the route passes alongside the rows, so a test can
// check that the streamed summary matches what the rows imply.
export function kpiOf(barriers: Barrier[]): KpiSnapshot {
  return computeKpi(barriers);
}
