// Regression tests for the shared admin dialog shell.
// This is why they exist: backdrop, Escape, and X are the three silent
// ways an admin used to lose a one-time password, an in-flight write, or a
// long unsaved draft (audit U7 F1-F3). The shell must refuse all three
// while a secret is pending (locked) or a write runs (busy), and must ask
// before discarding edits (dirty). Mounts through createElement because
// Fresh-precompiled JSX template vnodes do not mount under linkedom
// (see scripts/test-dom.ts); AdminFormDialog is built with h() for this.
import {
  AdminFormDialog,
  DISCARD_CONFIRM_MSG,
  requestClose,
} from "./AdminFormDialog.tsx";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import type { TestDom } from "../../../scripts/test-dom.ts";

import { setupDom } from "../../../scripts/test-dom.ts";

import { createElement as h } from "preact";

import { act } from "preact/test-utils";

import { render } from "preact";

/**
 * Boot the DOM and polyfill the browser globals the shell uses (linkedom
 * has neither global MutationObserver nor requestAnimationFrame).
 */

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

function stubConfirm(answer: boolean | (() => boolean)) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "confirm");
  const calls: string[] = [];
  Object.defineProperty(globalThis, "confirm", {
    configurable: true,
    writable: true,
    value: (message?: string) => {
      calls.push(String(message ?? ""));
      return typeof answer === "boolean" ? answer : answer();
    },
  });
  return {
    calls,
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

async function mountShell(
  props: Partial<Parameters<typeof AdminFormDialog>[0]> = {},
) {
  const dom = bootDom();
  const closes: number[] = [];
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  await act(() =>
    void render(
      h(
        AdminFormDialog,
        {
          open: true,
          title: "Diálogo de teste",
          onClose: () => closes.push(1),
          children: h("p", null, "conteúdo"),
          ...props,
        },
      ),
      container,
    )
  );
  await flush();
  const dialog = dom.document.querySelector("[data-admin-form-dialog]");
  assert(dialog !== null, "shell must portal-render under linkedom");
  return { dom, dialog, closes, container };
}

function pressEscape(dom: ReturnType<typeof bootDom>, el: Element) {
  const ev = newEvent(dom, "keydown", { bubbles: true });
  Object.defineProperty(ev, "key", { value: "Escape" });
  el.dispatchEvent(ev);
}

function clickBackdrop(dom: ReturnType<typeof bootDom>, dialog: Element) {
  const overlay = dialog.parentNode as Element;
  overlay.dispatchEvent(newEvent(dom, "mousedown", { bubbles: true }));
}

function clickClose(dom: ReturnType<typeof bootDom>) {
  const x = dom.document.querySelector<HTMLButtonElement>(
    '[data-admin-form-dialog] button[aria-label="Fechar"]',
  );
  assert(x !== null, "close button must exist");
  x.click();
}

Deno.test("requestClose refuses to close a locked or busy dialog", () => {
  const stub = stubConfirm(true);
  try {
    let closed = 0;
    requestClose({ locked: true }, () => closed++);
    requestClose({ busy: true }, () => closed++);
    requestClose({ locked: true, dirty: true }, () => closed++);
    assertStrictEquals(closed, 0, "locked/busy must never close");
    assertEquals(stub.calls.length, 0, "blocked closes must not prompt");
  } finally {
    stub.restore();
  }
});

Deno.test("requestClose confirms before discarding a dirty draft", () => {
  let closed = 0;
  const deny = stubConfirm(false);
  try {
    requestClose({ dirty: true }, () => closed++);
    assertStrictEquals(closed, 0, "a denied discard must keep the draft");
    assertEquals(deny.calls, [DISCARD_CONFIRM_MSG]);
  } finally {
    deny.restore();
  }
  const allow = stubConfirm(true);
  try {
    requestClose({ dirty: true }, () => closed++);
    assertStrictEquals(closed, 1, "an accepted discard closes");
    assertEquals(allow.calls, [DISCARD_CONFIRM_MSG]);
  } finally {
    allow.restore();
  }
  const never = stubConfirm(() => {
    throw new Error("clean close must not prompt");
  });
  try {
    requestClose({}, () => closed++);
    requestClose({ dirty: false }, () => closed++);
    assertStrictEquals(closed, 3);
  } finally {
    never.restore();
  }
});

Deno.test("idle shell closes from backdrop, Escape, and X", async () => {
  const { dom, dialog, closes } = await mountShell();
  await act(() => clickBackdrop(dom, dialog!));
  await act(() => pressEscape(dom, dialog!));
  await act(() => clickClose(dom));
  assertEquals(closes.length, 3, "the three dismissal paths must work idle");
});

Deno.test("locked shell ignores backdrop, Escape, and X (D30)", async () => {
  const { dom, dialog, closes } = await mountShell({ locked: true });
  await act(() => clickBackdrop(dom, dialog!));
  await act(() => pressEscape(dom, dialog!));
  await act(() => clickClose(dom));
  assertEquals(closes.length, 0, "a pending secret must survive dismissal");
  const x = dom.document.querySelector<HTMLButtonElement>(
    '[data-admin-form-dialog] button[aria-label="Fechar"]',
  );
  assert(x?.disabled, "the X button must be disabled while locked");
});

Deno.test("busy shell ignores backdrop, Escape, and X mid-write", async () => {
  const { dom, dialog, closes } = await mountShell({ busy: true });
  await act(() => clickBackdrop(dom, dialog!));
  await act(() => pressEscape(dom, dialog!));
  await act(() => clickClose(dom));
  assertEquals(closes.length, 0, "an in-flight write must not be discarded");
});

Deno.test("dirty shell asks before discarding on every path", async () => {
  const stub = stubConfirm(false);
  try {
    const { dom, dialog, closes } = await mountShell({ dirty: true });
    await act(() => clickBackdrop(dom, dialog!));
    await act(() => pressEscape(dom, dialog!));
    await act(() => clickClose(dom));
    assertEquals(closes.length, 0, "a denied discard keeps the dialog open");
    assertEquals(stub.calls.length, 3, "each path prompted once");
    assertEquals(stub.calls[0], DISCARD_CONFIRM_MSG);
  } finally {
    stub.restore();
  }
});

Deno.test("a click inside a dirty dialog does not prompt", async () => {
  const stub = stubConfirm(() => {
    throw new Error("inner click must not trigger discard");
  });
  try {
    const { dom, closes } = await mountShell({ dirty: true });
    // Dispatch from a child with no listeners of its own: the event
    // bubbles to the overlay, where the real handler only closes when
    // target === currentTarget (linkedom invokes bubbled listeners with
    // this = event.target, so a child without listeners short-circuits).
    const content = dom.document.querySelector("[data-admin-form-dialog] p");
    assert(content !== null, "the dialog body must render");
    await act(() => {
      content.dispatchEvent(
        newEvent(dom, "mousedown", { bubbles: true }),
      );
    });
    assertEquals(closes.length, 0);
  } finally {
    stub.restore();
  }
});
