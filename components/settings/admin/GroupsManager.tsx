// GroupsManager - admin groups with strict station access.
import {
  AdminCard,
  AdminHero,
  AdminRow,
  EmptyState,
  ErrorBanner,
  StatusBadge,
} from "./AdminPrimitives.tsx";

import { AdminBulkButton } from "./AdminListControls.tsx";

import { AdminSearchInput, AdminSelectionBar } from "./AdminListControls.tsx";

import { GroupFormDialog } from "./GroupFormDialog.tsx";
import { GroupBulkDialog } from "./GroupBulkDialog.tsx";

import { useAdminList } from "../../../hooks/useAdminList.ts";
import { useAdminResource } from "../../../hooks/useAdminResource.ts";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useState } from "preact/hooks";

import { Pagination } from "../../table/Pagination.tsx";

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
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const resource = useAdminResource<Group>(async () => {
    const [g, lookups, userList] = await Promise.all([
      adminApi("/api/access-groups") as Promise<Group[]>,
      adminApi("/api/lookups") as Promise<{ locations: LocationOpt[] }>,
      adminApi("/api/users") as Promise<UserOpt[]>,
    ]);
    setLocations(lookups.locations ?? []);
    setUsers(userList ?? []);
    onCount?.(g.length);
    return g;
  });
  const { items: groups, loading, error, setError, reload: reloadGroups } =
    resource;

  const list = useAdminList<Group, number>({
    items: groups,
    getId: (g) => g.id,
    getSearchText: (g) => {
      const locNames = g.locationIds
        .map((id) => locations.find((l) => l.id === id)?.code ?? "")
        .join(" ");
      const userNames = g.userIds
        .map((id) => users.find((u) => u.id === id)?.name ?? "")
        .join(" ");
      return `${g.name} ${g.description} ${locNames} ${userNames}`;
    },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<
    "addUsers" | "removeUsers" | "addLocations" | "removeLocations"
  >("addUsers");
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  async function refresh() {
    await reloadGroups();
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(g: Group) {
    setEditing(g);
    setFormOpen(true);
  }

  async function remove(g: Group) {
    if (!confirm(`Excluir grupo ${g.name}?`)) return;
    if (rowBusy !== null) return;
    setRowBusy(g.id);
    try {
      await adminApi(`/api/access-groups/${g.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRowBusy(null);
    }
  }

  async function bulkDelete() {
    const ids = [...list.selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} grupo(s)?`)) return;
    try {
      await adminApi("/api/access-groups/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      list.clearAll();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function openBulk(
    mode: "addUsers" | "removeUsers" | "addLocations" | "removeLocations",
  ) {
    if (list.selectedIds.size === 0) return;
    setBulkMode(mode);
    setBulkOpen(true);
  }

  if (loading && groups.length === 0) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ height: 120 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--d-panel-gap)" }}>
      <AdminHero
        title="Grupos de Acesso"
        hint="Restringe usuários a um conjunto de estações."
        count={`${groups.length} grupos`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

      <AdminCard>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <AdminSearchInput
            value={list.query}
            onChange={list.setQuery}
            placeholder="Buscar grupos..."
          />
          <button
            type="button"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background:
                "linear-gradient(90deg,var(--accent),var(--accent-2))",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
            onClick={openCreate}
          >
            Novo grupo
          </button>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminSelectionBar
          pageIds={list.pageIds}
          selectedIds={list.selectedIds}
          total={list.total}
          onSelectPage={list.selectPage}
          onSelectAll={list.selectAll}
          onClearAll={list.clearAll}
        >
          {list.selectedIds.size > 0 && (
            <>
              <AdminBulkButton tone="danger" onClick={() => void bulkDelete()}>
                Excluir grupos
              </AdminBulkButton>
              <AdminBulkButton onClick={() => openBulk("addUsers")}>
                Adicionar usuários
              </AdminBulkButton>
              <AdminBulkButton onClick={() => openBulk("removeUsers")}>
                Remover usuários
              </AdminBulkButton>
              <AdminBulkButton onClick={() => openBulk("addLocations")}>
                Adicionar estações
              </AdminBulkButton>
              <AdminBulkButton onClick={() => openBulk("removeLocations")}>
                Remover estações
              </AdminBulkButton>
            </>
          )}
        </AdminSelectionBar>

        {list.pageItems.length === 0
          ? <EmptyState text="Nenhum grupo cadastrado." />
          : (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {list.pageItems.map((g) => (
                <AdminRow key={g.id}>
                  <input
                    type="checkbox"
                    checked={list.selectedIds.has(g.id)}
                    onChange={() => list.toggle(g.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ minWidth: 0, flex: "1 1 160px" }}>
                    <div
                      style={{
                        fontSize: "var(--d-body)",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {g.name}
                    </div>
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
                  </span>
                  <StatusBadge tone="neutral">
                    {g.locationIds.length} estações
                  </StatusBadge>
                  <StatusBadge tone="neutral">
                    {g.userIds.length} usuários
                  </StatusBadge>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => openEdit(g)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === g.id}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid rgba(239,68,68,.35)",
                        background: "rgba(239,68,68,.07)",
                        color: "#ef4444",
                        cursor: "pointer",
                      }}
                      onClick={() => void remove(g)}
                    >
                      {rowBusy === g.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </span>
                </AdminRow>
              ))}
            </div>
          )}

        <div style={{ marginTop: 8 }}>
          <Pagination
            page={list.page}
            totalPages={list.totalPages}
            total={list.total}
            pageSize={list.pageSize}
            onChange={list.setPage}
            onPageSize={list.setPageSize}
          />
        </div>
      </AdminCard>

      <GroupFormDialog
        key={editing ? `edit-${editing.id}` : "create"}
        open={formOpen}
        group={editing
          ? {
            id: editing.id,
            name: editing.name,
            description: editing.description,
            locationIds: editing.locationIds,
            userIds: editing.userIds,
          }
          : null}
        locations={locations}
        users={users}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void refresh();
        }}
      />

      <GroupBulkDialog
        open={bulkOpen}
        mode={bulkMode}
        groupIds={[...list.selectedIds]}
        locations={locations}
        users={users}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          list.clearAll();
          void refresh();
        }}
      />
    </div>
  );
}
