// RecipientsManager - alert email audience with paging, selection, and bulk actions.
// This is why it exists: the digest audience lives in alert_recipients;
// this manager wraps its CRUD with PT labels, paging, and bulk operations.
import {
  AdminCard,
  AdminHero,
  AdminRow,
  Avatar,
  dangerBtn,
  EmptyState,
  ErrorBanner,
  ghostBtn,
  primaryBtn,
  SkeletonRows,
  StatusBadge,
} from "./AdminPrimitives.tsx";

import {
  AdminBulkButton,
  AdminSearchInput,
  AdminSelectionBar,
} from "./AdminListControls.tsx";

import { useAdminResource } from "../../../hooks/useAdminResource.ts";

import { RecipientFormDialog } from "./RecipientFormDialog.tsx";

import { useAdminList } from "../../../hooks/useAdminList.ts";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { Pagination } from "../../table/Pagination.tsx";

import { useState } from "preact/hooks";

interface Recipient {
  id: number;
  email: string;
  name: string;
  phone: string;
  active: boolean;
}

interface UserOption {
  id: number;
  email: string;
  name: string;
  phone: string;
}

// RecipientsManager: recipient CRUD with paging, selection, and bulk actions.
export function RecipientsManager(
  { onCount }: { onCount?: (n: number) => void },
) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersError, setUsersError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const resource = useAdminResource<Recipient>(async (signal?: AbortSignal) => {
    const list = await adminApi("/api/recipients", { signal }) as Recipient[];
    onCount?.(list.filter((r) => r.active).length);
    try {
      const userList = await adminApi("/api/users", { signal }) as UserOption[];
      setUsers(userList);
      setUsersError("");
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        signal?.aborted
      ) throw err;
      setUsers([]);
      setUsersError(err instanceof Error ? err.message : String(err));
    }
    return list;
  });
  const { items, loading, error, setError, reload } = resource;

  const list = useAdminList<Recipient, number>({
    items,
    getId: (r) => r.id,
    getSearchText: (r) => `${r.email} ${r.name} ${r.phone}`,
  });

  const recipientEmails = new Set(items.map((r) => r.email.toLowerCase()));
  const availableUsers = users.filter(
    (u) => !recipientEmails.has(u.email.toLowerCase()),
  );

  async function refresh() {
    await reload();
  }

  async function toggle(item: Recipient) {
    try {
      await adminApi(`/api/recipients/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(item: Recipient) {
    if (confirmId !== item.id) {
      setConfirmId(item.id);
      return;
    }
    setConfirmId(null);
    try {
      await adminApi(`/api/recipients/${item.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function bulkAction(action: "activate" | "deactivate" | "delete") {
    const ids = [...list.selectedIds];
    if (ids.length === 0) return;
    if (
      action === "delete" && !confirm(`Remover ${ids.length} destinatário(s)?`)
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await adminApi("/api/recipients/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      list.clearAll();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Destinatários"
        hint="Quem recebe os alertas. E-mail sempre; mensagem só em barreira sem contingência."
        count={`${items.filter((r) => r.active).length} ativos`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      <AdminCard>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <AdminSearchInput
            value={list.query}
            onChange={list.setQuery}
            placeholder="Buscar por e-mail, nome ou telefone"
            ariaLabel="Buscar destinatários"
          />
          <button
            type="button"
            className="lift"
            onClick={() => setDialogOpen(true)}
            style={{ ...primaryBtn }}
          >
            Adicionar destinatário
          </button>
        </div>
        {usersError && (
          <div
            role="alert"
            style={{
              fontSize: "var(--d-small)",
              color: "var(--au-danger-fg)",
            }}
          >
            Não foi possível carregar usuários: {usersError}
          </div>
        )}
        <AdminSelectionBar
          pageIds={list.pageIds}
          selectedIds={list.selectedIds}
          total={list.total}
          onSelectPage={list.selectPage}
          onSelectAll={list.selectAll}
          onClearAll={list.clearAll}
        >
          {list.selectedCount > 0 && (
            <>
              <AdminBulkButton
                onClick={() => void bulkAction("activate")}
                disabled={bulkBusy}
              >
                Ativar
              </AdminBulkButton>
              <AdminBulkButton
                onClick={() => void bulkAction("deactivate")}
                disabled={bulkBusy}
              >
                Desativar
              </AdminBulkButton>
              <AdminBulkButton
                tone="danger"
                onClick={() => void bulkAction("delete")}
                disabled={bulkBusy}
              >
                Remover
              </AdminBulkButton>
            </>
          )}
        </AdminSelectionBar>
        {loading
          ? <SkeletonRows />
          : items.length === 0
          ? (
            <EmptyState text="Nenhum destinatário. Adicione quem recebe os alertas." />
          )
          : list.total === 0
          ? <EmptyState text="Nenhum resultado para a busca." />
          : (
            <div style={{ display: "grid", gap: 8 }}>
              {list.pageItems.map((r) => (
                <AdminRow key={r.id}>
                  <input
                    type="checkbox"
                    checked={list.selectedIds.has(r.id)}
                    onChange={() => list.toggle(r.id)}
                    aria-label={`Selecionar ${r.email}`}
                  />
                  <Avatar name={r.name || r.email} />
                  <span style={{ minWidth: 0, flex: "1 1 160px" }}>
                    <div
                      style={{
                        fontSize: "var(--d-body)",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.email}
                    </div>
                    {r.name && (
                      <div
                        style={{
                          fontSize: "var(--d-small)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {r.name}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </div>
                    )}
                    {!r.name && r.phone && (
                      <div
                        style={{
                          fontSize: "var(--d-small)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {r.phone}
                      </div>
                    )}
                  </span>
                  <StatusBadge tone={r.active ? "active" : "inactive"}>
                    {r.active ? "Ativo" : "Inativo"}
                  </StatusBadge>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void toggle(r)}
                      style={ghostBtn}
                    >
                      {r.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(r)}
                      style={dangerBtn}
                    >
                      {confirmId === r.id ? "Confirmar remoção?" : "Remover"}
                    </button>
                  </span>
                </AdminRow>
              ))}
              <Pagination
                page={list.page}
                totalPages={list.totalPages}
                total={list.total}
                pageSize={list.pageSize}
                onChange={list.setPage}
                onPageSize={list.setPageSize}
              />
            </div>
          )}
      </AdminCard>
      <RecipientFormDialog
        open={dialogOpen}
        users={availableUsers}
        usersError={usersError}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          await refresh();
        }}
      />
    </div>
  );
}
