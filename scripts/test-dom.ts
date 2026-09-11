// test-dom.ts - linkedom DOM + localStorage shim + hook mount helpers for Deno tests.
// Why: Preact hooks need a real DOM lifecycle; linkedom keeps `deno check` free
// of node ambient types (happy-dom drags @types/node into the program). JSX is
// unusable here (Fresh precompile emits template vnodes that only mount under
// the island runtime), so every fixture renders through createElement (h()).
import { parseHTML } from "linkedom";
import { createElement as h } from "preact";
import { render } from "preact";
import { act } from "preact/test-utils";

export interface TestDom {
  window: Window & { document: Document };
  document: Document;
  storage: Storage;
}

// In-memory Storage matching the Web Storage contract (key()/length included).
export function memoryStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  } as Storage;
}

// Installs linkedom globals (window/document/navigator) plus a fresh
// localStorage. Deno's own global localStorage shadows plain assignment, so it
// is replaced via defineProperty. Idempotent per isolate.
export function setupDom(): TestDom {
  const dom = parseHTML("<!doctype html><html><body></body></html>");
  const win = dom.window as unknown as Window & { document: Document };
  const storage = memoryStorage();
  const g = globalThis as unknown as Record<string, unknown>;
  const pairs: Array<[PropertyKey, unknown]> = [
    ["window", win],
    ["document", win.document],
    ["navigator", win.navigator],
  ];
  for (const [k, v] of pairs) {
    Object.defineProperty(g, k, {
      value: v,
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperty(g, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return { window: win, document: win.document, storage };
}

export interface HookTest<A extends unknown[], O> {
  get(): O;
  rerender(...args: A): Promise<void>;
  unmount(): void;
}

export interface MountOptions<A extends unknown[]> {
  args?: A;
  storage?: Storage;
}

// Mounts a bare-component wrapper around the given hook and returns handles.
// The probe keeps reading hook(...args) on every render so a re-render with
// new args exercises the same lifecycle a real component would. act() awaits
// the microtask-scheduled effects, so callers must `await` the mount.
export async function renderHook<A extends unknown[], O>(
  hook: (...args: A) => O,
  options: MountOptions<A> = {},
): Promise<HookTest<A, O>> {
  const dom = setupDom();
  if (options.storage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: options.storage,
      configurable: true,
      writable: true,
    });
  }
  const container = dom.document.createElement("div");
  const st: { args: A; value: O | undefined; mounted: boolean } = {
    args: (options.args ?? []) as A,
    value: undefined,
    mounted: true,
  };
  function Probe(this: void) {
    if (st.mounted) st.value = hook(...st.args);
    return h("span", null);
  }
  await act(() => void render(h(Probe, {}), container));
  return {
    get(): O {
      if (st.value === undefined) throw new Error("hook not mounted yet");
      return st.value;
    },
    async rerender(...next: A) {
      st.args = next;
      await act(() => void render(h(Probe, {}), container));
    },
    unmount() {
      st.mounted = false;
      render(null, container);
    },
  };
}

// Polls until fn() is true (server fetches, loading flips), or throws.
export async function waitFor(fn: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor: condition not reached in time");
}
