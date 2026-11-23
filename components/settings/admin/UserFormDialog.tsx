// UserFormDialog - create/edit user dialog for the admin Users page.
// This is why it exists: creation and editing share the AdminFormDialog shell
// and the one-time temporary password block, with Microsoft Entra as the
// default new-user type and local passwords as the second option.
// Built with createElement because the linkedom test harness cannot mount
// Fresh-precompiled JSX template vnodes (see scripts/test-dom.ts); the
// one-time password flow (D30) is covered by those regression tests.
import { Field, ghostBtn, inputSt, primaryBtn } from "./AdminPrimitives.tsx";

import { AdminFormDialog, requestClose } from "./AdminFormDialog.tsx";

import { type AvisoEntrega, mensagemAviso } from "./user-notice.ts";

import { clearPasswordClipboard } from "./TempPasswordDialog.tsx";

import { SearchMultiSelect } from "../SearchMultiSelect.tsx";

import { adminApi } from "../../../lib/api/admin-client.ts";

import { useEffect, useRef, useState } from "preact/hooks";

import { createElement as h } from "preact";

import type { JSX } from "preact";

// Typed element events for the createElement-built tree (JSX inference is
// unavailable in template-vnode-free tests, so the handlers type here).
type InputEvt = JSX.TargetedEvent<HTMLInputElement>;
type SelectEvt = JSX.TargetedEvent<HTMLSelectElement>;

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

export interface Seed {
  email: string;
  name: string;
  phone: string;
  role: "admin" | "user";
  authSource: "local" | "entra";
}

export interface UserDraft extends Seed {
  password: string;
  entraObjectId: string;
  selectedGroups: number[];
}

// userDraftDirty: pure check of the live form draft against the seed
// snapshot. Exported so the dirty-close regression tests cover the exact
// comparison the dialog uses without mounting the DOM.
export function userDraftDirty(seed: Seed, draft: UserDraft): boolean {
  return (
    draft.email !== seed.email ||
    draft.name !== seed.name ||
    draft.phone !== seed.phone ||
    draft.role !== seed.role ||
    draft.authSource !== seed.authSource ||
    draft.password !== "" ||
    draft.entraObjectId !== "" ||
    draft.selectedGroups.length > 0
  );
}

interface TempPassword {
  email: string;
  senha: string;
  aviso: AvisoEntrega | null;
}

function seedFor(mode: "create" | "edit", user?: UserFormDialogProps["user"]) {
  if (mode === "edit" && user) {
    return {
      email: user.email ?? "",
      name: user.name ?? "",
      phone: user.phone ?? "",
      role: user.role ?? "user",
      authSource: user.auth_source ?? "entra",
    } satisfies Seed;
  }
  return {
    email: "",
    name: "",
    phone: "",
    role: "user",
    authSource: "entra",
  } satisfies Seed;
}

