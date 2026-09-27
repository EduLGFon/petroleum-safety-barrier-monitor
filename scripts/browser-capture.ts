// Browser capture helper - screenshot or print-to-PDF via CDP in one script.
// This is why it exists: browser-shot.ts and browser-pdf.ts shared ~80% of
// the CDP boilerplate (launch, connect, navigate, select rows, capture), so
// one entry point with --mode shot|pdf replaces both. Run with:
//   deno run -A scripts/browser-capture.ts [url] [out] [--mode shot|pdf]
//     [--mark TEXT]   (shot only: clip to the element containing TEXT)
// PRINT_MEDIA=1 (shot only) emulates print media after building the report,
// showing what would print.
const BASE = Deno.args[0] ?? "http://localhost:5173/";
const OUT = Deno.args[1] ?? "/tmp/opencode/shot.png";
const MODE = Deno.args.includes("--mode=pdf") ||
    Deno.args.includes("--mode pdf")
  ? "pdf"
  : (Deno.args[Deno.args.indexOf("--mode") + 1] === "pdf" ? "pdf" : "shot");
const MARK_IDX = Deno.args.indexOf("--mark");
const MARK = MARK_IDX >= 0 ? Deno.args[MARK_IDX + 1] : undefined;
const CHROME_BIN = Deno.env.get("CHROME_BIN") ??
  "/tmp/opencode/chrome/chrome-headless-shell-linux64/chrome-headless-shell";

type RpcResult = Record<string, unknown>;

async function withCdp(
  fn: (
    call: (m: string, p?: Record<string, unknown>) => Promise<RpcResult>,
  ) => Promise<void>,
): Promise<void> {
  const proc = new Deno.Command(CHROME_BIN, {
    args: [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--window-size=1440,2400",
      "--remote-debugging-port=9336",
      "--user-data-dir=/tmp/opencode/chrome-capture",
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
    const wsUrl =
      (JSON.parse(tabs) as Array<{ webSocketDebuggerUrl: string }>)[0]
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
    const call = async (
      method: string,
      params: Record<string, unknown> = {},
    ) => {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      const r = await new Promise<
        { result?: RpcResult; error?: unknown }
      >((resolve) => pending.set(id, resolve as (m: unknown) => void));
      if (r.error) throw new Error(String(JSON.stringify(r.error)));
      return r.result ?? {};
    };
    await fn(call);
    ws.close();
  } finally {
    try {
      proc.kill();
    } catch { /* dead */ }
  }
}

// selectReportRows builds the print report the same way the PDF button does:
// stub print (avoid dialog), tick 3 rows, click the PDF report button.
async function selectReportRows(
  call: (m: string, p?: Record<string, unknown>) => Promise<RpcResult>,
): Promise<void> {
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
}

await withCdp(async (call) => {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Page.navigate", { url: BASE });
  await new Promise((r) => setTimeout(r, 10000));
  if (MODE === "pdf") {
    await selectReportRows(call);
    const pdf = await call("Page.printToPDF", {
      landscape: true,
      format: "A4",
      printBackground: true,
    }) as { data: string };
    const bin = Uint8Array.from(atob(pdf.data), (c) => c.charCodeAt(0));
    await Deno.writeFile(OUT, bin);
    console.log("saved", OUT, bin.length, "bytes");
    return;
  }
  if (Deno.env.get("PRINT_MEDIA") === "1") {
    await selectReportRows(call);
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
      clip = { ...r.result.value, scale: s.cssVisualViewport?.scale ?? 1 };
    }
  }
  const shot = await call("Page.captureScreenshot", {
    format: "png",
    ...(clip ? { clip } : { captureBeyondViewport: true }),
  }) as { data: string };
  const bin = Uint8Array.from(atob(shot.data), (c) => c.charCodeAt(0));
  await Deno.writeFile(OUT, bin);
  console.log("saved", OUT, bin.length, "bytes");
});
