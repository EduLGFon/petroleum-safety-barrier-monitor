// Unit tests for AdminToast - polite announcement, manual close, auto-dismiss.
// This is why it exists: the success toast must announce accessibly and must
// always leave, either from its close button or from the duration timer.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { setupDom, waitFor } from "../../../scripts/test-dom.ts";

import { AdminToast } from "./AdminToast.tsx";

import { createElement as h } from "preact";

import { act } from "preact/test-utils";

import { render } from "preact";

async function mountToast(
  message: string,
  onClose: () => void,
  durationMs?: number,
) {
  const dom = setupDom();
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  await act(() =>
    void render(
      h(AdminToast, { message, onClose, durationMs }),
      container,
    )
  );
  return { dom, container };
}

function unmount(container: HTMLElement) {
  render(null, container);
  container.remove();
}

Deno.test("AdminToast exposes a polite status with the message", async () => {
  const { dom, container } = await mountToast("Usuário criado.", () => {});
  try {
    const toast = dom.document.querySelector(".admin-toast");
    assertStrictEquals(toast?.getAttribute("role"), "status");
    assertStrictEquals(toast?.getAttribute("aria-live"), "polite");
    assertStrictEquals(toast?.getAttribute("aria-atomic"), "true");
    assertStrictEquals(
      toast?.querySelector(".admin-toast-message")?.textContent,
      "Usuário criado.",
    );
  } finally {
    unmount(container);
  }
});

Deno.test("AdminToast closes from its close button", async () => {
  let closes = 0;
  const { dom, container } = await mountToast("Feito.", () => closes++);
  try {
    const button = dom.document.querySelector<HTMLButtonElement>(
      ".admin-toast-close",
    );
    assertEquals(button?.getAttribute("aria-label"), "Fechar aviso");
    await act(() => button?.click());
    assertStrictEquals(closes, 1);
  } finally {
    unmount(container);
  }
});

Deno.test("AdminToast auto-dismisses after durationMs", async () => {
  let closes = 0;
  const { container } = await mountToast("Feito.", () => closes++, 20);
  try {
    await waitFor(() => closes === 1, 1000);
    assertStrictEquals(closes, 1);
  } finally {
    unmount(container);
  }
});

Deno.test("AdminToast cancels its timer on unmount", async () => {
  let closes = 0;
  const { container } = await mountToast("Feito.", () => closes++, 30);
  unmount(container);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assertStrictEquals(closes, 0);
});