export function UserFormDialog(
  { open, mode, user, accessGroups, onClose, onSaved, onError }:
    UserFormDialogProps,
) {
  const isEdit = mode === "edit";
  const initialSeed = seedFor(mode, user);
  const [email, setEmail] = useState(initialSeed.email);
  const [name, setName] = useState(initialSeed.name);
  const [phone, setPhone] = useState(initialSeed.phone);
  const [role, setRole] = useState<"admin" | "user">(initialSeed.role);
  const [authSource, setAuthSource] = useState<"local" | "entra">(
    initialSeed.authSource,
  );
  const [password, setPassword] = useState("");
  const [entraObjectId, setEntraObjectId] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState<TempPassword | null>(null);
  const [copiaMsg, setCopiaMsg] = useState("");
  const [copying, setCopying] = useState(false);

  // Values the form was seeded with: the dirty check compares live state
  // against this snapshot so an accidental dismissal can ask first.
  const seedRef = useRef<Seed>(initialSeed);

  // SECURITY (D30) / stale-result guards: the dialog must never lose a
  // write's outcome. aliveRef flips false on unmount so a late response is
  // dropped instead of landing on a dead component; submitAbortRef cancels
  // the in-flight request; busyRef blocks re-entry (Enter key repeat) even
  // before the disabled button re-render has landed.
  const aliveRef = useRef(true);
  const busyRef = useRef(false);
  const submitAbortRef = useRef<AbortController | null>(null);
  // Whether our copy button put the one-time password in the clipboard.
  const copiedRef = useRef(false);
  // Pending copy promise: acking before it settles must still wait for it.
  const copyPromiseRef = useRef<Promise<void> | null>(null);
  const copyPendingRef = useRef(false);
  const copyInvalidatedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      submitAbortRef.current?.abort();
      submitAbortRef.current = null;
    };
  }, []);

  // Reset every field when the dialog opens or when another user/mode
  // is targeted. Depending on the user object (not just its id) reseeds
  // same-id refreshes; the open guard keeps typing intact while open.
  useEffect(() => {
    if (!open) return;
    const seed = seedFor(mode, user);
    seedRef.current = seed;
    setEmail(seed.email);
    setName(seed.name);
    setPhone(seed.phone);
    setRole(seed.role);
    setAuthSource(seed.authSource);
    setPassword("");
    setEntraObjectId("");
    setSelectedGroups([]);
    setBusy(false);
    busyRef.current = false;
    setError("");
    setTempPassword(null);
    setCopiaMsg("");
    copiedRef.current = false;
    copyPromiseRef.current = null;
    copyPendingRef.current = false;
    copyInvalidatedRef.current = false;
    setCopying(false);
  }, [open, mode, user]);

  const groupOptions = accessGroups.map((g) => ({ id: g.id, label: g.name }));

  // The draft is dirty while it differs from the seed snapshot; while a
  // secret is pending the locked shell owns the close decision instead.
  const dirty = !tempPassword &&
    userDraftDirty(seedRef.current, {
      email,
      name,
      phone,
      role,
      authSource,
      password,
      entraObjectId,
      selectedGroups,
    });

  // Copy the one-time password; it never leaves component state.
  async function copiarSenha() {
    if (!tempPassword) return;
    if (copyPendingRef.current) return;
    copyPendingRef.current = true;
    setCopying(true);
    copyInvalidatedRef.current = false;
    const senha = tempPassword.senha;
    const promise = (async () => {
      try {
        await navigator.clipboard.writeText(senha);
        if (!aliveRef.current) return;
        if (copyInvalidatedRef.current) return;
        copiedRef.current = true;
        setCopiaMsg(
          "Senha copiada. Cole no campo de senha da pessoa, não em chat ou e-mail.",
        );
      } catch {
        if (!aliveRef.current) return;
        if (copyInvalidatedRef.current) return;
        setCopiaMsg("Não foi possível copiar. Selecione e copie.");
      }
    })().finally(() => {
      copyPendingRef.current = false;
      if (aliveRef.current) setCopying(false);
    });
    copyPromiseRef.current = promise;
    await promise;
  }

  async function submit(e: Event) {
    e.preventDefault();
    // Re-entry guard: the footer button is disabled while busy, but Enter
    // inside the form can fire submit again before that render lands.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    // Abort the in-flight request when the dialog unmounts, and ignore any
    // outcome once the component is gone: a response landing on a dead
    // form is the exact way a one-time password used to be lost silently.
    const ctrl = new AbortController();
    submitAbortRef.current?.abort();
    submitAbortRef.current = ctrl;
    const stale = () => !aliveRef.current || ctrl.signal.aborted;
    try {
      if (isEdit && user) {
        const body: Record<string, unknown> = { email, name, phone, role };
        if (password !== "") body.password = password;
        await adminApi(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (stale()) return;
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
        signal: ctrl.signal,
      }) as {
        email: string;
        temporaryPassword?: string;
        aviso?: AvisoEntrega | null;
      };
      if (stale()) return;
      const devolvida = created.temporaryPassword;
      if (devolvida) {
        setTempPassword({
          email: created.email,
          senha: devolvida,
          aviso: created.aviso ?? null,
        });
        setCopiaMsg("");
      } else {
        onSaved(`Usuário ${created.email} criado.`);
        onClose();
      }
    } catch (err) {
      // A cancelled request is a neutral outcome, not a server error; the
      // browser's abort text must never reach the admin as a failure.
      if (stale()) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError(msg);
    } finally {
      busyRef.current = false;
      if (submitAbortRef.current === ctrl) submitAbortRef.current = null;
      if (aliveRef.current) setBusy(false);
    }
  }

  // Acknowledgement (the only close path while a secret is pending): wipe
  // the clipboard copy we made, then save-and-close (see D30).
  async function acknowledge() {
    const pending = tempPassword;
    if (!pending) return;
    const copyPending = copyPromiseRef.current;
    if (copyPending) {
      try {
        const outcome = await Promise.race([
          copyPending.then(() => "done", () => "error"),
          new Promise<string>((resolve) =>
            setTimeout(() => resolve("timeout"), 0)
          ),
        ]);
        if (outcome === "timeout") {
          copyInvalidatedRef.current = true;
          clearPasswordClipboard();
        }
      } catch {
        // The copy already reported its own failure; nothing to clear.
      }
    }
    if (copiedRef.current) {
      copiedRef.current = false;
      clearPasswordClipboard();
    }
    setTempPassword(null);
    onSaved(`Usuário ${pending.email} criado.`);
    onClose();
  }

  if (!open) return null;

  const footer = tempPassword
    ? h(
      "button",
      {
        type: "button",
        onClick: () => void acknowledge(),
        className: "lift",
        style: ghostBtn,
      },
      "Já anotei",
    )
    : h(
      "div",
      { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
      h(
        "button",
        {
          type: "button",
          onClick: () => requestClose({ busy, dirty }, onClose),
          disabled: busy,
          style: ghostBtn,
        },
        "Cancelar",
      ),
      h(
        "button",
        {
          type: "submit",
          form: "user-form",
          disabled: busy,
          className: "lift",
          style: { ...primaryBtn, opacity: busy ? 0.7 : 1 },
        },
        busy ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar usuário",
      ),
    );

  let children;
  if (tempPassword) {
    children = h(
      "div",
      { style: { display: "grid", gap: 8 } },
      h("strong", null, `Senha temporária de ${tempPassword.email}`),
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          },
        },
        h(
          "code",
          { style: { fontSize: 18, letterSpacing: 1, userSelect: "all" } },
          tempPassword.senha,
        ),
        h(
          "button",
          {
            type: "button",
            disabled: copying,
            onClick: () => void copiarSenha(),
            style: { ...ghostBtn, opacity: copying ? 0.7 : 1 },
          },
          "Copiar",
        ),
      ),
      copiaMsg
        ? h("span", { role: "status", style: { opacity: 0.8 } }, copiaMsg)
        : null,
      h(
        "span",
        { style: { opacity: 0.8 } },
        "Anote e entregue à pessoa agora: esta senha não é guardada e não aparece de novo. No primeiro acesso ela é obrigada a trocar.",
      ),
      mensagemAviso(tempPassword.aviso)
        ? h(
          "span",
          { style: { opacity: 0.8 } },
          mensagemAviso(tempPassword.aviso),
          tempPassword.aviso && !tempPassword.aviso.sent
            ? " Entregue a senha por outro canal."
            : "",
        )
        : null,
    );
  } else {
    children = h(
      "form",
      {
        id: "user-form",
        onSubmit: submit,
        style: { display: "grid", gap: 10 },
      },
      h(
        Field,
        { label: "E-mail" },
        h("input", {
          type: "email",
          required: true,
          value: email,
          onInput: (e: InputEvt) => setEmail(e.currentTarget.value),
          style: inputSt,
        }),
      ),
      h(
        Field,
        { label: "Nome" },
        h("input", {
          type: "text",
          value: name,
          onInput: (e: InputEvt) => setName(e.currentTarget.value),
          style: inputSt,
        }),
      ),
      h(
        Field,
        { label: "Telefone" },
        h("input", {
          type: "tel",
          value: phone,
          onInput: (e: InputEvt) => setPhone(e.currentTarget.value),
          style: inputSt,
        }),
      ),
      h(
        Field,
        { label: "Perfil" },
        h(
          "select",
          {
            value: role,
            onChange: (e: SelectEvt) =>
              setRole(e.currentTarget.value as "admin" | "user"),
            style: inputSt,
          },
          h("option", { value: "user" }, "Usuário"),
          h("option", { value: "admin" }, "Admin"),
        ),
      ),
      !isEdit &&
        h(
          Field,
          { label: "Tipo de conta" },
          h(
            "select",
            {
              value: authSource,
              onChange: (e: SelectEvt) => {
                setAuthSource(e.currentTarget.value as "local" | "entra");
                setTempPassword(null);
              },
              style: inputSt,
            },
            h("option", { value: "entra" }, "Microsoft Entra"),
            h("option", { value: "local" }, "Senha local"),
          ),
        ),
      !isEdit && authSource === "local" &&
        h(
          Field,
          { label: "Senha (vazia = o sistema gera)" },
          h("input", {
            type: "password",
            minLength: 12,
            placeholder: "deixe vazio e o sistema gera uma",
            value: password,
            onInput: (e: InputEvt) => setPassword(e.currentTarget.value),
            style: inputSt,
          }),
        ),
      !isEdit && authSource === "entra" &&
        h(
          Field,
          { label: "Object ID do Entra (opcional)" },
          h("input", {
            type: "text",
            placeholder: "deixe vazio: vincula no primeiro acesso",
            value: entraObjectId,
            onInput: (e: InputEvt) => setEntraObjectId(e.currentTarget.value),
            style: inputSt,
          }),
        ),
      isEdit &&
        h(
          Field,
          { label: "Nova senha (12+, opcional)" },
          h("input", {
            type: "password",
            minLength: 12,
            placeholder: "Deixe em branco para manter",
            value: password,
            onInput: (e: InputEvt) => setPassword(e.currentTarget.value),
            style: inputSt,
          }),
        ),
      !isEdit && role !== "admin" &&
        h(SearchMultiSelect<number>, {
          label: "Grupos de acesso",
          options: groupOptions,
          selected: selectedGroups,
          onChange: setSelectedGroups,
          placeholder: "Selecionar grupos...",
        }),
    );
  }

  return h(
    AdminFormDialog,
    {
      open,
      // SECURITY (D30): locked while the one-time password is pending, busy
      // while the write is in flight, dirty when the draft differs from the
      // seeded values; the shell guards every dismissal path with these.
      locked: tempPassword !== null,
      busy,
      dirty,
      title: isEdit ? "Editar usuário" : "Novo usuário",
      subtitle: isEdit
        ? user?.email
        : "Crie um acesso com Microsoft Entra por padrão.",
      onClose,
      footer,
      error: error || undefined,
    },
    children,
  );
}
