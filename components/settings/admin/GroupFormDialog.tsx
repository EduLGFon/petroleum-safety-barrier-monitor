// GroupFormDialog - create/edit an access group with stations and users.
import { SearchMultiSelect } from "../../settings/SearchMultiSelect.tsx";

import { AdminFormDialog } from "./AdminFormDialog.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useState } from "preact/hooks";

import { Field, ghostBtn, inputSt, primaryBtn } from "./AdminPrimitives.tsx";

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

export interface GroupFormValue {
  id?: number;
  name: string;
  description: string;
  locationIds: number[];
  userIds: number[];
}

interface Props {
  open: boolean;
  group: GroupFormValue | null;
  locations: LocationOpt[];
  users: UserOpt[];
  onClose: () => void;
  onSaved: () => void;
}

export function GroupFormDialog(
  { open, group, locations, users, onClose, onSaved }: Props,
) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [locationIds, setLocationIds] = useState<number[]>(
    group?.locationIds ?? [],
  );
  const [userIds, setUserIds] = useState<number[]>(group?.userIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Reset when the dialog opens for a different group.
  // (Simple: sync on open change is handled by parent remounting via key.)

  async function submit(e: Event) {
    e.preventDefault();
    if (!name.trim()) {
      setError("name is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        name,
        description,
        locationIds,
        userIds,
      };
      if (group?.id) {
        await adminApi(`/api/access-groups/${group.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await adminApi("/api/access-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const locationOptions = locations.map((l) => ({
    id: l.id,
    label: l.code,
    hint: l.name ?? undefined,
  }));

  const userOptions = users.map((u) => ({
    id: u.id,
    label: u.name || u.email,
    hint: u.email,
  }));

  return (
    <AdminFormDialog
      open={open}
      title={group?.id ? "Editar grupo" : "Novo grupo"}
      subtitle="Defina estações e usuários do grupo."
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
            form="group-form"
            style={primaryBtn}
            disabled={busy}
          >
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form
        id="group-form"
        onSubmit={submit}
        style={{ display: "grid", gap: 12 }}
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
        <SearchMultiSelect<number>
          label="Estações"
          options={locationOptions}
          selected={locationIds}
          onChange={setLocationIds}
        />
        <SearchMultiSelect<number>
          label="Usuários"
          options={userOptions}
          selected={userIds}
          onChange={setUserIds}
        />
      </form>
    </AdminFormDialog>
  );
}
