// UsersManager - admin user list, creation, and role/access actions.
// This is why it exists: promoting users and deactivating leavers is a core
// admin task; this manager wraps /api/users with PT labels and premium rows.
import {
  AdminCard,
  AdminHero,
  AdminRow,
  Avatar,
  dangerBtn,
  EmptyState,
  ErrorBanner,
  ghostBtn,
  inputSt,
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

import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { useAdminList } from "../../../hooks/useAdminList.ts";

import { TempPasswordDialog } from "./TempPasswordDialog.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { Pagination } from "../../table/Pagination.tsx";

import { UserFormDialog } from "./UserFormDialog.tsx";

import type { AvisoEntrega } from "./user-notice.ts";

import { AdminToast } from "./AdminToast.tsx";

interface PublicUser {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: "admin" | "user";
  active: boolean;
  auth_source?: "local" | "entra";
  entra_oid?: string | null;
  must_change_password: boolean;
}

interface CriacaoResposta extends PublicUser {
  temporaryPassword?: string;
  aviso?: AvisoEntrega | null;
}

interface RedefinicaoResposta extends PublicUser {
  temporaryPassword: string;
  aviso: AvisoEntrega;
}

// getUserId/getUserSearchText: stable module-scope callbacks, so the list
// hook only recomputes filters and prunes selection when items change.
function getUserId(user: PublicUser): number {
  return user.id;
}

function getUserSearchText(user: PublicUser): string {
  return `${user.email} ${user.name} ${
    user.role === "admin" ? "admin administrador" : "user usuário"
  } ${user.auth_source === "entra" ? "entra microsoft" : "local"} ${
    user.active ? "ativo active" : "inativo inactive"
  }`;
}

// canStartUserAction: pure decision for any row action that must not overlap
// an in-flight write. The global busy guard must be checked BEFORE showing
// an irreversible confirmation so a mis-click cannot queue a second action
// or race on patchBusy. Exported so the decision is testable without
// mounting the manager.
export function canStartUserAction(patchBusy: number | null): boolean {
  return patchBusy === null;
}
// Backwards-compatible alias for the convert action.
export const canStartConvertToEntra = canStartUserAction;

export function UsersManager(
  { onCount, currentUserId }: {
    onCount?: (n: number) => void;
    currentUserId?: number;
  },
) {
  const resource = useAdminResource<PublicUser>(async () => {
    const list = await adminApi("/api/users") as PublicUser[];
    onCount?.(list.length);
    return list;
  });
  const { items: users, loading, error, setError, reload: reloadUsers } =
    resource;

  const [accessGroups, setAccessGroups] = useState<
    { id: number; name: string }[]
  >([]);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const toastSeq = useRef(0);
  const [busyBulk, setBusyBulk] = useState(false);
  const [patchBusy, setPatchBusy] = useState<number | null>(null);
  const [editFor, setEditFor] = useState<PublicUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "local" | "entra"
  >("all");

  // Keep the existing setNotice("...")/setNotice("") call sites. A non-empty
  // message bumps the id so a repeated success remounts the toast and restarts
  // its timer; "" closes it.
  function setNotice(message: string) {
    if (message === "") {
      setToast(null);
      return;
    }
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message });
  }

  // Load access groups for the create dialog.
  async function loadGroups() {
    try {
      const groups = await adminApi("/api/access-groups") as {
        id: number;
        name: string;
      }[];
      setAccessGroups(groups.map((g) => ({ id: g.id, name: g.name })));
    } catch {
      // Non-fatal: groups just won't be selectable.
    }
  }
  // Load once on mount.
  useEffect(() => {
    void loadGroups();
  }, []);

  // Memoized on the filter inputs only, so the list hook keeps a stable
  // items identity across unrelated renders.
  const filteredByFilters = useMemo(
    () =>
      users.filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        if (statusFilter === "active" && !u.active) return false;
        if (statusFilter === "inactive" && u.active) return false;
        if (
          sourceFilter !== "all" &&
          (u.auth_source ?? "local") !== sourceFilter
        ) {
          return false;
        }
        return true;
      }),
    [users, roleFilter, statusFilter, sourceFilter],
  );

  const list = useAdminList<PublicUser, number>({
    items: filteredByFilters,
    getId: getUserId,
    getSearchText: getUserSearchText,
  });

  // A filter change starts a new scope: page one plus an empty selection,
  // so hidden rows never ride along in a later bulk action.
  function onRoleFilter(next: string) {
    setRoleFilter(next as typeof roleFilter);
    list.setPage(1);
    list.clearAll();
  }

  function onStatusFilter(next: string) {
    setStatusFilter(next as typeof statusFilter);
    list.setPage(1);
    list.clearAll();
  }

  function onSourceFilter(next: string) {
    setSourceFilter(next as typeof sourceFilter);
    list.setPage(1);
    list.clearAll();
  }

  // One-time reset password, shown once in a dialog, never in a notice.
  const [resetTemp, setResetTemp] = useState<
    {
      email: string;
      senha: string;
      aviso: AvisoEntrega | null;
    } | null
  >(null);

  async function refresh() {
    await reloadUsers();
  }

  async function revokeSessions(id: number) {
    if (!confirm("Revogar todas as sessões deste usuário?")) return;
    try {
      await adminApi(`/api/users/${id}/sessions`, { method: "DELETE" });
      setNotice("Sessões revogadas.");
      if (id === currentUserId) globalThis.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Row actions that drop privileges or access confirm first, like the
  // equivalent bulk buttons do; promotion and activation are not
  // destructive and keep the one-click path.
  async function requestRoleToggle(user: PublicUser) {
    if (!canStartUserAction(patchBusy)) {
      setError("Aguarde a conclusão da operação em andamento.");
      return;
    }
    if (
      user.role === "admin" &&
      !confirm(
        `Rebaixar ${user.email} para usuário? Esta pessoa perde o acesso de administração.`,
      )
    ) {
      return;
    }
    await patch(user.id, { role: user.role === "admin" ? "user" : "admin" });
  }

  async function requestActiveToggle(user: PublicUser) {
    if (!canStartUserAction(patchBusy)) {
      setError("Aguarde a conclusão da operação em andamento.");
      return;
    }
    if (
      user.active &&
      !confirm(
        `Desativar ${user.email}? As sessões ativas são encerradas e a pessoa não poderá entrar.`,
      )
    ) {
      return;
    }
    await patch(user.id, { active: !user.active });
  }

  // Irreversible from this screen: the server clears the local password,
  // revokes sessions, and refuses both a password reset and a conversion
  // back, so a mis-click on an address without Entra identity locks the
  // person out until a database fix. Confirm, then route through the same
  // patchBusy guard as every other row action (no double submit).
  async function convertToEntra(user: PublicUser) {
    if (!canStartUserAction(patchBusy)) {
      setError("Aguarde a conclusão da operação em andamento.");
      return;
    }
    if (
      !confirm(
        `Converter ${user.email} para Microsoft Entra? A senha local deixa de funcionar e a conta passa a entrar somente pelo Entra. Esta tela não desfaz a conversão.`,
      )
    ) {
      return;
    }
    setPatchBusy(user.id);
    try {
      await adminApi(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authSource: "entra" }),
      });
      setNotice(
        user.email +
          " passa a entrar pela Microsoft. A senha deixa de valer para esta conta.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(null);
    }
  }

  async function resetPassword(user: PublicUser) {
    if (user.auth_source === "entra") return;
    if (!canStartUserAction(patchBusy)) {
      setError("Aguarde a conclusão da operação em andamento.");
      return;
    }
    if (
      !confirm(
        `Redefinir a senha de ${user.email}? A senha atual deixa de valer e uma temporária é gerada.`,
      )
    ) return;
    setPatchBusy(user.id);
    try {
      const resposta = await adminApi(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      }) as RedefinicaoResposta;
      setResetTemp({
        email: resposta.email,
        senha: resposta.temporaryPassword,
        aviso: resposta.aviso ?? null,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(null);
    }
  }

  async function patch(id: number, body: unknown) {
    if (patchBusy !== null) return;
    setPatchBusy(id);
    try {
      await adminApi(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Deactivation ends this session, so leave at once. A demotion
      // only drops admin rights: /login bounces back to the app as a
      // normal user.
      const pedido = body as { active?: boolean; role?: string } | null;
      if (
        id === currentUserId &&
        (pedido?.active === false || pedido?.role === "user")
      ) {
        globalThis.location.href = "/login";
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(null);
    }
  }

  async function runBulk(action: string, confirmMsg?: string) {
    const ids = [...list.selectedIds];
    if (ids.length === 0) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyBulk(true);
    try {
      const result = await adminApi("/api/users/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      }) as { affected: number };
      const affected = result.affected ?? ids.length;
      if (
        (action === "deactivate" || action === "revokeSessions") &&
        currentUserId !== undefined &&
        ids.includes(currentUserId)
      ) {
        globalThis.location.href = "/login";
        return;
      }
      list.clearAll();
      setNotice(`Ação concluída: ${affected} afetado(s).`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyBulk(false);
    }
  }

  const select = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: [string, string][],
  ) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={inputSt}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AdminHero
        title="Usuários"
        hint="Crie acessos, promova administradores e desative quem saiu."
        count={`${users.length} no total`}
      />
      {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}
      {toast && (
        <AdminToast
          key={toast.id}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <AdminCard>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setNotice("");
            }}
            className="lift"
            style={{ ...primaryBtn }}
          >
            Novo usuário
          </button>
          {select("Filtrar por perfil", roleFilter, (v) =>
            onRoleFilter(v as typeof roleFilter), [
            ["all", "Todos os perfis"],
            ["admin", "Admin"],
            ["user", "Usuário"],
          ])}
          {select("Filtrar por status", statusFilter, (v) =>
            onStatusFilter(v as typeof statusFilter), [
            ["all", "Todos os status"],
            ["active", "Ativo"],
            ["inactive", "Inativo"],
          ])}
          {select("Filtrar por origem", sourceFilter, (v) =>
            onSourceFilter(v as typeof sourceFilter), [
            ["all", "Todas as origens"],
            ["entra", "Entra"],
            ["local", "Local"],
          ])}
        </div>
      </AdminCard>

      <UserFormDialog
        open={createOpen}
        mode="create"
        accessGroups={accessGroups}
        onClose={() =>
          setCreateOpen(false)}
        onSaved={(m) => {
          setNotice(m);
          void refresh();
        }}
        onError={(m) =>
          setError(m)}
      />
      {editFor && (
        <UserFormDialog
          open
          mode="edit"
          user={editFor}
          accessGroups={accessGroups}
          onClose={() => setEditFor(null)}
          onSaved={(m) => {
            setNotice(m);
            void refresh();
            setEditFor(null);
          }}
          onError={(m) =>
            setError(m)}
        />
      )}
      {resetTemp && (
        <TempPasswordDialog
          open
          email={resetTemp.email}
          senha={resetTemp.senha}
          aviso={resetTemp.aviso}
          onClose={() => {
            setNotice(`Senha de ${resetTemp.email} redefinida.`);
            setResetTemp(null);
          }}
        />
      )}

      <AdminCard>
        <div style={{ display: "grid", gap: 10 }}>
          <AdminSearchInput
            value={list.query}
            onChange={list.setQuery}
            placeholder="Buscar por e-mail, nome, perfil, origem ou status"
            ariaLabel="Buscar usuários"
          />
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
                  disabled={busyBulk}
                  onClick={() => void runBulk("activate")}
                >
                  Ativar
                </AdminBulkButton>
                <AdminBulkButton
                  disabled={busyBulk}
                  tone="danger"
                  onClick={() =>
                    void runBulk(
                      "deactivate",
                      "Desativar os usuários selecionados?",
                    )}
                >
                  Desativar
                </AdminBulkButton>
                <AdminBulkButton
                  disabled={busyBulk}
                  onClick={() =>
                    void runBulk("promote")}
                >
                  Promover
                </AdminBulkButton>
                <AdminBulkButton
                  disabled={busyBulk}
                  onClick={() =>
                    void runBulk(
                      "demote",
                      "Rebaixar os administradores selecionados?",
                    )}
                >
                  Rebaixar
                </AdminBulkButton>
                <AdminBulkButton
                  disabled={busyBulk}
                  onClick={() =>
                    void runBulk(
                      "revokeSessions",
                      "Revogar sessões dos usuários selecionados?",
                    )}
                >
                  Revogar sessões
                </AdminBulkButton>
              </>
            )}
          </AdminSelectionBar>

          {loading
            ? <SkeletonRows />
            : list.total === 0
            ? <EmptyState text="Nenhum usuário encontrado." />
            : (
              <div style={{ display: "grid", gap: 8 }}>
                {list.pageItems.map((u) => (
                  <div key={u.id} style={{ display: "grid", gap: 8 }}>
                    <AdminRow>
                      <input
                        type="checkbox"
                        checked={list.selectedIds.has(u.id)}
                        onChange={() =>
                          list.toggle(u.id)}
                        aria-label={`Selecionar ${u.email}`}
                        style={{ width: 16, height: 16, flexShrink: 0 }}
                      />
                      <Avatar name={u.name || u.email} />
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
                          {u.email}
                        </div>
                        {u.name && (
                          <div
                            style={{
                              fontSize: "var(--d-small)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {u.name}
                          </div>
                        )}
                      </span>
                      <StatusBadge
                        tone={u.role === "admin" ? "admin" : "neutral"}
                      >
                        {u.role === "admin" ? "Admin" : "Usuário"}
                      </StatusBadge>
                      <StatusBadge tone={u.active ? "active" : "inactive"}>
                        {u.active ? "Ativo" : "Inativo"}
                      </StatusBadge>
                      <StatusBadge
                        tone={u.auth_source === "entra" ? "admin" : "neutral"}
                      >
                        {u.auth_source === "entra" ? "Entra" : "Local"}
                      </StatusBadge>
                      {u.must_change_password === true && (
                        <StatusBadge tone="danger">
                          senha temporária
                        </StatusBadge>
                      )}
                      <span
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          disabled={patchBusy === u.id}
                          onClick={() =>
                            void requestRoleToggle(u)}
                          style={ghostBtn}
                        >
                          {patchBusy === u.id
                            ? "Aguarde…"
                            : u.role === "admin"
                            ? "Rebaixar"
                            : "Promover"}
                        </button>
                        <button
                          type="button"
                          disabled={patchBusy === u.id}
                          onClick={() => void requestActiveToggle(u)}
                          style={u.active ? dangerBtn : ghostBtn}
                        >
                          {patchBusy === u.id
                            ? "Aguarde…"
                            : u.active
                            ? "Desativar"
                            : "Ativar"}
                        </button>
                        {u.auth_source !== "entra" && (
                          <button
                            type="button"
                            disabled={patchBusy === u.id}
                            onClick={() => void resetPassword(u)}
                            style={ghostBtn}
                          >
                            {patchBusy === u.id
                              ? "Aguarde…"
                              : "Redefinir senha"}
                          </button>
                        )}
                        {u.auth_source !== "entra" && (
                          <button
                            type="button"
                            disabled={patchBusy === u.id}
                            onClick={() => void convertToEntra(u)}
                            style={ghostBtn}
                          >
                            {patchBusy === u.id
                              ? "Aguarde…"
                              : "Converter para Entra"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void revokeSessions(u.id)}
                          style={ghostBtn}
                        >
                          Revogar sessões
                        </button>
                        {currentUserId === u.id
                          ? (
                            <span
                              style={{
                                fontSize: "var(--d-small)",
                                color: "var(--text-muted)",
                              }}
                            >
                              Sua senha: aba Conta
                            </span>
                          )
                          : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditFor(u);
                                setNotice("");
                              }}
                              style={ghostBtn}
                            >
                              Editar
                            </button>
                          )}
                      </span>
                    </AdminRow>
                  </div>
                ))}
              </div>
            )}

          {list.total > 0 && (
            <Pagination
              page={list.page}
              totalPages={list.totalPages}
              total={list.total}
              pageSize={list.pageSize}
              onChange={list.setPage}
              onPageSize={list.setPageSize}
            />
          )}
        </div>
      </AdminCard>
    </div>
  );
}
