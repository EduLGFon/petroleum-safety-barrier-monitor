// GroupsManager - admin groups with strict station access.
import {
  AdminCard,
  AdminHero,
  EmptyState,
  ErrorBanner,
  Field,
  ghostBtn,
  inputSt,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useEffect, useState } from "preact/hooks";

interface Group {
  id: number;
  name: string;
  description: string;
  locationIds: number[];
  userIds: number[];
}

interface LocationOpt {
  id: number;
  code: string;
  name: string | null;
}

interface UserOpt {
  id: number;
  email: string;
  name: string;
}

export function GroupsManager({ onCount }: { onCount?: (n: number) => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draftLocs, setDraftLocs] = useState<number[]>([]);
  const [draftUsers, setDraftUsers] = useState<number[]>([]);

  async function refresh() {
    try {
      setError("");
      setLoading(true);
      const [g, lookups, userList] = await Promise.all([
        adminApi("/api/access-groups") as Promise<Group[]>,
        adminApi("/api/lookups") as Promise<{ locations: LocationOpt[] }>,
        adminApi("/api/users") as Promise<UserOpt[]>,
      ]);
      setGroups(g);
      setLocations(lookups.locations ?? []);
      setUsers(userList ?? []);
      onCount?.(g.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await adminApi("/api/access-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          locationIds: [],
          userIds: [],
        }),
      });
      setName("");
      setDescription("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(g: Group) {
    setEditing(g.id);
    setDraftLocs([...g.locationIds]);
    setDraftUsers([...g.userIds]);
  }

  async function saveEdit(g: Group) {
    setBusy(true);
    try {
      await adminApi(`/api/access-groups/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationIds: draftLocs,
          userIds: draftUsers,
        }),
      });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Group) {
    if (!confirm(`Excluir grupo ${g.name}?`)) return;
    try {
      await adminApi(`/api/access-groups/${g.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggle(list: number[], id: number, set: (v: number[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  if (loading) return <SkeletonRows />;

  return (
    <div style={{ display: "grid", gap: "var(--d-panel-gap)" }}>
      <AdminHero
        title="Grupos de Acesso"
        hint="Restringe usuários a um conjunto de estações."
        count={`${groups.length} grupos`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <AdminCard>
        <form
          onSubmit={(e) => void create(e)}
          style={{ display: "grid", gap: 8 }}
        >
          <Field label="Nome do grupo">
            <input
              style={inputSt}
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Ex: FAL/SM"
            />
          </Field>
          <Field label="Descrição">
            <input
              style={inputSt}
              value={description}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </Field>
          <button type="submit" style={primaryBtn} disabled={busy}>
            Criar grupo
          </button>
        </form>
      </AdminCard>
      {groups.length === 0
        ? <EmptyState message="Nenhum grupo cadastrado." />
        : (
          groups.map((g) => (
            <AdminCard key={g.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  <strong>{g.name}</strong>
                  {g.description && (
                    <div
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {g.description}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    style={ghostBtn}
                    onClick={() => startEdit(g)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    style={ghostBtn}
                    onClick={() => void remove(g)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
              {editing === g.id && (
                <div style={{ display: "grid", gap: 8 }}>
                  <Field label="Estações">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {locations.map((loc) => (
                        <label
                          key={loc.id}
                          style={{
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={draftLocs.includes(loc.id)}
                            onChange={() =>
                              toggle(draftLocs, loc.id, setDraftLocs)}
                          />
                          {loc.code}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Usuários">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {users.map((u) => (
                        <label
                          key={u.id}
                          style={{
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={draftUsers.includes(u.id)}
                            onChange={() =>
                              toggle(draftUsers, u.id, setDraftUsers)}
                          />
                          {u.name || u.email}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={primaryBtn}
                      disabled={busy}
                      onClick={() => void saveEdit(g)}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      style={ghostBtn}
                      onClick={() => setEditing(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {editing !== g.id && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <StatusBadge tone="neutral">
                    {g.locationIds.length} estações
                  </StatusBadge>
                  <StatusBadge tone="neutral">
                    {g.userIds.length} usuários
                  </StatusBadge>
                </div>
              )}
            </AdminCard>
          ))
        )}
    </div>
  );
}
