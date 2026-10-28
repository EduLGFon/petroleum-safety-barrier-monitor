// Access groups SQL - station-scoped visibility groups for dashboard users.
// This is why it exists: admins restrict non-admin users to a subset of
// stations; enforcement happens in the data routes via allowedLocationIds.
import { queryRows, type TxQuery, withTx } from "../db.ts";

export interface AccessGroup {
  id: number;
  name: string;
  description: string;
  locationIds: number[];
  userIds: number[];
  created_at?: string;
  updated_at?: string;
}

export interface AccessGroupRow {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export async function listAccessGroups(): Promise<AccessGroup[]> {
  const groups = await queryRows<AccessGroupRow>(
    `select id, name, description, created_at::text, updated_at::text
     from access_groups order by name`,
  );
  const result: AccessGroup[] = [];
  for (const g of groups) {
    const locs = await queryRows<{ location_id: number }>(
      `select location_id from access_group_locations where group_id = $1`,
      [g.id],
    );
    const users = await queryRows<{ user_id: number }>(
      `select user_id from user_access_groups where group_id = $1`,
      [g.id],
    );
    result.push({
      id: g.id,
      name: g.name,
      description: g.description,
      locationIds: locs.map((r) => r.location_id),
      userIds: users.map((r) => r.user_id),
      created_at: g.created_at,
      updated_at: g.updated_at,
    });
  }
  return result;
}

export async function getAccessGroup(id: number): Promise<AccessGroup | null> {
  const rows = await queryRows<AccessGroupRow>(
    `select id, name, description, created_at::text, updated_at::text
     from access_groups where id = $1`,
    [id],
  );
  const g = rows[0];
  if (!g) return null;
  const locs = await queryRows<{ location_id: number }>(
    `select location_id from access_group_locations where group_id = $1`,
    [id],
  );
  const users = await queryRows<{ user_id: number }>(
    `select user_id from user_access_groups where group_id = $1`,
    [id],
  );
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    locationIds: locs.map((r) => r.location_id),
    userIds: users.map((r) => r.user_id),
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

export async function createAccessGroup(input: {
  name: string;
  description?: string;
  locationIds?: number[];
  userIds?: number[];
}): Promise<AccessGroup> {
  return await withTx(async (query: TxQuery) => {
    const rows = await query<{ id: number }>(
      `insert into access_groups (name, description) values ($1, $2) returning id`,
      [input.name.trim(), (input.description ?? "").trim()],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("createAccessGroup returned no row");
    await replaceLocations(query, id, input.locationIds ?? []);
    await replaceMembers(query, id, input.userIds ?? []);
    return (await getAccessGroupTx(query, id))!;
  });
}

async function getAccessGroupTx(
  query: TxQuery,
  id: number,
): Promise<AccessGroup | null> {
  const rows = await query<AccessGroupRow>(
    `select id, name, description, created_at::text, updated_at::text
     from access_groups where id = $1`,
    [id],
  );
  const g = rows[0];
  if (!g) return null;
  const locs = await query<{ location_id: number }>(
    `select location_id from access_group_locations where group_id = $1`,
    [id],
  );
  const users = await query<{ user_id: number }>(
    `select user_id from user_access_groups where group_id = $1`,
    [id],
  );
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    locationIds: locs.map((r) => r.location_id),
    userIds: users.map((r) => r.user_id),
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

async function replaceLocations(
  query: TxQuery,
  groupId: number,
  locationIds: number[],
): Promise<void> {
  await query(`delete from access_group_locations where group_id = $1`, [
    groupId,
  ]);
  for (const lid of locationIds) {
    await query(
      `insert into access_group_locations (group_id, location_id) values ($1, $2)
       on conflict do nothing`,
      [groupId, lid],
    );
  }
}

async function replaceMembers(
  query: TxQuery,
  groupId: number,
  userIds: number[],
): Promise<void> {
  await query(`delete from user_access_groups where group_id = $1`, [groupId]);
  for (const uid of userIds) {
    await query(
      `insert into user_access_groups (user_id, group_id) values ($1, $2)
       on conflict do nothing`,
      [uid, groupId],
    );
  }
}

export async function updateAccessGroup(
  id: number,
  patch: {
    name?: string;
    description?: string;
    locationIds?: number[];
    userIds?: number[];
  },
): Promise<AccessGroup | null> {
  return await withTx(async (query: TxQuery) => {
    const current = await getAccessGroupTx(query, id);
    if (!current) return null;
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.name !== undefined) {
      args.push(patch.name.trim());
      sets.push(`name = $${args.length}`);
    }
    if (patch.description !== undefined) {
      args.push(patch.description.trim());
      sets.push(`description = $${args.length}`);
    }
    if (sets.length > 0) {
      args.push(id);
      await query(
        `update access_groups set ${
          sets.join(", ")
        } where id = $${args.length}`,
        args,
      );
    }
    if (patch.locationIds !== undefined) {
      await replaceLocations(query, id, patch.locationIds);
    }
    if (patch.userIds !== undefined) {
      await replaceMembers(query, id, patch.userIds);
    }
    return await getAccessGroupTx(query, id);
  });
}

export async function deleteAccessGroup(id: number): Promise<boolean> {
  const rows = await queryRows<{ id: number }>(
    `delete from access_groups where id = $1 returning id`,
    [id],
  );
  return rows.length > 0;
}

// Resolves the station ids a user may read. null means unrestricted (admin
// or legacy ungrouped); [] means no access.
export async function allowedLocationsForUser(
  userId: number,
): Promise<number[] | null> {
  const membership = await queryRows<{ n: string }>(
    `select count(*)::text as n from user_access_groups where user_id = $1`,
    [userId],
  );
  if (Number(membership[0]?.n ?? 0) === 0) return null;
  const rows = await queryRows<{ location_id: number }>(
    `select distinct gal.location_id
     from user_access_groups uag
     join access_group_locations gal on gal.group_id = uag.group_id
     where uag.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.location_id);
}
