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
  // Three queries total (groups, all locations, all members) instead of
  // 1 + 2N: the per-group lookups used to dominate load time. Mapping in
  // memory keeps the group order (by name) and the per-group id order.
  const groups = await queryRows<AccessGroupRow>(
    `select id, name, description, created_at::text, updated_at::text
     from access_groups order by name`,
  );
  const locRows = await queryRows<{ group_id: number; location_id: number }>(
    `select group_id, location_id
     from access_group_locations
     order by group_id, location_id`,
  );
  const userRows = await queryRows<{ group_id: number; user_id: number }>(
    `select group_id, user_id
     from user_access_groups
     order by group_id, user_id`,
  );
  const locMap = new Map<number, number[]>();
  for (const r of locRows) {
    const list = locMap.get(r.group_id);
    if (list) list.push(r.location_id);
    else locMap.set(r.group_id, [r.location_id]);
  }
  const userMap = new Map<number, number[]>();
  for (const r of userRows) {
    const list = userMap.get(r.group_id);
    if (list) list.push(r.user_id);
    else userMap.set(r.group_id, [r.user_id]);
  }
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    locationIds: locMap.get(g.id) ?? [],
    userIds: userMap.get(g.id) ?? [],
    created_at: g.created_at,
    updated_at: g.updated_at,
  }));
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

// replaceUserGroups: set a user's memberships atomically. Used when creating
// a user so a fresh account never exists without an explicit scope.
export async function replaceUserGroups(
  userId: number,
  groupIds: number[],
): Promise<void> {
  const unique = [...new Set(groupIds)].filter((id) =>
    Number.isSafeInteger(id) && id > 0
  );
  await withTx(async (tx) => {
    await tx("delete from user_access_groups where user_id = $1", [userId]);
    if (unique.length === 0) return;
    const rows = unique.map((_, i) => `($1, $${i + 2})`).join(", ");
    await tx(
      `insert into user_access_groups (user_id, group_id) values ${rows}
       on conflict do nothing`,
      [userId, ...unique],
    );
  });
}

// ---------- Batch helpers (admin groups) ----------

export const ACCESS_GROUP_BATCH_ACTIONS = [
  "delete",
  "addUsers",
  "removeUsers",
  "addLocations",
  "removeLocations",
  "addStations",
  "removeStations",
] as const;

export type AccessGroupBatchAction =
  (typeof ACCESS_GROUP_BATCH_ACTIONS)[number];

export interface AccessGroupBatchInput {
  action: string;
  ids?: unknown;
  groupIds?: unknown;
  userIds?: unknown;
  locationIds?: unknown;
  stationIds?: unknown;
  locations?: unknown;
  stations?: unknown;
  users?: unknown;
  relatedIds?: unknown;
}

export interface AccessGroupBatchValidated {
  action:
    | "delete"
    | "addUsers"
    | "removeUsers"
    | "addLocations"
    | "removeLocations";
  groupIds: number[];
  relatedIds: number[];
}

function toUniquePositiveIds(
  raw: unknown,
  label: string,
  max: number,
): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const n of raw) {
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) {
      throw new Error(`${label} must be positive integers`);
    }
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  if (out.length > max) {
    throw new Error(`${label} must contain at most ${max} ids`);
  }
  return out;
}

function canonicalAction(raw: unknown): AccessGroupBatchValidated["action"] {
  if (typeof raw !== "string") throw new Error("action must be a string");
  const value = raw.trim();
  switch (value) {
    case "delete":
    case "deleteGroups":
    case "removeGroups":
    case "excluir":
      return "delete";
    case "addUsers":
    case "addUser":
    case "add_users":
      return "addUsers";
    case "removeUsers":
    case "removeUser":
    case "remove_users":
      return "removeUsers";
    case "addLocations":
    case "addLocation":
    case "addStations":
    case "addStation":
    case "add_locations":
    case "add_stations":
      return "addLocations";
    case "removeLocations":
    case "removeLocation":
    case "removeStations":
    case "removeStation":
    case "remove_locations":
    case "remove_stations":
      return "removeLocations";
    default:
      throw new Error(
        "action must be one of delete, addUsers, removeUsers, addLocations, removeLocations",
      );
  }
}

// Pure validation for an access-groups batch request. Throws on any invalid
// input so the route can map it to a 400. Returns canonical ids.
export function validateAccessGroupBatch(
  body: unknown,
): AccessGroupBatchValidated {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("request body must be an object");
  }
  const b = body as AccessGroupBatchInput;
  const action = canonicalAction(b.action);
  const groupIds = toUniquePositiveIds(
    b.ids ?? b.groupIds,
    "group ids",
    200,
  );
  if (groupIds.length === 0) throw new Error("group ids must not be empty");
  if (action === "delete") {
    // related ids are ignored for delete
    return { action, groupIds, relatedIds: [] };
  }
  const relatedRaw = action === "addUsers" || action === "removeUsers"
    ? (b.userIds ?? b.users ?? b.relatedIds)
    : (b.locationIds ?? b.stationIds ?? b.locations ?? b.stations ??
      b.relatedIds);
  const relatedIds = toUniquePositiveIds(relatedRaw, "related ids", 500);
  if (relatedIds.length === 0) {
    throw new Error("related ids must not be empty");
  }
  if (groupIds.length * relatedIds.length > 20000) {
    throw new Error(
      "cross product of group ids and related ids must not exceed 20000",
    );
  }
  return { action, groupIds, relatedIds };
}

