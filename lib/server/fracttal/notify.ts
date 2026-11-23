// Ops notifications for sync failures - failures never go silent.
// This is why it exists: sync failures must reach ops separately from
// barrier alerts. Delivery is the provider's job now, so the local channel
// is structured console logging only. Notification is best-effort by
// contract: a throwing notifier never propagates into the sync path.
import { log } from "../log.ts";

export interface SyncFailureInfo {
  scope: string;
  startedAt: string; // ISO timestamp (run start)
  note: string;
  runId: number | null;
}

export interface OpsNotifier {
  name: string;
  syncFailed(info: SyncFailureInfo): Promise<void>;
}

// consoleNotifier: the always-available channel (loud, structured line).
// maskEmail: hides the local part of any email address in free-text log
// fields so recipient PII never reaches stderr. Domain stays for ops triage.
export function maskEmail(value: string): string {
  return value.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    (match) => {
      const at = match.indexOf("@");
      const local = at > 0 ? match.slice(0, at) : "";
      const domain = at >= 0 ? match.slice(at) : "";
      const head = local.length > 0 ? local.slice(0, 1) : "";
      return `${head}***${domain}`;
    },
  );
}

export const consoleNotifier: OpsNotifier = {
  name: "console",
  syncFailed(info: SyncFailureInfo): Promise<void> {
    log.child({ scope: "ops" }).error("sync failed", {
      scope: info.scope,
      runId: info.runId,
      startedAt: info.startedAt,
      note: maskEmail(info.note),
    });
    return Promise.resolve();
  },
};

// notifyFailureToAll: fanout with a feed-through (one bad channel must not
// block the rest or the sync caller). Errors are logged, never thrown.
export async function notifyFailureToAll(
  notifiers: OpsNotifier[],
  info: SyncFailureInfo,
): Promise<void> {
  await Promise.all(
    notifiers.map(async (n) => {
      try {
        await n.syncFailed(info);
      } catch (err) {
        log.child({ scope: "ops" }).error("notifier failed", {
          notifier: n.name,
          scope: info.scope,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}
