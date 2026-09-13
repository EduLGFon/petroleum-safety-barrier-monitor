// Urgent transition detection - history rows that entered an urgent state.
// This is why it exists: the send path must only fire on transitions INTO
// urgent (a barrier that was already urgent last run is not news), resolved
// through the same isUrgent predicate the dashboard uses, so the email
// digest and the NcAlert card never disagree on what counts.
import { isUrgent, urgencyOf } from "../../dashboard/urgent.ts";
import { resolveBarrier } from "../../resolve.ts";
import type { WireBarrier } from "../../wireTypes.ts";
import { type AlertStore, dedupKey, type NewAlertEvent } from "./store.ts";

export interface DetectedUrgent extends NewAlertEvent {
  urgency: "critical" | "urgent";
}

// detectUrgentTransitions: candidates since the watermark, resolved to
// domain barriers, keeping only urgent landings. loadBarrier is injected
// (prod: getBarrierById) so tests never touch the database.
export async function detectUrgentTransitions(
  store: Pick<AlertStore, "recentTransitions">,
  loadBarrier: (id: number) => Promise<WireBarrier | null>,
  since: string | null,
  onlyBarrierIds?: number[],
): Promise<DetectedUrgent[]> {
  const candidates = await store.recentTransitions(since, onlyBarrierIds);
  const out: DetectedUrgent[] = [];
  for (const c of candidates) {
    const wire = await loadBarrier(c.barrierId);
    if (!wire) continue; // barrier deleted after the transition
    const barrier = resolveBarrier(wire);
    const urgency = urgencyOf(barrier);
    if (urgency === "none") continue; // landed somewhere calm
    out.push({
      barrierId: c.barrierId,
      transitionDate: c.transitionDate,
      statusId: c.statusId,
      dedupKey: dedupKey(c.barrierId, c.transitionDate, c.statusId),
      payload: {
        tag: barrier.tag,
        instalacao: barrier.instalacao,
        disponibilidade: barrier.disponibilidade,
        criticidade: barrier.criticidade,
        urgency,
        attempts: 0,
        lastError: null,
        deadLetter: false,
        delivered: [],
      },
      urgency,
    });
  }
  return out;
}

// isUrgent re-export for call sites that only need the gate.
export { isUrgent };
