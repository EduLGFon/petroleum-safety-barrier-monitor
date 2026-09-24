// Barrier detail enrichment for alert emails - what the digest shows per
// barrier beyond tag/location/status. This is why it exists: the alert
// payload used to carry only four display strings, so the email could not
// name who updated the barrier or show its context. Detection already holds
// the full WireBarrier (history included), so we snapshot the detail here
// at enqueue time; the template renders what is present and skips the rest,
// keeping rows enqueued before this change readable.
import { resolveBarrier, type ResolverLabels } from "../../resolve.ts";
import type { WireBarrier } from "../../wireTypes.ts";

export interface BarrierDetail {
  typology?: string;
  grouping?: string;
  owner?: string;
  compliance?: string;
  locationName?: string;
  category?: string;
  author?: string;
  note?: string;
  actionPlan?: string;
}

// nonEmpty: trims, maps "" to undefined so the template's presence checks
// stay simple (present = defined).
function nonEmpty(value: string | undefined): string | undefined {
  const clean = (value ?? "").trim();
  return clean === "" ? undefined : clean;
}

// extractDetail: display strings for the email card plus attribution. The
// author/note come from the latest history entry matching this transition
// (date + status); when nothing matches (stale reminders, backfills) the
// latest entry overall is used; barriers without history carry no author.
export function extractDetail(
  wire: WireBarrier,
  transitionDate: string,
  statusId: number,
  labels?: ResolverLabels,
): BarrierDetail {
  const resolved = resolveBarrier(wire, labels);
  const history = resolved.statusHistory ?? [];
  const day = transitionDate.slice(0, 10);
  // Index of the latest wire entry for this exact transition; indexes align
  // 1:1 with the resolved history (resolveBarrier maps in order).
  let matchIdx = -1;
  for (let i = 0; i < wire.statusHistory.length; i++) {
    const w = wire.statusHistory[i]!;
    if (w.date.slice(0, 10) === day && w.statusId === statusId) matchIdx = i;
  }
  const latest = matchIdx >= 0
    ? history[matchIdx]
    : history.length > 0
    ? history[history.length - 1]!
    : undefined;
  const author = nonEmpty(latest?.author);
  // Seed enums label unknown ids "Autor (n)" / sync rows carry the
  // "Sincronização Fracttal" service name - both are noise in an inbox,
  // so only human attribution is kept.
  const humanAuthor = author !== undefined &&
      !/^autor \(\d+\)$/i.test(author) &&
      author !== "Sincronização Fracttal"
    ? author
    : undefined;
  return {
    typology: nonEmpty(resolved.typology),
    grouping: nonEmpty(resolved.grouping),
    owner: nonEmpty(resolved.owner),
    compliance: nonEmpty(resolved.compliance),
    locationName: nonEmpty(resolved.locationName),
    category: nonEmpty(resolved.category),
    author: humanAuthor,
    note: nonEmpty(latest?.note),
    actionPlan: nonEmpty(resolved.actionPlan),
  };
}
