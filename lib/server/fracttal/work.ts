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
  hasContingencySignal,
  isClosedRequestStatus,
  isoDate,
  isPreventiveWork,
  mergeEvent,
  type StatusEvent,
} from "./barrier-rules.ts";

import type { FracttalWorkOrder, FracttalWorkRequest } from "./types.ts";

import type { StatusParticipant } from "../../types.ts";

// WorkSlot is one row's contribution: an event per slot plus the stop flag.
// A row can carry a stop flag with no slot (open preventive WO on a stopped
// asset still drives out-of-service, matching the import).
export interface WorkSlot {
  urgent: StatusEvent | null;
  planned: StatusEvent | null;
  // Open preventive work drives Plano Cumprido? only; it never changes
  // availability. A row without corrective/preventive classification still
  // carries its stop flag.
  preventive: StatusEvent | null;
  stopAssets: boolean;
  stopEvent: StatusEvent | null;
  hasContingency: boolean;
}

// WorkEvents is the merged per-code signal handed to the mapper.
export interface WorkEvents {
  urgent: StatusEvent | null;
  planned: StatusEvent | null;
  preventive: StatusEvent | null;
  stopAssets: boolean;
  stopEvent?: StatusEvent | null;
  hasContingency?: boolean;
  contingencySource?: string;
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
    tasks_log_types_2_description: str("tasks_log_types_2_description"),
    tasks_log_task_type_main: str("tasks_log_task_type_main"),
    types_description: str("types_description"),
    stop_assets: bool("stop_assets"),
    wo_folio: str("wo_folio"),
    description: str("description"),
    task_note: str("task_note"),
    note: str("note"),
    initial_date: str("initial_date"),
    date_maintenance: str("date_maintenance"),
    creation_date: str("creation_date"),
    created_by: str("created_by"),
    requested_by: str("requested_by"),
    personnel_description: str("personnel_description"),
    user_assigned: str("user_assigned"),
    resources_human_resources: str("resources_human_resources"),
    validated_by_description: str("validated_by_description"),
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
    types_description: str("types_description"),
    wo_folio: str("wo_folio"),
    description: str("description"),
    observation: str("observation"),
    date_maintenance: str("date_maintenance"),
    created_by: str("created_by"),
    requested_by: str("requested_by"),
    personnel_description: str("personnel_description"),
    user_assigned: str("user_assigned"),
    resources_human_resources: str("resources_human_resources"),
    validated_by_description: str("validated_by_description"),
  };
}

// workOrderEvent distills a row to a shared status event: earliest of the
// candidate date fields plus folio + description (capped like the import).
// detail is the action note the technician sees (task_note wins over note);
// trade is the discipline label used by the owner heuristic.
function workOrderEvent(wo: FracttalWorkOrder): StatusEvent {
  const folio = (wo.wo_folio ?? "").trim();
  const desc = (wo.description ?? "").trim();
  return {
    date: earliestDate(
      isoDate(wo.initial_date),
      earliestDate(isoDate(wo.date_maintenance), isoDate(wo.creation_date)),
    ),
    source: (folio ? `${folio}: ${desc}` : desc).slice(0, 800),
    detail: ((wo.task_note ?? "").trim() || (wo.note ?? "").trim() || desc)
      .slice(0, 800),
    trade: ((wo.tasks_log_types_2_description ?? "").trim() ||
      (wo.tasks_log_task_type_main ?? "").trim()).slice(0, 120),
    sourceType: "Ordem de serviço",
    classification: (wo.tasks_log_types_description ?? wo.types_description ??
      "").trim(),
    operationState: wo.done === false ? "Em aberto" : "Concluída",
    sourceAuthor: preferredAuthor(wo.created_by, wo.requested_by),
    participants: peopleFromFields(wo),
  };
}

