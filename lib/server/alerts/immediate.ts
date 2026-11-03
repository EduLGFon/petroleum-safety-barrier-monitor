// Immediate provider send for one manually recorded status change.
// Split out of run-provider so the scheduled cycle and the request-triggered
// path can be reviewed independently.
import {
  barrierLink,
  buildAlertPayload,
  mapLanding,
  ocorridoEm,
} from "./provider.ts";
import { dedupKey } from "./store.ts";
import { extractDetail } from "./enrich.ts";
import { landingLabel } from "./detect.ts";
import { isCriticalRankId } from "../../enums/codes.ts";
import { fromLocationId } from "../../enums.ts";
import { resolveBarrier, type ResolverLabels } from "../../resolve.ts";
import type { AlertStore } from "./store.ts";
import type { ProviderCycleRecipient, ProviderSender } from "./run-provider.ts";
import type { StatusInfo } from "./detect.ts";
import type { WireBarrier } from "../../wireTypes.ts";

// maybeSendProviderImmediate: enqueue always; POST at once only for the
// violada landing (messaging-eligible). Failures stay unsent for the cycle.
export async function maybeSendProviderImmediate(options: {
  store: AlertStore;
  loadBarriers: (ids: number[]) => Promise<Map<number, WireBarrier>>;
  sender?: ProviderSender;
  barrier: WireBarrier;
  statusId: number;
  transitionDate: string;
  historyId?: number;
  companyId: number;
  appBaseUrl?: string;
  recipients: ProviderCycleRecipient[];
  labels?: ResolverLabels;
  statusInfo?: StatusInfo;
  now?: () => Date;
  logger?: (line: string) => void;
}): Promise<{ enqueued: number; posted: number }> {
  const {
    store,
    loadBarriers,
    sender,
    barrier,
    statusId,
    transitionDate,
    historyId,
    companyId,
    appBaseUrl,
    recipients,
    labels,
    statusInfo,
    now = () => new Date(),
    logger = () => {},
  } = options;
  // A retired asset must not produce a new alert, even if an admin edits it.
  if (barrier.isActive === false) return { enqueued: 0, posted: 0 };
  const resolved = resolveBarrier(barrier, labels);
  const event = {
    barrierId: barrier.id,
    transitionDate,
    statusId,
    historyId,
    dedupKey: dedupKey(barrier.id, transitionDate, statusId, historyId),
    payload: {
      tag: resolved.tag,
      location: resolved.location,
      availability: resolved.availability,
      criticality: resolved.criticality,
      urgency: resolved.compliance === "Conforme"
        ? "none" as const
        : (isCriticalRankId(barrier.criticalityId)
          ? "critical" as const
          : "urgent" as const),
      attempts: 0,
      lastError: null,
      deadLetter: false,
      delivered: [],
      historyId,
      ...extractDetail(barrier, transitionDate, statusId, labels),
    },
  };
  const enqueued = await store.enqueue([event]);
  const mapping = mapLanding(statusId);
  if (!mapping.send || !mapping.despacharAgora || !sender) {
    return { enqueued, posted: 0 };
  }
  const active = recipients.filter((r) => r.email.trim() !== "");
  if (active.length === 0) return { enqueued, posted: 0 };
  const at = now();
  const criticality = resolved.criticality;
  const status = landingLabel(statusId, statusInfo);
  const location = labels?.locations?.[barrier.locationId] ??
    fromLocationId(barrier.locationId);
  const payload = buildAlertPayload({
    barrierId: barrier.id,
    externalCode: barrier.externalCode || barrier.tag,
    tag: barrier.tag,
    criticality,
    statusLabel: status,
    locationLabel: location,
    transitionDate,
    ocorridoEm: ocorridoEm(transitionDate, at),
    statusId,
    historyId,
    companyId,
    link: barrierLink(appBaseUrl, barrier.id),
    recipients: active,
  });
  if (!payload) return { enqueued, posted: 0 };
  const unsent = await store.listUnsent(200, 0);
  const pending = unsent.find((e) => e.dedupKey === event.dedupKey);
  if (!pending) return { enqueued, posted: 0 };
  try {
    const res = await sender.post(payload);
    if (store.markProviderAccepted) {
      await store.markProviderAccepted(pending.id, {
        correlationId: res.correlation_id,
        parcial: res.parcial,
        eventoId: res.evento_id,
        idempotencyKey: res.idempotency_key,
        enfileirados: res.enfileirados,
        rejeitados: res.rejeitados,
        avisos: res.avisos,
      });
    } else {
      for (const r of active) {
        await store.markDelivered(pending.id, r.email, true);
      }
    }
    return { enqueued, posted: 1 };
  } catch (err) {
    logger(
      `[provider-immediate] post failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    void loadBarriers;
    return { enqueued, posted: 0 };
  }
}
