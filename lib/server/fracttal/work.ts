// Live work-order signals for status derivation (Phase 1).
// This is why it exists: degraded / unavailable / out-of-service states come
// from corrective work orders and requests, which the item-only sync could
// not see (the first live sync would have decayed them to available).
// This module validates live /work_orders + /work_requests rows and folds
// them into per-code merged signals that runSync feeds to mapAsset. Row
// semantics mirror the dump import exactly (same classifiers, same event
// merge, same open/closed gates) so a live run and a rebuild agree.
import {
  classifyCorrective,
  classifyRequest,
  earliestDate,
  isClosedRequestStatus,
  isoDate,
  mergeEvent,
  type StatusEvent,
} from "./barrier-rules.ts";

import type { FracttalWorkOrder, FracttalWorkRequest } from "./types.ts";

// WorkSlot is one row's contribution: an event per slot plus the stop flag.
// A row can carry a stop flag with no slot (open preventive WO on a stopped
// asset still drives out-of-service, matching the import).
export interface WorkSlot {
  urgent: StatusEvent | null;
  planned: StatusEvent | null;
  stopAssets: boolean;
}

// WorkEvents is the merged per-code signal handed to the mapper.
export interface WorkEvents {
  urgent: StatusEvent | null;
  planned: StatusEvent | null;
  stopAssets: boolean;
}

// WorkEventsResolver looks up merged signals by asset code (null = no open
// work). Callers build it with resolverFor; tests inject fakes directly.
export type WorkEventsResolver = (code: string) => WorkEvents | null;

// parseWorkOrder validates one live work order row; identity (code) is
// required so unmatched rows fail loudly instead of vanishing.
export function parseWorkOrder(raw: unknown): FracttalWorkOrder {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("non-object work order row");
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.code !== "string" || row.code === "") {
    throw new Error("work order missing code");
  }
  const str = (k: string) => (typeof row[k] === "string" ? row[k] : null);
  const bool = (k: string) => (typeof row[k] === "boolean" ? row[k] : null);
  return {
    code: row.code,
    done: bool("done"),
    tasks_log_types_description: str("tasks_log_types_description"),
    types_description: str("types_description"),
    stop_assets: bool("stop_assets"),
    wo_folio: str("wo_folio"),
    description: str("description"),
    initial_date: str("initial_date"),
    date_maintenance: str("date_maintenance"),
    creation_date: str("creation_date"),
  };
}

// parseWorkRequest validates one live work request row (join key code_item).
export function parseWorkRequest(raw: unknown): FracttalWorkRequest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("non-object work request row");
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.code_item !== "string" || row.code_item === "") {
    throw new Error("work request missing code_item");
  }
  const str = (k: string) => (typeof row[k] === "string" ? row[k] : null);
  const num = (k: string) => (typeof row[k] === "number" ? row[k] : null);
  return {
    code_item: row.code_item,
    id_status: num("id_status"),
    types_2_description: str("types_2_description"),
    wo_folio: str("wo_folio"),
    description: str("description"),
    date_maintenance: str("date_maintenance"),
  };
}

// workOrderEvent distills a row to a shared status event: earliest of the
// candidate date fields plus folio + description (capped like the import).
function workOrderEvent(wo: FracttalWorkOrder): StatusEvent {
  const folio = (wo.wo_folio ?? "").trim();
  const desc = (wo.description ?? "").trim();
  return {
    date: earliestDate(
      isoDate(wo.initial_date),
      earliestDate(isoDate(wo.date_maintenance), isoDate(wo.creation_date)),
    ),
    source: (folio ? `${folio}: ${desc}` : desc).slice(0, 800),
  };
}

// workRequestEvent distills a request the same way (maintenance date only,
// mirroring the import extractor).
function workRequestEvent(wr: FracttalWorkRequest): StatusEvent {
  const folio = (wr.wo_folio ?? "").trim();
  const desc = (wr.description ?? "").trim();
  return {
    date: isoDate(wr.date_maintenance),
    source: (folio ? `${folio}: ${desc}` : desc).slice(0, 800),
  };
}

// workOrderSlot sorts one order: closed rows (done !== false) carry no
// signal; open rows classify into a slot and always report the stop flag.
export function workOrderSlot(wo: FracttalWorkOrder): WorkSlot | null {
  if (wo.done !== false) return null;
  const slot = classifyCorrective(
    wo.tasks_log_types_description,
    wo.types_description,
  );
  const event = workOrderEvent(wo);
  return {
    urgent: slot === "urgent" ? event : null,
    planned: slot === "planned" ? event : null,
    stopAssets: wo.stop_assets === true,
  };
}

// workRequestSlot sorts one request: closed statuses and non-corrective
// types carry no signal.
export function workRequestSlot(wr: FracttalWorkRequest): WorkSlot | null {
  if (isClosedRequestStatus(wr.id_status)) return null;
  const slot = classifyRequest(wr.types_2_description);
  if (slot === null) return null;
  const event = workRequestEvent(wr);
  return {
    urgent: slot === "urgent" ? event : null,
    planned: slot === "planned" ? event : null,
    stopAssets: false,
  };
}

// buildWorkEvents folds raw order/request rows into per-code merged signals.
// Malformed rows are listed (never thrown): one bad row must not kill the
// batch, and the caller logs the count before the sync runs.
export function buildWorkEvents(
  orders: unknown[],
  requests: unknown[],
): {
  events: Map<string, WorkEvents>;
  malformed: Array<{ index: number; reason: string }>;
} {
  const events = new Map<string, WorkEvents>();
  const malformed: Array<{ index: number; reason: string }> = [];
  const blank = (): WorkEvents => ({
    urgent: null,
    planned: null,
    stopAssets: false,
  });
  const bad = (index: number, err: unknown) => {
    malformed.push({
      index,
      reason: err instanceof Error ? err.message : String(err),
    });
  };
  orders.forEach((raw, i) => {
    try {
      const wo = parseWorkOrder(raw);
      const slot = workOrderSlot(wo);
      if (!slot) return;
      const acc = events.get(wo.code) ?? blank();
      if (slot.urgent) acc.urgent = mergeEvent(acc.urgent, slot.urgent);
      if (slot.planned) acc.planned = mergeEvent(acc.planned, slot.planned);
      acc.stopAssets = acc.stopAssets || slot.stopAssets;
      events.set(wo.code, acc);
    } catch (err) {
      bad(i, err);
    }
  });
  requests.forEach((raw, i) => {
    try {
      const wr = parseWorkRequest(raw);
      const slot = workRequestSlot(wr);
      if (!slot) return;
      const acc = events.get(wr.code_item) ?? blank();
      if (slot.urgent) acc.urgent = mergeEvent(acc.urgent, slot.urgent);
      if (slot.planned) acc.planned = mergeEvent(acc.planned, slot.planned);
      events.set(wr.code_item, acc);
    } catch (err) {
      bad(orders.length + i, err);
    }
  });
  return { events, malformed };
}

// resolverFor adapts a merged map to the lookup runSync consumes.
export function resolverFor(
  events: Map<string, WorkEvents>,
): WorkEventsResolver {
  return (code: string) => events.get(code) ?? null;
}
