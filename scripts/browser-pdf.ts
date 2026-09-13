// Print-to-PDF check - selects rows, triggers the report, prints to PDF.
// This is why it exists: validates the whole print pipeline end to end.
// Run with: deno run -A scripts/browser-pdf.ts [url] [out.pdf]
const BASE = Deno.args[0] ?? "http://localhost:5173/";
const OUT = Deno.args[1] ?? "/tmp/opencode/report.pdf";
const CHROME_BIN =
  "/tmp/opencode/chrome/chrome-headless-shell-linux64/chrome-headless-shell";

const proc = new Deno.Command(CHROME_BIN, {
  args: [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=9337",
    "--user-data-dir=/tmp/opencode/chrome-pdf",
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
      tabs = await (await fetch("http://127.0.0.1:9337/json/list")).text();
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
  await call("Runtime.enable");
  await call("Page.navigate", { url: BASE });
  await new Promise((r) => setTimeout(r, 10000));
  // stub print (avoid dialog), select 3 rows, build the report via the app button
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
  const pdf = await call("Page.printToPDF", {
    landscape: true,
    format: "A4",
    printBackground: true,
  }) as { data: string };
  const bin = Uint8Array.from(atob(pdf.data), (c) => c.charCodeAt(0));
  await Deno.writeFile(OUT, bin);
  console.log("saved", OUT, bin.length, "bytes");
  ws.close();
} finally {
  try {
    proc.kill();
  } catch { /* dead */ }
}