// Aliases for callers/tests that prefer other names.
export const validateAccessGroupBatchRequest = validateAccessGroupBatch;
export const parseAccessGroupBatch = validateAccessGroupBatch;
export const normalizeAccessGroupBatch = validateAccessGroupBatch;

async function assertGroupsExist(
  query: (text: string, args?: unknown[]) => Promise<unknown[]>,
  groupIds: number[],
): Promise<void> {
  const rows = await query(
    `select id from access_groups where id = any($1::int[])`,
    [groupIds],
  ) as { id: number }[];
  if (rows.length !== groupIds.length) {
    throw new Error("missing groups");
  }
}

export async function batchDeleteAccessGroups(
  groupIds: number[],
): Promise<number> {
  const validated = validateAccessGroupBatch({
    action: "delete",
    ids: groupIds,
  });
  return await withTx(async (query) => {
    await assertGroupsExist(query, validated.groupIds);
    const rows = await query<{ id: number }>(
      `delete from access_groups where id = any($1::int[]) returning id`,
      [validated.groupIds],
    );
    return rows.length;
  });
}

export async function batchAddUsersToGroups(
  groupIds: number[],
  userIds: number[],
): Promise<number> {
  const validated = validateAccessGroupBatch({
    action: "addUsers",
    ids: groupIds,
    userIds,
  });
  return await withTx(async (query) => {
    await assertGroupsExist(query, validated.groupIds);
    const rows = await query<{ user_id: number; group_id: number }>(
      `insert into user_access_groups (user_id, group_id)
       select u, g from unnest($1::int[]) as u, unnest($2::int[]) as g
       on conflict do nothing
       returning user_id, group_id`,
      [validated.relatedIds, validated.groupIds],
    );
    return rows.length;
  });
}

export async function batchRemoveUsersFromGroups(
  groupIds: number[],
  userIds: number[],
): Promise<number> {
  const validated = validateAccessGroupBatch({
    action: "removeUsers",
    ids: groupIds,
    userIds,
  });
  return await withTx(async (query) => {
    await assertGroupsExist(query, validated.groupIds);
    const rows = await query<{ user_id: number; group_id: number }>(
      `delete from user_access_groups
       where group_id = any($1::int[]) and user_id = any($2::int[])
       returning user_id, group_id`,
      [validated.groupIds, validated.relatedIds],
    );
    return rows.length;
  });
}

export async function batchAddLocationsToGroups(
  groupIds: number[],
  locationIds: number[],
): Promise<number> {
  const validated = validateAccessGroupBatch({
    action: "addLocations",
    ids: groupIds,
    locationIds,
  });
  return await withTx(async (query) => {
    await assertGroupsExist(query, validated.groupIds);
    const rows = await query<{ group_id: number; location_id: number }>(
      `insert into access_group_locations (group_id, location_id)
       select g, l from unnest($1::int[]) as g, unnest($2::int[]) as l
       on conflict do nothing
       returning group_id, location_id`,
      [validated.groupIds, validated.relatedIds],
    );
    return rows.length;
  });
}

export async function batchRemoveLocationsFromGroups(
  groupIds: number[],
  locationIds: number[],
): Promise<number> {
  const validated = validateAccessGroupBatch({
    action: "removeLocations",
    ids: groupIds,
    locationIds,
  });
  return await withTx(async (query) => {
    await assertGroupsExist(query, validated.groupIds);
    const rows = await query<{ group_id: number; location_id: number }>(
      `delete from access_group_locations
       where group_id = any($1::int[]) and location_id = any($2::int[])
       returning group_id, location_id`,
      [validated.groupIds, validated.relatedIds],
    );
    return rows.length;
  });
}

export async function batchAccessGroups(
  input: AccessGroupBatchInput,
): Promise<{ affected: number }> {
  const validated = validateAccessGroupBatch(input);
  let affected = 0;
  switch (validated.action) {
    case "delete":
      affected = await batchDeleteAccessGroups(validated.groupIds);
      break;
    case "addUsers":
      affected = await batchAddUsersToGroups(
        validated.groupIds,
        validated.relatedIds,
      );
      break;
    case "removeUsers":
      affected = await batchRemoveUsersFromGroups(
        validated.groupIds,
        validated.relatedIds,
      );
      break;
    case "addLocations":
      affected = await batchAddLocationsToGroups(
        validated.groupIds,
        validated.relatedIds,
      );
      break;
    case "removeLocations":
      affected = await batchRemoveLocationsFromGroups(
        validated.groupIds,
        validated.relatedIds,
      );
      break;
  }
  return { affected };
}

// Aliases for callers/tests that prefer other names.
export const batchGroups = batchAccessGroups;
export const runAccessGroupBatch = batchAccessGroups;
export const executeAccessGroupBatch = batchAccessGroups;

// Resolves the station ids a user may read. null is reserved for admins
// (handled by the caller); an ungrouped user gets [] (no access). This is
// fail-closed: creating a user or deleting every group can never widen a
// non-admin to every station.
export async function allowedLocationsForUser(
  userId: number,
): Promise<number[] | null> {
  const membership = await queryRows<{ n: string }>(
    `select count(*)::text as n from user_access_groups where user_id = $1`,
    [userId],
  );
  if (Number(membership[0]?.n ?? 0) === 0) return [];
  const rows = await queryRows<{ location_id: number }>(
    `select distinct gal.location_id
     from user_access_groups uag
     join access_group_locations gal on gal.group_id = uag.group_id
     where uag.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.location_id);
}
