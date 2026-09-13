// Screenshot helper - captures a page or element clip via CDP.
// This is why it exists: visual inspection without a local browser UI.
// Run with: deno run -A scripts/browser-shot.ts [url] [out.png] [selector-text?]
const BASE = Deno.args[0] ?? "http://localhost:5173/";
const OUT = Deno.args[1] ?? "/tmp/opencode/shot.png";
const MARK = Deno.args[2];
const CHROME_BIN =
  "/tmp/opencode/chrome/chrome-headless-shell-linux64/chrome-headless-shell";

const proc = new Deno.Command(CHROME_BIN, {
  args: [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--window-size=1440,2400",
    "--remote-debugging-port=9336",
    "--user-data-dir=/tmp/opencode/chrome-shot",
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
      tabs = await (await fetch("http://127.0.0.1:9336/json/list")).text();
      break;
    } catch { /* retry */ }
  }
  const wsUrl = (JSON.parse(tabs) as Array<{ webSocketDebuggerUrl: string }>)[0]
    .webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let seq = 0;
  const pending = new Map<number, (m: unknown) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number };
    if (m.id !== undefined && pending.has(m.id)) pending.get(m.id)!(m);
  };
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    const r = await new Promise<
      { result?: Record<string, unknown>; error?: unknown }
    >((resolve) => pending.set(id, resolve as (m: unknown) => void));
    if (r.error) throw new Error(String(JSON.stringify(r.error)));
    return r.result ?? {};
  };
  await call("Page.enable");
  await call("Page.navigate", { url: BASE });
  await new Promise((r) => setTimeout(r, 10000));
  if (Deno.env.get("PRINT_MEDIA") === "1") {
    // Build the report first (same flow as the PDF button, print stubbed),
    // then emulate print media so the shot shows what would print.
    await call("Runtime.evaluate", {
      expression:
        `(() => { window.print = () => {}; [...document.querySelectorAll('tbody tr')].slice(0,3).forEach(r => r.querySelector('td:first-child > div')?.click()); })()`,
    });
    await new Promise((r) => setTimeout(r, 600));
    await call("Runtime.evaluate", {
      expression:
        `(() => { [...document.querySelectorAll('button')].find(b=>b.textContent.includes('PDF'))?.click(); })()`,
    });
    await new Promise((r) => setTimeout(r, 600));
    await call("Emulation.setEmulatedMedia", { media: "print" });
    await new Promise((r) => setTimeout(r, 400));
  }
  let clip: Record<string, number> | undefined;
  if (MARK) {
    const r = await call("Runtime.evaluate", {
      expression:
        `(() => { const el = [...document.querySelectorAll('*')].find(e => (e.textContent||'').trim()===${
          JSON.stringify(MARK)
        })?.parentElement; const b = el?.getBoundingClientRect(); return b ? {x:b.x, y:b.y, width:b.width, height:Math.min(b.height, 900)} : null; })()`,
      returnByValue: true,
    }) as { result: { value: Record<string, number> | null } };
    if (r.result.value) {
      const s = await call("Page.getLayoutMetrics") as {
        cssVisualViewport?: { scale?: number };
      };
      const scale = s.cssVisualViewport?.scale ?? 1;
      clip = { ...r.result.value, scale };
    }
  }
  const shot = await call("Page.captureScreenshot", {
    format: "png",
    ...(clip ? { clip } : { captureBeyondViewport: true }),
  }) as { data: string };
  const bin = Uint8Array.from(atob(shot.data), (c) => c.charCodeAt(0));
  await Deno.writeFile(OUT, bin);
  console.log("saved", OUT, bin.length, "bytes");
  ws.close();
} finally {
  try {
    proc.kill();
  } catch { /* dead */ }
}
