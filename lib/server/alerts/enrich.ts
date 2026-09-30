// Barrier detail enrichment for alert emails - what the digest shows per
// barrier beyond tag/location/status. This is why it exists: the alert
// payload used to carry only four display strings, so the email could not
// name who updated the barrier or show its context. Detection already holds
// the full WireBarrier (history included), so we snapshot the detail here
// at enqueue time; the template renders what is present and skips the rest,
// keeping rows enqueued before this change readable.
import { resolveBarrier, type ResolverLabels } from "../../resolve.ts";
import type { WireBarrier } from "../../wireTypes.ts";
import { fromAvailabilityId } from "../../enums.ts";
import { isCompliant } from "../../constants.ts";

export interface HistoryTrailEntry {
  date: string;
  status: string;
  author?: string;
  note?: string;
}

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
  // Before/after snapshot (sync-change parity). oldAvailability is the
  // status replaced by this transition (previous history entry); absent
  // when there is no predecessor (first import, stale reminder). The new
  // value is the payload's availability - the template pairs them.
  oldAvailability?: string;
  oldCompliance?: string;
  previousDate?: string;
  // source: who produced the transition. The sync service name is noise
  // as an author but signal as a source, so it is kept here instead.
  source?: "Manual" | "Sincronização Fracttal";
  // historyTrail: up to 3 entries before the transition, newest last -
  // audit depth (concept B) without dumping the whole history.
  historyTrail?: HistoryTrailEntry[];
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
// The previous entry (when any) provides the before side of the old → new
// diff, and the raw author decides the source (sync service vs. human).
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
  const latestRaw = matchIdx >= 0
    ? wire.statusHistory[matchIdx]
    : wire.statusHistory.length > 0
    ? wire.statusHistory[wire.statusHistory.length - 1]
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
  // Before side: the entry replaced by this transition. Stale reminders
  // reuse the latest entry as "latest", so their predecessor is still the
  // entry before it - a reminder shows "segue <status>" instead of a flip.
  const prevIdx = matchIdx >= 0 ? matchIdx - 1 : wire.statusHistory.length - 2;
  const prevRaw = prevIdx >= 0 ? wire.statusHistory[prevIdx] : undefined;
  const prevResolved = prevIdx >= 0 ? history[prevIdx] : undefined;
  const oldAvailability = prevRaw !== undefined
    ? fromAvailabilityId(prevRaw.statusId)
    : undefined;
  const oldCompliance = oldAvailability !== undefined
    ? (isCompliant(oldAvailability) ? "Conforme" : "Não Conforme")
    : undefined;
  const previousDate = prevResolved?.date?.slice(0, 10);
  const rawAuthor = (latestRaw !== undefined && labels?.authors !== undefined)
    ? labels.authors[latestRaw.authorId]
    : latest?.author;
  const source: BarrierDetail["source"] = rawAuthor === "Sincronização Fracttal"
    ? "Sincronização Fracttal"
    : "Manual";
  // Trail: up to 3 entries before the transition, oldest first.
  const trailStart = Math.max(
    0,
    (matchIdx >= 0 ? matchIdx : history.length) - 3,
  );
  const trailEnd = matchIdx >= 0 ? matchIdx : history.length;
  const historyTrail: HistoryTrailEntry[] | undefined =
    trailEnd - trailStart > 0
      ? history.slice(trailStart, trailEnd).map((h, i) => {
        const raw = wire.statusHistory[trailStart + i];
        void raw;
        const a = nonEmpty(h.author);
        const cleanAuthor = a !== undefined &&
            !/^autor \(\d+\)$/i.test(a) &&
            a !== "Sincronização Fracttal"
          ? a
          : undefined;
        return {
          date: h.date.slice(0, 10),
          status: h.status,
          ...(cleanAuthor !== undefined ? { author: cleanAuthor } : {}),
          ...(h.note.trim() !== "" ? { note: h.note } : {}),
        };
      })
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
    ...(oldAvailability !== undefined ? { oldAvailability } : {}),
    ...(oldCompliance !== undefined ? { oldCompliance } : {}),
    ...(previousDate !== undefined ? { previousDate } : {}),
    source,
    ...(historyTrail !== undefined ? { historyTrail } : {}),
  };
}
