// Regression tests for the user create/edit dialog (audit U7 F1-F3).
// This is why they exist: the create flow returns a one-time password that
// exists only in this component's state. The dialog must not be dismissible
// while that secret is pending, must not close while the write is in
// flight, must ignore a response that lands after unmount, and must ask
// before discarding a typed draft. Mounts via createElement (linkedom
// cannot mount Fresh-precompiled JSX template vnodes; see scripts/test-dom).
import {
  type Seed,
  userDraftDirty,
  UserFormDialog,
} from "./UserFormDialog.tsx";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import type { TestDom } from "../../../scripts/test-dom.ts";

import { setupDom } from "../../../scripts/test-dom.ts";

import { createElement as h } from "preact";

import { act } from "preact/test-utils";

import { render } from "preact";

// newEvent: linkedom's own Event class. setupDom's typed Window does not
// expose it, and Deno's global Event lacks linkedom's internal dispatch
// fields, so events for the harness window must be built through it.
function newEvent(dom: TestDom, type: string, init?: EventInit): Event {
  const w = dom.window as unknown as { Event: typeof Event };
  return new w.Event(type, init);
}

function bootDom() {
  const dom = setupDom();
  const g = globalThis as unknown as Record<string, unknown>;
  const w = dom.window as unknown as Record<string, unknown>;
  if (!g.MutationObserver) {
    g.MutationObserver = w.MutationObserver ??
      class {
        observe() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      };
  }
  if (!g.requestAnimationFrame) {
    g.requestAnimationFrame = (cb: (t: number) => void) =>
      setTimeout(() => cb(Date.now()), 0);
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
  return dom;
}

interface PendingFetch {
  path: string;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
}

function stubFetch() {
  const calls: PendingFetch[] = [];
  const prev = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let resolve!: (response: Response) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Response>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({
      path: String(input),
      resolve,
      reject,
      signal: init?.signal ?? undefined,
    });
    return promise;
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = prev;
    },
  };
}

