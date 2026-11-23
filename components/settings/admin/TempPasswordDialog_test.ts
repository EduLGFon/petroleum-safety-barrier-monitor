// Regression tests for the one-time reset password dialog (audit U7 F1).
// This is why they exist: DECISIONS.md#D30 allows the plaintext to exist
// once, on this screen; a backdrop click, Escape, or the X used to wipe
// that only copy without any acknowledgement. The dialog must stay open
// until "Já anotei" is clicked, and the clipboard copy must be cleared on
// that acknowledgement when (and only when) our Copy button was used.
import { TempPasswordDialog } from "./TempPasswordDialog.tsx";

import type { TestDom } from "../../../scripts/test-dom.ts";

import { assert, assertEquals } from "jsr:@std/assert@^1";

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

function stubClipboard() {
  const writes: string[] = [];
  // Must run AFTER bootDom(): setupDom replaces the global navigator, so
  // the stub lives on the current linkedom navigator instance.
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const prev = Object.getOwnPropertyDescriptor(nav, "clipboard");
  Object.defineProperty(nav, "clipboard", {
    configurable: true,
    writable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text);
        return Promise.resolve();
      },
    },
  });
  return {
    writes,
    restore() {
      if (prev) Object.defineProperty(nav, "clipboard", prev);
      else delete nav.clipboard;
    },
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function mountTempPassword() {
  const dom = bootDom();
  let closes = 0;
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  await act(() =>
    void render(
      h(TempPasswordDialog, {
        open: true,
        email: "maria@plataforma.br",
        senha: "TEMP-pass-42",
        aviso: { sent: true },
        onClose: () => closes++,
      }),
      container,
    )
  );
  await flush();
  const dialog = dom.document.querySelector("[data-admin-form-dialog]");
  assert(dialog !== null, "the reveal dialog must render");
  function buttonByText(label: string) {
    return [...dom.document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => (b.textContent ?? "").trim() === label);
  }
  return {
    dom,
    dialog,
    closeCount: () => closes,
    buttonByText,
    unmount: () => render(null, container),
  };
}

Deno.test("the reveal shows the one-time password once", async () => {
  const m = await mountTempPassword();
  try {
    const code = m.dom.document.querySelector("code");
    assertEquals(code?.textContent, "TEMP-pass-42");
    assert(
      (m.dialog?.textContent ?? "").includes("não é guardada"),
      "the handover warning must be visible",
    );
  } finally {
    m.unmount();
  }
});

Deno.test("backdrop, Escape, and X never dismiss a pending secret (D30)", async () => {
  const m = await mountTempPassword();
  try {
    await act(() => {
      (m.dialog!.parentNode as Element).dispatchEvent(
        newEvent(m.dom, "mousedown", { bubbles: true }),
      );
    });
    assertEquals(m.closeCount(), 0, "backdrop must not clear the secret");
    const kev = newEvent(m.dom, "keydown", { bubbles: true });
    Object.defineProperty(kev, "key", { value: "Escape" });
    await act(() => {
      m.dialog!.dispatchEvent(kev);
    });
    assertEquals(m.closeCount(), 0, "Escape must not clear the secret");
    const x = m.dom.document.querySelector<HTMLButtonElement>(
      '[data-admin-form-dialog] button[aria-label="Fechar"]',
    );
    assert(x !== null);
    assert(x!.disabled, "the X must be disabled while the secret is pending");
    await act(() => x!.click());
    assertEquals(m.closeCount(), 0, "X must not clear the secret");
    // The password is still on screen after every attempted dismissal.
    assertEquals(
      m.dom.document.querySelector("code")?.textContent,
      "TEMP-pass-42",
    );
  } finally {
    m.unmount();
  }
});

Deno.test("Já anotei is the only close path", async () => {
  const m = await mountTempPassword();
  try {
    const ack = m.buttonByText("Já anotei");
    assert(ack !== null, "the acknowledgement button must exist");
    await act(async () => {
      ack!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assertEquals(m.closeCount(), 1, "the ack closes exactly once");
  } finally {
    m.unmount();
  }
});

Deno.test("copy then ack clears the clipboard; ack without copy leaves it alone", async () => {
  // Copy path: our button wrote the password, so the ack wipes it.
  {
    const m = await mountTempPassword();
    const stub = stubClipboard();
    try {
      const copy = m.buttonByText("Copiar");
      assert(copy !== null);
      await act(() => copy!.click());
      await flush();
      assertEquals(stub.writes, ["TEMP-pass-42"]);
      const ack = m.buttonByText("Já anotei");
      await act(async () => {
        ack!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assertEquals(
        stub.writes,
        ["TEMP-pass-42", ""],
        "the ack must blank the clipboard copy",
      );
      assertEquals(m.closeCount(), 1);
    } finally {
      m.unmount();
      stub.restore();
    }
  }
  // No-copy path: the admin never used our button, so the system
  // clipboard (possibly holding unrelated content) must not be touched.
  {
    const m = await mountTempPassword();
    const stub = stubClipboard();
    try {
      const ack = m.buttonByText("Já anotei");
      await act(async () => {
        ack!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assertEquals(stub.writes, []);
      assertEquals(m.closeCount(), 1);
    } finally {
      m.unmount();
      stub.restore();
    }
  }
});

function stubDeferredClipboard() {
  let resolveWrite!: () => void;
  const writes: string[] = [];
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const prev = Object.getOwnPropertyDescriptor(nav, "clipboard");
  Object.defineProperty(nav, "clipboard", {
    configurable: true,
    writable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text);
        return new Promise<void>((resolve) => {
          resolveWrite = resolve;
        });
      },
    },
  });
  return {
    writes,
    resolve() {
      resolveWrite();
    },
    restore() {
      if (prev) Object.defineProperty(nav, "clipboard", prev);
      else delete nav.clipboard;
    },
  };
}

Deno.test("ack before copy resolves still clears the clipboard (deferred)", async () => {
  const m = await mountTempPassword();
  const stub = stubDeferredClipboard();
  try {
    const copy = m.buttonByText("Copiar");
    assert(copy !== null);
    await act(() => copy!.click());
    // The write is still pending; ack now must wait for it.
    const ack = m.buttonByText("Já anotei");
    assert(ack !== null);
    await act(async () => {
      ack!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      stub.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    assertEquals(
      stub.writes,
      ["TEMP-pass-42", ""],
      "the ack must wait for the pending copy, then blank the clipboard",
    );
    assertEquals(m.closeCount(), 1);
  } finally {
    m.unmount();
    stub.restore();
  }
});
