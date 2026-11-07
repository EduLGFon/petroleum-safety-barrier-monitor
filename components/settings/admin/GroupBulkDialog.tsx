// GroupBulkDialog - bulk add/remove users or stations for selected groups.
import { SearchMultiSelect } from "../../settings/SearchMultiSelect.tsx";

import { AdminFormDialog } from "./AdminFormDialog.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useState } from "preact/hooks";

import { ghostBtn, primaryBtn } from "./AdminPrimitives.tsx";

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

type Mode =
  | "addUsers"
  | "removeUsers"
  | "addLocations"
  | "removeLocations";

interface Props {
  open: boolean;
  mode: Mode;
  groupIds: number[];
  locations: LocationOpt[];
  users: UserOpt[];
  onClose: () => void;
  onDone: () => void;
}

const MODE_LABEL: Record<Mode, string> = {
  addUsers: "Adicionar usuários",
  removeUsers: "Remover usuários",
  addLocations: "Adicionar estações",
  removeLocations: "Remover estações",
};

export function GroupBulkDialog(
  { open, mode, groupIds, locations, users, onClose, onDone }: Props,
) {
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: Event) {
    e.preventDefault();
    if (selected.length === 0) {
      setError("Selecione ao menos um item.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const isUsers = mode === "addUsers" || mode === "removeUsers";
      const action = mode;
      const body: Record<string, unknown> = {
        action,
        ids: groupIds,
      };
      if (isUsers) body.userIds = selected;
      else body.locationIds = selected;
      await adminApi("/api/access-groups/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSelected([]);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const options = mode === "addUsers" || mode === "removeUsers"
    ? users.map((u) => ({ id: u.id, label: u.name || u.email, hint: u.email }))
    : locations.map((l) => ({
      id: l.id,
      label: l.code,
      hint: l.name ?? undefined,
    }));

  return (
    <AdminFormDialog
      open={open}
      title={MODE_LABEL[mode]}
      subtitle={`${groupIds.length} grupo(s) selecionado(s).`}
      onClose={onClose}
      error={error}
      footer={
        <>
          <button
            type="button"
            style={ghostBtn}
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="group-bulk-form"
            style={primaryBtn}
            disabled={busy}
          >
            {busy ? "Aplicando…" : "Aplicar"}
          </button>
        </>
      }
    >
      <form
        id="group-bulk-form"
        onSubmit={submit}
        style={{ display: "grid", gap: 12 }}
      >
        <SearchMultiSelect<number>
          label={mode === "addUsers" || mode === "removeUsers"
            ? "Usuários"
            : "Estações"}
          options={options}
          selected={selected}
          onChange={setSelected}
        />
      </form>
    </AdminFormDialog>
  );
}
