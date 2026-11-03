// Status-change alert fanout - one place for the read/enqueue/post sequence
// shared by the barrier PATCH and dedicated status routes.
import { postAlert, providerConfigFromEnv } from "./provider.ts";

import { maybeSendProviderImmediate } from "./run-provider.ts";

import { getBarriersByIds } from "../sql/barriers.ts";

import { getResolverLabels } from "../sql/vocabularies.ts";

import { listRecipients } from "../sql/recipients.ts";

import { sqlAlertStore } from "../sql/alerts.ts";

import { queryRows } from "../db.ts";

import { forRequest } from "../log.ts";

import type { StatusInfo } from "./detect.ts";

import type { WireBarrier } from "../../wireTypes.ts";

interface Options {
  barrier: WireBarrier;
  statusId: number;
  historyId?: number;
  requestId: string;
}

// fanoutStatusChange: best-effort and deliberately not awaited by the route.
// The status transition is already committed; a slow provider must not hold
// the admin's save open. Failures are logged and the poll cycle retries.
export async function fanoutStatusChange(
  { barrier, statusId, historyId, requestId }: Options,
): Promise<void> {
  const logger = forRequest(requestId).line("info");
  const [recipRes, labelsRes, statusRes] = await Promise.allSettled([
    listRecipients(true),
    getResolverLabels(),
    queryRows<{ id: number; label: string; ok: boolean }>(
      `select id, label, is_compliant as ok from availability_statuses`,
    ),
  ]);
  let provider: Awaited<ReturnType<typeof providerConfigFromEnv>> | undefined;
  try {
    provider = providerConfigFromEnv();
  } catch {
    provider = undefined;
  }
  const labels = labelsRes.status === "fulfilled" ? labelsRes.value : undefined;
  let statusInfo: StatusInfo | undefined;
  if (statusRes.status === "fulfilled") {
    const labelById = new Map(statusRes.value.map((r) => [r.id, r.label]));
    const okById = new Map(statusRes.value.map((r) => [r.id, r.ok]));
    statusInfo = {
      labelOf: (id: number) => labelById.get(id) ?? `Disponibilidade (${id})`,
      compliantOf: (id: number) => okById.get(id) ?? false,
    };
  }
  const recipients = recipRes.status === "fulfilled" ? recipRes.value : [];
  await maybeSendProviderImmediate({
    store: sqlAlertStore,
    loadBarriers: getBarriersByIds,
    sender: provider
      ? { post: (payload) => postAlert(provider!, payload) }
      : undefined,
    barrier,
    statusId,
    transitionDate: barrier.statusSince.slice(0, 10),
    historyId,
    companyId: provider?.companyId ?? 1,
    appBaseUrl: Deno.env.get("APP_BASE_URL") || undefined,
    recipients: recipients.map((r) => ({
      email: r.email,
      name: r.name,
      phone: r.phone ?? "",
    })),
    logger,
    labels,
    statusInfo,
  });
}
