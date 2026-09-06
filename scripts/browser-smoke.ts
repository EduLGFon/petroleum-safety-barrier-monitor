// Browser smoke test - drives headless Chromium over CDP to verify the app.
// This is why it exists: reproduces client-side behavior (hydration,
// settings, chart, exports) that SSR checks cannot catch.
// Run with: deno run -A scripts/browser-smoke.ts [url]
// Requires chrome-headless-shell binary (see CHROME_BIN below).
const BASE = Deno.args[0] ?? "http://localhost:5173/";
const CHROME_BIN =
  "/tmp/opencode/chrome/chrome-headless-shell-linux64/chrome-headless-shell";

interface CdpMsg {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: unknown;
}

type Send = (m: CdpMsg) => number;
type On = (id: number) => Promise<CdpMsg>;
type Call = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
type Scenario = (
  send: Send,
  on: On,
  call: Call,
  events: CdpMsg[],
) => Promise<void>;

async function cdp(scenario: Scenario) {
  const proc = new Deno.Command(CHROME_BIN, {
    args: [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=9333",
      "--user-data-dir=/tmp/opencode/chrome-profile",
      "about:blank",
    ],
    stdout: "null",
    stderr: "null",
  }).spawn();
  try {
    let tabs = "";
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        tabs = await (await fetch("http://127.0.0.1:9333/json/list")).text();
        break;
      } catch { /* retry */ }
    }
    const wsUrl =
      (JSON.parse(tabs) as Array<{ webSocketDebuggerUrl: string }>)[0]
        .webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    let seq = 0;
    const pending = new Map<number, (m: CdpMsg) => void>();
    const events: CdpMsg[] = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as CdpMsg;
      if (m.id !== undefined && pending.has(m.id)) pending.get(m.id)!(m);
      else events.push(m);
    };
    const send = (m: CdpMsg): number => {
      const id = ++seq;
      ws.send(JSON.stringify({ ...m, id }));
      return id;
    };
    const on = (id: number) =>
      new Promise<CdpMsg>((resolve) => pending.set(id, resolve));
    const call = async (
      method: string,
      params: Record<string, unknown> = {},
    ) => {
      const r = await on(send({ method, params }));
      if (r.error) throw new Error(`${method}: ${JSON.stringify(r.error)}`);
      return r.result ?? {};
    };
    await scenario(send, on, call, events);
    ws.close();
  } finally {
    try {
      proc.kill();
    } catch { /* already dead */ }
  }
}

// Minimal scenario runner: navigate, wait, dump console errors + checks.
await cdp(async (_send: Send, _on: On, call: Call, events: CdpMsg[]) => {
  const errors: string[] = [];
  // enable runtime console capture via polling events after run
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Page.navigate", { url: BASE });
  await new Promise((r) => setTimeout(r, 9000));
  for (const e of events) {
    if (e.method === "Runtime.consoleAPICalled") {
      const p = e.params as {
        type: string;
        args: Array<{ value?: unknown; description?: string }>;
      };
      if (p.type === "error") {
        errors.push(
          p.args.map((a) => String(a.value ?? a.description ?? "?")).join(" "),
        );
      }
    }
    if (e.method === "Runtime.exceptionThrown") {
      errors.push(
        "EXCEPTION: " +
          JSON.stringify((e.params as Record<string, unknown>).exceptionDetails)
            .slice(0, 500),
      );
    }
  }
  const evalJs = async (expr: string): Promise<unknown> => {
    const r = await call("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
    }) as { result: { value: unknown } };
    return r.result.value;
  };
  console.log("CONSOLE_ERRORS:", JSON.stringify(errors.slice(0, 10), null, 1));
  const checks = await evalJs(`(() => {
    const out = {};
    out.bodyLen = document.body.innerHTML.length;
    out.svgCount = document.querySelectorAll('svg').length;
    out.chartSvg = !!document.querySelector('svg[aria-label="Conformidade por categoria"]');
    out.chartBars = document.querySelectorAll('svg[aria-label="Conformidade por categoria"] rect').length;
    out.loadingVisible = !!document.querySelector('div[style*="z-index:9999"]');
    out.theme = document.documentElement.dataset.theme;
    out.hasAccent = !!getComputedStyle(document.documentElement).getPropertyValue('--accent');
    out.buttons = document.querySelectorAll('button').length;
    return out;
  })()`);
  console.log("CHECKS:", JSON.stringify(checks, null, 1));
});
