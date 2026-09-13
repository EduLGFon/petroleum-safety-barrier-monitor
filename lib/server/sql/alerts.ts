// Alert events SQL - the real AlertStore over alert_events.
// This is why it exists: enqueue is INSERT ... ON CONFLICT DO NOTHING on
// the UNIQUE dedup_key (reruns enqueue zero), sends flip sent_at, failures
// accumulate in the payload until the dead-letter budget is spent.
import type {
  AlertPayload,
  AlertStore,
  NewAlertEvent,
  TransitionCandidate,
  UnsentAlert,
} from "../alerts/store.ts";

import { queryRows } from "../db.ts";

interface EventRow {
  id: number;
  barrier_id: number | null;
  transition_date: string;
  status_id: number;
  dedup_key: string;
  payload: AlertPayload;
}

function toUnsent(r: EventRow): UnsentAlert {
  return {
    id: r.id,
    barrierId: r.barrier_id,
    transitionDate: typeof r.transition_date === "string"
      ? r.transition_date.slice(0, 10)
      : String(r.transition_date).slice(0, 10),
    statusId: r.status_id,
    dedupKey: r.dedup_key,
    payload: r.payload,
  };
}

export const sqlAlertStore: AlertStore = {
  async watermark(): Promise<string | null> {
    const rows = await queryRows<{ max: string | null }>(
      `select max(transition_date)::text as max from alert_events`,
    );
    return rows[0]?.max ?? null;
  },

  async recentTransitions(
    since: string | null,
    onlyBarrierIds?: number[],
  ): Promise<TransitionCandidate[]> {
    const rows = await queryRows<{
      barrier_id: number;
      transition_date: string;
      status_id: number;
    }>(
      `select h.barrier_id, h.date::text as transition_date, h.status_id
       from barrier_status_history h
       where ($1::date is null or h.date >= $1::date)
       order by h.date, h.id`,
      [since],
    );
    const only = onlyBarrierIds === undefined
      ? undefined
      : new Set(onlyBarrierIds);
    return rows
      .filter((r) => only === undefined || only.has(r.barrier_id))
      .map((r) => ({
        barrierId: r.barrier_id,
        transitionDate: r.transition_date.slice(0, 10),
        statusId: r.status_id,
      }));
  },

  async enqueue(events: NewAlertEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const values: string[] = [];
    const args: unknown[] = [];
    for (const e of events) {
      args.push(
        e.barrierId,
        e.transitionDate,
        e.statusId,
        e.dedupKey,
        e.payload,
      );
      const base = args.length - 5;
      values.push(
        `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${
          base + 5
        }::jsonb)`,
      );
    }
    const rows = await queryRows<{ id: number }>(
      `insert into alert_events
         (barrier_id, transition_date, status_id, dedup_key, payload)
       values ${values.join(", ")}
       on conflict (dedup_key) do nothing
       returning id`,
      args,
    );
    return rows.length;
  },

  async listUnsent(): Promise<UnsentAlert[]> {
    const rows = await queryRows<EventRow>(
      `select id, barrier_id, transition_date::text as transition_date,
              status_id, dedup_key, payload
       from alert_events
       where sent_at is null
         and coalesce((payload->>'dead_letter')::boolean, false) = false
       order by id`,
    );
    return rows.map(toUnsent);
  },

  async countDead(): Promise<number> {
    const rows = await queryRows<{ n: string }>(
      `select count(*)::text as n from alert_events
       where sent_at is null
         and coalesce((payload->>'dead_letter')::boolean, false) = true`,
    );
    return Number(rows[0]?.n ?? 0);
  },

  async markDelivered(
    id: number,
    email: string,
    complete: boolean,
  ): Promise<void> {
    await queryRows(
      `update alert_events
       set payload = payload || jsonb_build_object(
         'delivered',
         (select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
          from jsonb_array_elements_text(
            coalesce(payload->'delivered', '[]'::jsonb) || to_jsonb($2::text)
          ) as v)
       ),
       sent_at = case when $3 then now() else sent_at end
       where id = $1`,
      [id, email, complete],
    );
  },

  async markFailed(
    id: number,
    error: string,
    deadLetter: boolean,
  ): Promise<void> {
    await queryRows(
      `update alert_events
       set payload = payload || jsonb_build_object(
         'attempts', coalesce((payload->>'attempts')::int, 0) + 1,
         'last_error', $2::text,
         'dead_letter', $3::boolean
       )
       where id = $1`,
      [id, error.slice(0, 2000), deadLetter],
    );
  },

  async reprocessDeadLetters(): Promise<number> {
    const rows = await queryRows<{ id: number }>(
      `update alert_events
       set payload = payload || jsonb_build_object(
         'attempts', 0, 'last_error', null, 'dead_letter', false
       )
       where sent_at is null
         and coalesce((payload->>'dead_letter')::boolean, false) = true
       returning id`,
    );
    return rows.length;
  },
};