function stubConfirm(answer: boolean) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "confirm");
  let calls = 0;
  Object.defineProperty(globalThis, "confirm", {
    configurable: true,
    writable: true,
    value: () => {
      calls++;
      return answer;
    },
  });
  return {
    callCount: () => calls,
    restore() {
      if (prev) Object.defineProperty(globalThis, "confirm", prev);
      else delete (globalThis as Record<string, unknown>).confirm;
    },
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function mountCreate() {
  const dom = bootDom();
  const events = { closes: 0, saved: [] as string[], errors: [] as string[] };
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  await act(() =>
    void render(
      h(UserFormDialog, {
        open: true,
        mode: "create",
        accessGroups: [],
        onClose: () => events.closes++,
        onSaved: (m: string) => events.saved.push(m),
        onError: (m: string) => events.errors.push(m),
      }),
      container,
    )
  );
  await flush();
  const dialog = dom.document.querySelector("[data-admin-form-dialog]");
  assert(dialog !== null, "the dialog must portal-render under linkedom");
  const form = dom.document.getElementById("user-form");
  assert(form !== null, "the create form must render (Field is createElement)");
  const emailInput = dom.document.querySelector<HTMLInputElement>(
    "#user-form input[type=email]",
  );
  assert(emailInput !== null, "the email field must render");
  function buttonByText(label: string) {
    return [...dom.document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => (b.textContent ?? "").trim() === label);
  }
  async function submit() {
    await act(() => {
      form!.dispatchEvent(
        newEvent(dom, "submit", { bubbles: true, cancelable: true }),
      );
    });
  }
  async function typeEmail(value: string) {
    await act(() => {
      emailInput!.value = value;
      emailInput!.dispatchEvent(
        newEvent(dom, "input", { bubbles: true }),
      );
    });
  }
  async function pressEscape() {
    const kev = newEvent(dom, "keydown", { bubbles: true });
    Object.defineProperty(kev, "key", { value: "Escape" });
    await act(() => void dialog!.dispatchEvent(kev));
  }
  async function clickBackdrop() {
    await act(() => {
      (dialog!.parentNode as Element).dispatchEvent(
        newEvent(dom, "mousedown", { bubbles: true }),
      );
    });
  }
  return {
    dom,
    dialog,
    events,
    submit,
    typeEmail,
    pressEscape,
    clickBackdrop,
    buttonByText,
    unmount: () => render(null, container),
  };
}

Deno.test("create: the temp password survives dismissal until Já anotei", async () => {
  const fetchStub = stubFetch();
  const m = await mountCreate();
  try {
    await m.typeEmail("maria@plataforma.br");
    await m.submit();
    assertEquals(fetchStub.calls.length, 1);
    // In flight: no silent close (checked fully in the next case).
    fetchStub.calls[0].resolve(
      new Response(
        JSON.stringify({
          email: "maria@plataforma.br",
          temporaryPassword: "abc123DEF456",
          aviso: { sent: false, reason: "provedor indisponível" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await flush();
    const code = m.dom.document.querySelector("code");
    assertEquals(
      code?.textContent,
      "abc123DEF456",
      "the one-time password must be shown",
    );
    // Locked: the three silent dismissal paths must not clear the secret.
    await m.pressEscape();
    await m.clickBackdrop();
    const x = m.dom.document.querySelector<HTMLButtonElement>(
      '[data-admin-form-dialog] button[aria-label="Fechar"]',
    );
    assert(x?.disabled, "X must be disabled while the secret is pending");
    await act(() => x!.click());
    assertEquals(m.events.closes, 0, "dismissal must not drop the secret");
    assertEquals(
      m.dom.document.querySelector("code")?.textContent,
      "abc123DEF456",
    );
    // Acknowledgement is the only way out, and it reports the create.
    const ack = m.buttonByText("Já anotei");
    assert(ack !== null);
    await act(() => ack!.click());
    assertEquals(m.events.closes, 1);
    assertEquals(m.events.saved, ["Usuário maria@plataforma.br criado."]);
  } finally {
    fetchStub.restore();
    m.unmount();
  }
});

Deno.test("create: the dialog cannot be closed while the write is in flight", async () => {
  const fetchStub = stubFetch();
  const m = await mountCreate();
  try {
    await m.typeEmail("joao@plataforma.br");
    await m.submit();
    assertEquals(fetchStub.calls.length, 1, "the POST must be in flight");
    await m.pressEscape();
    await m.clickBackdrop();
    const x = m.dom.document.querySelector<HTMLButtonElement>(
      '[data-admin-form-dialog] button[aria-label="Fechar"]',
    );
    assert(x?.disabled, "X must be disabled mid-write");
    await act(() => x!.click());
    assertEquals(m.events.closes, 0, "no close while a write is pending");
    const cancel = m.buttonByText("Cancelar");
    assert(cancel?.disabled, "Cancelar must be disabled mid-write");
    // The result still lands: the password shows once the response arrives.
    fetchStub.calls[0].resolve(
      new Response(
        JSON.stringify({
          email: "joao@plataforma.br",
          temporaryPassword: "Z9k...senha-temp",
          aviso: { sent: true },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await flush();
    assertEquals(
      m.dom.document.querySelector("code")?.textContent,
      "Z9k...senha-temp",
      "the in-flight result must reach the admin",
    );
  } finally {
    fetchStub.restore();
    m.unmount();
  }
});

Deno.test("create: a response that lands after unmount is ignored", async () => {
  const fetchStub = stubFetch();
  const m = await mountCreate();
  try {
    await m.typeEmail("ana@plataforma.br");
    await m.submit();
    await act(() => m.unmount());
    // The server finished the create anyway; the dead form must not fire
    // the manager callbacks (that was the silent double-account path).
    fetchStub.calls[0].resolve(
      new Response(
        JSON.stringify({
          email: "ana@plataforma.br",
          temporaryPassword: "perdida-apos-unmount",
          aviso: { sent: true },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(m.events.closes, 0, "no close callback after unmount");
    assertEquals(m.events.saved.length, 0, "no saved callback after unmount");
    assertEquals(m.events.errors.length, 0, "no error callback after unmount");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("create: an aborted request resolves without a false error", async () => {
  const fetchStub = stubFetch();
  const m = await mountCreate();
  try {
    await m.typeEmail("bia@plataforma.br");
    await m.submit();
    await act(() => m.unmount());
    fetchStub.calls[0].reject(
      new DOMException("The operation was aborted.", "AbortError"),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(m.events.errors.length, 0, "an abort is not a server error");
    assertEquals(m.events.saved.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("create: a dirty draft asks before discarding on Escape", async () => {
  const deny = stubConfirm(false);
  const m = await mountCreate();
  try {
    await m.typeEmail("carlos@plataforma.br");
    await m.pressEscape();
    assertEquals(deny.callCount(), 1, "a dirty close must prompt once");
    assertEquals(m.events.closes, 0, "a denied discard keeps the draft open");
  } finally {
    deny.restore();
    m.unmount();
  }
  const accept = stubConfirm(true);
  const m2 = await mountCreate();
  try {
    await m2.typeEmail("carlos@plataforma.br");
    await m2.pressEscape();
    assertEquals(accept.callCount(), 1);
    assertEquals(m2.events.closes, 1, "an accepted discard closes");
  } finally {
    accept.restore();
    m2.unmount();
  }
});

Deno.test("create: a clean draft closes without a prompt", async () => {
  const never = stubConfirm(false);
  const m = await mountCreate();
  try {
    await m.pressEscape();
    assertEquals(never.callCount(), 0, "nothing dirty, nothing to confirm");
    assertEquals(m.events.closes, 1);
  } finally {
    never.restore();
    m.unmount();
  }
});

Deno.test("userDraftDirty compares the draft against the seed", () => {
  const seed: Seed = {
    email: "a@b.co",
    name: "Ana",
    phone: "",
    role: "user",
    authSource: "entra",
  };
  const base = {
    ...seed,
    password: "",
    entraObjectId: "",
    selectedGroups: [] as number[],
  };
  assertStrictEquals(userDraftDirty(seed, base), false);
  assertStrictEquals(userDraftDirty(seed, { ...base, email: "c@d.co" }), true);
  assertStrictEquals(userDraftDirty(seed, { ...base, name: "Other" }), true);
  assertStrictEquals(userDraftDirty(seed, { ...base, role: "admin" }), true);
  assertStrictEquals(
    userDraftDirty(seed, { ...base, authSource: "local" }),
    true,
  );
  assertStrictEquals(userDraftDirty(seed, { ...base, password: "x" }), true);
  assertStrictEquals(
    userDraftDirty(seed, { ...base, entraObjectId: "oid" }),
    true,
  );
  assertStrictEquals(
    userDraftDirty(seed, { ...base, selectedGroups: [3] }),
    true,
  );
});