// workRequestEvent distills a request the same way (maintenance date only,
// mirroring the import extractor). observation is the closer's action note.
function workRequestEvent(wr: FracttalWorkRequest): StatusEvent {
  const folio = (wr.wo_folio ?? "").trim();
  const desc = (wr.description ?? "").trim();
  return {
    date: isoDate(wr.date_maintenance),
    source: (folio ? `${folio}: ${desc}` : desc).slice(0, 800),
    detail: ((wr.observation ?? "").trim() || desc).slice(0, 800),
    trade: (wr.types_description ?? "").trim().slice(0, 120),
    sourceType: "Solicitação de serviço",
    classification: (wr.types_2_description ?? "").trim(),
    operationState: "Em aberto",
    sourceAuthor: preferredAuthor(wr.created_by, wr.requested_by),
    participants: peopleFromFields(wr),
  };
}

function preferredAuthor(
  creator: string | null,
  requester: string | null,
): string | null {
  return creator?.trim() || requester?.trim() || null;
}

function peopleFromFields(
  row: Pick<
    FracttalWorkOrder,
    | "created_by"
    | "requested_by"
    | "personnel_description"
    | "user_assigned"
    | "resources_human_resources"
    | "validated_by_description"
  >,
): StatusParticipant[] {
  const people: StatusParticipant[] = [];
  const add = (value: string | null, role: string): void => {
    for (const name of (value ?? "").split(";")) {
      const clean = name.trim();
      if (clean !== "") people.push({ name: clean, role });
    }
  };
  add(row.created_by, "Criado por");
  add(row.requested_by, "Solicitado por");
  add(row.personnel_description, "Executor");
  add(row.user_assigned, "Responsável");
  add(row.resources_human_resources, "Recursos humanos");
  add(row.validated_by_description, "Validado por");
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = `${person.name.toLowerCase()}|${person.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// workOrderSlot sorts one order: closed rows (done !== false) carry no
// signal; open rows classify into a slot and always report the stop flag.
// Contingency rides along when the row text carries it (GM/CEC/contingência
// in description or folio); promotion to 2/3 happens in resolveAvailability
// only when a corrective slot exists, so preventive contingency notes stay
// inert by design.
export function workOrderSlot(wo: FracttalWorkOrder): WorkSlot | null {
  if (wo.done !== false) return null;
  const slot = classifyCorrective(
    wo.tasks_log_types_description,
    wo.types_description,
  );
  const event = workOrderEvent(wo);
  const preventive = isPreventiveWork(
      wo.tasks_log_types_description,
      wo.tasks_log_types_2_description,
    )
    ? event
    : null;
  return {
    urgent: slot === "urgent" ? event : null,
    planned: slot === "planned" ? event : null,
    preventive,
    stopAssets: wo.stop_assets === true,
    stopEvent: wo.stop_assets === true ? event : null,
    hasContingency: hasContingencySignal(wo.description, wo.wo_folio),
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
    preventive: null,
    stopAssets: false,
    stopEvent: null,
    hasContingency: hasContingencySignal(wr.description, wr.wo_folio),
  };
}

// contingencyFromRaw scans the wider free-text surface of a raw work row
// (task notes, labels, custom status) for a contingency signal. The parsed
// structs only carry description/folio; live rows may carry GM/CEC in
// labels or the custom status field (both empty in the dump samples but
// present in the schema), so the merge ORs this with the parsed check.
export function contingencyFromRaw(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const row = raw as Record<string, unknown>;
  const texts: Array<string | null> = [];
  for (
    const key of [
      "description",
      "task_note",
      "note",
      "notes",
      "task_description",
      "work_orders_status_custom_description",
      "types_description",
      "tasks_log_types_description",
      "types_2_description",
    ] as const
  ) {
    const v = row[key];
    if (typeof v === "string") texts.push(v);
  }
  const labels = row["labels"];
  if (Array.isArray(labels)) {
    for (const l of labels) {
      if (typeof l === "string") texts.push(l);
      else if (typeof l === "object" && l !== null) {
        const o = l as Record<string, unknown>;
        if (typeof o["description"] === "string") {
          texts.push(o["description"] as string);
        }
        if (typeof o["name"] === "string") texts.push(o["name"] as string);
      }
    }
  }
  return hasContingencySignal(...texts);
}

// buildWorkEvents folds raw order/request rows into per-code merged signals.
// Malformed rows are listed (never thrown): one bad row must not kill the
// batch, and the caller logs the count before the sync runs.
// itemIdToCode is an optional fallback for open-sweep rows whose `code`
// arrives empty (observed live: every such row still carries numeric
// `id_item`). The caller builds it from the same cycle's equipment sweep
// (or the previous cycle's - id/code mappings are stable); recovered rows
// are counted separately so ops can tell fallback signal from direct joins.
export function buildWorkEvents(
  orders: unknown[],
  requests: unknown[],
  opts: { itemIdToCode?: (id: number) => string | null } = {},
): {
  events: Map<string, WorkEvents>;
  malformed: Array<{ index: number; reason: string }>;
  recovered: number;
} {
  const events = new Map<string, WorkEvents>();
  const malformed: Array<{ index: number; reason: string }> = [];
  let recovered = 0;
  const blank = (): WorkEvents => ({
    urgent: null,
    planned: null,
    preventive: null,
    stopAssets: false,
    stopEvent: null,
    hasContingency: false,
    contingencySource: "",
  });
  const bad = (index: number, err: unknown) => {
    malformed.push({
      index,
      reason: err instanceof Error ? err.message : String(err),
    });
  };
  orders.forEach((raw, i) => {
    try {
      const patched = withItemCode(raw, opts.itemIdToCode);
      const wo = parseWorkOrder(patched.row);
      const slot = workOrderSlot(wo);
      if (!slot) return;
      if (patched.recovered) recovered++;
      const acc = events.get(wo.code) ?? blank();
      if (slot.urgent) acc.urgent = mergeEvent(acc.urgent, slot.urgent);
      if (slot.planned) acc.planned = mergeEvent(acc.planned, slot.planned);
      if (slot.preventive) {
        acc.preventive = mergeEvent(acc.preventive, slot.preventive);
      }
      acc.stopAssets = acc.stopAssets || slot.stopAssets;
      if (slot.stopEvent) {
        acc.stopEvent = mergeEvent(acc.stopEvent ?? null, slot.stopEvent);
      }
      const cont = slot.hasContingency || contingencyFromRaw(patched.row);
      if (cont && (acc.contingencySource ?? "") === "") {
        const folio = (wo.wo_folio ?? "").trim();
        const desc = (wo.description ?? "").trim();
        acc.contingencySource = (folio ? `${folio}: ${desc}` : desc)
          .slice(0, 800);
      }
      acc.hasContingency = (acc.hasContingency ?? false) || cont;
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
      const cont = slot.hasContingency || contingencyFromRaw(raw);
      if (cont && (acc.contingencySource ?? "") === "") {
        const folio = (wr.wo_folio ?? "").trim();
        const desc = (wr.description ?? "").trim();
        acc.contingencySource = (folio ? `${folio}: ${desc}` : desc)
          .slice(0, 800);
      }
      acc.hasContingency = (acc.hasContingency ?? false) || cont;
      events.set(wr.code_item, acc);
    } catch (err) {
      bad(orders.length + i, err);
    }
  });
  return { events, malformed, recovered };
}

// withItemCode patches an order row whose `code` is empty from the
// equipment id map (same-cycle or previous-cycle sweep). Returns the row to
// parse plus whether the fallback fired; a fired fallback that still fails
// to parse lands in malformed like any other bad row.
function withItemCode(
  raw: unknown,
  itemIdToCode?: (id: number) => string | null,
): { row: unknown; recovered: boolean } {
  if (itemIdToCode === undefined) return { row: raw, recovered: false };
  if (typeof raw !== "object" || raw === null) {
    return { row: raw, recovered: false };
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.code === "string" && row.code !== "") {
    return { row: raw, recovered: false };
  }
  if (typeof row.id_item !== "number") return { row: raw, recovered: false };
  const code = itemIdToCode(row.id_item);
  if (typeof code !== "string" || code === "") {
    return { row: raw, recovered: false };
  }
  return { row: { ...row, code }, recovered: true };
}

// resolverFor adapts a merged map to the lookup runSync consumes.
export function resolverFor(
  events: Map<string, WorkEvents>,
): WorkEventsResolver {
  return (code: string) => events.get(code) ?? null;
}
