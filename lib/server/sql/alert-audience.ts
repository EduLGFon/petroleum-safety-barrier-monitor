// Alert audience SQL - derives recipients from active users + access groups.
// This is why it exists: the manual alert_recipients list is legacy; send
// paths now target active dashboard users scoped to the barrier station.
// Admin users carry a null scope (all stations); a non-admin carries the
// union of their groups' stations, and no group means no delivery.
// SECURITY: one set-based read avoids per-user N+1 queries; fail-closed
// defaults (empty arrays) keep ungrouped users out of every station.
import type { AlertAudienceRecipient } from "../alerts/audience.ts";

import { queryRows } from "../db.ts";

export interface AlertAudienceRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: string;
  location_ids: number[] | null;
}

// audienceRowToRecipient: pure mapping between the SQL row and the send-path
// recipient. Admins always broad; non-admins never widen past their groups.
export function audienceRowToRecipient(
  row: AlertAudienceRow,
): AlertAudienceRecipient {
  return {
    email: row.email,
    name: row.name,
    phone: row.phone,
    locationIds: row.role === "admin" ? null : row.location_ids ?? [],
  };
}

export async function loadAlertAudience(): Promise<AlertAudienceRecipient[]> {
  const rows = await queryRows<AlertAudienceRow>(
    `select u.id,
            u.email,
            u.name,
            coalesce(u.phone, '') as phone,
            u.role,
            case
              when u.role = 'admin' then null
              else coalesce(
                array_agg(distinct agl.location_id)
                  filter (where agl.location_id is not null),
                '{}'::integer[]
              )
            end as location_ids
     from users u
     left join user_access_groups uag on uag.user_id = u.id
     left join access_group_locations agl on agl.group_id = uag.group_id
     where u.active and btrim(u.email) <> ''
     group by u.id, u.email, u.name, u.phone, u.role
     order by u.id`,
  );
  return rows.map(audienceRowToRecipient);
}
