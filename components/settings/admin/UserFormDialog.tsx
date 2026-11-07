// UserFormDialog - create/edit user dialog for the admin Users page.
// This is why it exists: creation and editing share the AdminFormDialog shell
// and the one-time temporary password block, with Microsoft Entra as the
// default new-user type and local passwords as the second option.
import { AdminFormDialog } from "./AdminFormDialog.tsx";

import { Field, ghostBtn, inputSt, primaryBtn } from "./AdminPrimitives.tsx";

import { SearchMultiSelect } from "../SearchMultiSelect.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useState } from "preact/hooks";

import type { ComponentChildren } from "preact";

export interface UserFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  user?: {
    id: number;
    email: string;
    name: string;
    phone: string;
    role: "admin" | "user";
    auth_source?: "local" | "entra";
  } | null;
  accessGroups: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

interface AvisoEntrega {
  sent: boolean;
  reason?: string;
}

function mensagemAviso(aviso: AvisoEntrega | null | undefined): string | null {
  if (!aviso) return null;
  if (aviso.sent) return "aviso enviado por MSGFLOW.";
  const motivo = aviso.reason ? `: ${aviso.reason}` : ".";
  return `aviso não enviado${motivo}`;
}

export function UserFormDialog(
  { open, mode, user, accessGroups, onClose, onSaved, onError }:
    UserFormDialogProps,
) {
  const isEdit = mode === "edit";
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<"admin" | "user">(user?.role ?? "user");
  const [authSource, setAuthSource] = useState<"local" | "entra">(
    user?.auth_source ?? "entra",
  );
  const [password, setPassword] = useState("");
  const [entraObjectId, setEntraObjectId] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState<
    {
      email: string;
      senha: string;
      aviso: AvisoEntrega | null;
    } | null
  >(null);

  // Reset form state when opening for a different user/mode.
  // (Simple: reset on open change.)
  // We keep minimal; parent controls open.

  const groupOptions = accessGroups.map((g) => ({ id: g.id, label: g.name }));

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isEdit && user) {
        const body: Record<string, unknown> = { email, name, phone, role };
        if (password !== "") body.password = password;
        await adminApi(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        onSaved(`Usuário ${email} atualizado.`);
        onClose();
        return;
      }
      const body: Record<string, unknown> = {
        email,
        name,
        phone,
        role,
        authSource,
      };
      if (authSource === "local") {
        if (password !== "") body.password = password;
      } else if (entraObjectId.trim() !== "") {
        body.entraObjectId = entraObjectId.trim();
      }
      if (role !== "admin" && selectedGroups.length > 0) {
        body.accessGroupIds = selectedGroups;
      }
      const created = await adminApi("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as {
        email: string;
        temporaryPassword?: string;
        aviso?: AvisoEntrega | null;
      };
      const devolvida = created.temporaryPassword;
      if (devolvida) {
        setTempPassword({
          email: created.email,
          senha: devolvida,
          aviso: created.aviso ?? null,
        });
      } else {
        onSaved(`Usuário ${created.email} criado.`);
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const footer = tempPassword
    ? (
      <button
        type="button"
        onClick={() => {
          setTempPassword(null);
          onSaved(`Usuário ${tempPassword.email} criado.`);
          onClose();
        }}
        style={ghostBtn}
      >
        Já anotei
      </button>
    )
    : (
      <>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={ghostBtn}
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="user-form"
          disabled={busy}
          className="lift"
          style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar usuário"}
        </button>
      </>
    );

  let children: ComponentChildren;
  if (tempPassword) {
    children = (
      <div style={{ display: "grid", gap: 8 }}>
        <strong>Senha temporária de {tempPassword.email}</strong>
        <code
          style={{ fontSize: 18, letterSpacing: 1, userSelect: "all" }}
        >
          {tempPassword.senha}
        </code>
        <span style={{ opacity: 0.8 }}>
          Anote e entregue à pessoa agora: esta senha não é guardada e não
          aparece de novo. No primeiro acesso ela é obrigada a trocar.
        </span>
        {mensagemAviso(tempPassword.aviso) && (
          <span style={{ opacity: 0.8 }}>
            {mensagemAviso(tempPassword.aviso)}
            {tempPassword.aviso && !tempPassword.aviso.sent
              ? " Entregue a senha por outro canal."
              : ""}
          </span>
        )}
      </div>
    );
  } else {
    children = (
      <form
        id="user-form"
        onSubmit={submit}
        style={{ display: "grid", gap: 10 }}
      >
        <Field label="E-mail">
          <input
            type="email"
            required
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
            style={inputSt}
          />
        </Field>
        <Field label="Nome">
          <input
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            style={inputSt}
          />
        </Field>
        <Field label="Telefone">
          <input
            type="tel"
            value={phone}
            onInput={(e) => setPhone(e.currentTarget.value)}
            style={inputSt}
          />
        </Field>
        <Field label="Perfil">
          <select
            value={role}
            onChange={(e) => setRole(e.currentTarget.value as "admin" | "user")}
            style={inputSt}
          >
            <option value="user">Usuário</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        {!isEdit && (
          <Field label="Tipo de conta">
            <select
              value={authSource}
              onChange={(e) => {
                setAuthSource(e.currentTarget.value as "local" | "entra");
                setTempPassword(null);
              }}
              style={inputSt}
            >
              <option value="entra">Microsoft Entra</option>
              <option value="local">Senha local</option>
            </select>
          </Field>
        )}
        {!isEdit && authSource === "local" && (
          <Field label="Senha (vazia = o sistema gera)">
            <input
              type="password"
              minLength={12}
              placeholder="deixe vazio e o sistema gera uma"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
        )}
        {!isEdit && authSource === "entra" && (
          <Field label="Object ID do Entra (opcional)">
            <input
              type="text"
              placeholder="deixe vazio: vincula no primeiro acesso"
              value={entraObjectId}
              onInput={(e) => setEntraObjectId(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
        )}
        {isEdit && (
          <Field label="Nova senha (12+, opcional)">
            <input
              type="password"
              minLength={12}
              placeholder="Deixe em branco para manter"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              style={inputSt}
            />
          </Field>
        )}
        {!isEdit && role !== "admin" && (
          <SearchMultiSelect<number>
            label="Grupos de acesso"
            options={groupOptions}
            selected={selectedGroups}
            onChange={setSelectedGroups}
            placeholder="Selecionar grupos..."
          />
        )}
      </form>
    );
  }

  return (
    <AdminFormDialog
      open={open}
      title={isEdit ? "Editar usuário" : "Novo usuário"}
      subtitle={isEdit
        ? user?.email
        : "Crie um acesso com Microsoft Entra por padrão."}
      onClose={onClose}
      footer={footer}
      error={error || undefined}
    >
      {children}
    </AdminFormDialog>
  );
}
