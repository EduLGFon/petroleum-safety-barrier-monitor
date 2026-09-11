// Browser smoke test - drives headless Chromium over CDP to verify the app.
// This is why it exists: reproduces client-side behavior (hydration,
// settings, sorting, selection, modal, chart tooltip) that SSR checks cannot
// catch, and fails loudly on console errors or failed interaction checks.
// Run with: deno run -A scripts/browser-smoke.ts [url]
// Requires a chrome-headless-shell binary for this platform (see CHROME_BIN
// below); the profile is wiped per run so persisted state can't leak in.
const BASE = Deno.args[0] ?? "http://localhost:5173/";
const PROFILE = "/tmp/opencode/chrome-profile";
const CHROME_BIN =
  "/tmp/opencode/chrome/hs-arm64/chrome-headless-shell-linux-arm64/chrome-headless-shell";
// Fresh profile per run: navigations and state assertions must never inherit
// persisted theme/settings/selection from a previous run.
try {
  Deno.removeSync(PROFILE, { recursive: true });
} catch {
  /* not created yet */
}

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
      `--user-data-dir=${PROFILE}`,
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

// Minimal scenario runner: navigate, wait, drive interactions, print console
// errors + pass/fail checks. Runs in mock mode by default; HTTP mode keeps the
// loading/banner path client-side tested by hooks/dashboard/server_test.ts.
await cdp(async (_send: Send, _on: On, call: Call, events: CdpMsg[]) => {
  const errors: string[] = [];
  const results: Array<[string, boolean]> = [];
  const check = (name: string, ok: boolean) => results.push([name, ok]);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // enable runtime console capture via polling events after run
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Page.navigate", { url: BASE });
  await wait(9000);
  const evalJs = async (expr: string): Promise<unknown> => {
    const r = await call("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    }) as { result?: { value?: unknown } };
    return r.result?.value ?? null;
  };
  // Prod builds ship the full mock catalog, so the loading splash can linger
  // past 9s; real pointer input lands on whatever topmost layer is present,
  // so keep waiting (extra 20s max) until the screen is interactive.
  let splashLeft = false;
  for (let i = 0; i < 40 && !splashLeft; i++) {
    splashLeft = (await evalJs(
      `!document.querySelector('div[style*="z-index:9999"]')`,
    )) as boolean;
    if (!splashLeft) await wait(500);
  }
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
  console.log("CONSOLE_ERRORS:", JSON.stringify(errors.slice(0, 10), null, 1));

  // ── Static shell checks ────────────────────────────────────────────────
  const shell = await evalJs(`(() => {
    const chart = document.querySelector('svg[aria-label="Conformidade por categoria"]');
    const sortable = document.querySelector('th[aria-sort]');
    return {
      bodyLen: document.body.innerHTML.length,
      svgCount: document.querySelectorAll('svg').length,
      chartSvg: !!chart,
      chartBars: chart ? chart.querySelectorAll('rect').length : 0,
      loadingGone: !document.querySelector('div[style*="z-index:9999"]'),
      theme: document.documentElement.dataset.theme,
      hasAccent: !!getComputedStyle(document.documentElement).getPropertyValue('--accent'),
      buttons: document.querySelectorAll('button').length,
      rows: document.querySelectorAll('tbody tr[tabindex="0"]').length,
      checkboxes: document.querySelectorAll('tbody input[type="checkbox"]').length,
      sortableSort: sortable ? sortable.getAttribute('aria-sort') : null,
      kpiCards: document.querySelectorAll('.kpi-card, [class*="kpi"] [class*="kpi"]').length,
    };
  })()`);
  console.log("SHELL:", JSON.stringify(shell, null, 1));
  check("renders chart bars", (shell as { chartBars: number }).chartBars > 0);
  check(
    "loading splash resolved",
    (shell as { loadingGone: boolean }).loadingGone,
  );
  check(
    "accent tokens applied",
    !!shell && (shell as { hasAccent: boolean }).hasAccent,
  );
  check(
    "mock page has rows",
    (shell as { rows: number }).rows === 25,
  );
  check(
    "rows expose real checkboxes",
    (shell as { checkboxes: number }).checkboxes === 25,
  );
  check(
    "sortable header announces a valid sort state",
    ["ascending", "descending", "none"].includes(
      (shell as { sortableSort: string }).sortableSort,
    ),
  );

  // ── Selection: real pointer click on the row checkbox, expect it to tick --
  // Scrolled into view first: trusted clicks land at viewport coordinates, and
  // the first row's checkbox sits far below the fold on the mocked 6800 rows.
  // Poll-and-reclick in case a click races a late render, like a user would.
  let ticked = 0;
  for (let attempt = 0; attempt < 4 && !ticked; attempt++) {
    await evalJs(
      `document.querySelector('tbody label.trow-chk-label').scrollIntoView({ block: 'center' })`,
    );
    await wait(300);
    const chk = (await evalJs(`(() => {
      const l = document.querySelector('tbody label.trow-chk-label');
      const r = l.getBoundingClientRect();
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        hit: at ? at.tagName + '.' + (at.className || '') : null,
      };
    })()`)) as { x: number; y: number; hit: string };
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: chk.x,
      y: chk.y,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: chk.x,
      y: chk.y,
      button: "left",
      clickCount: 1,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: chk.x,
      y: chk.y,
      button: "left",
      clickCount: 1,
    });
    await wait(500);
    ticked = (await evalJs(
      `document.querySelectorAll('tbody input[type="checkbox"]:checked').length`,
    )) as number;
    if (ticked > 1) ticked = -1; // multiple rows selected means a misfire
  }
  const selDebug = await evalJs(
    `(() => {
      const i = document.querySelector('tbody input[type="checkbox"]');
      return { checked: i ? i.checked : null, label: i ? i.getAttribute('aria-label') : null };
    })()`,
  );
  console.log("SELECTED_TICKED:", ticked, JSON.stringify(selDebug));
  check("row checkbox ticks via UI", ticked === 1);

  // ── Sort: toggle the first sortable th and expect the state to flip ────
  const th = `document.querySelector('th[aria-sort]')`;
  const s0 = (await evalJs(`${th}.getAttribute('aria-sort')`)) as string;
  const opp = (v: string) => v === "ascending" ? "descending" : "ascending";
  await evalJs(`${th}.click()`);
  await wait(400);
  const s1 = (await evalJs(`${th}.getAttribute('aria-sort')`)) as string;
  await evalJs(`${th}.click()`);
  await wait(400);
  const s2 = (await evalJs(`${th}.getAttribute('aria-sort')`)) as string;
  console.log("SORT:", s0, "→", s1, "→", s2);
  check(`sort flips to ${opp(s0)}`, s1 === opp(s0));
  check("sort toggles back on second click", s2 === s0);

  // ── Tooltip: hover first chart row, expect portalled tooltip ----------
  await evalJs(`(() => {
    const rect = document.querySelector(
      'svg[aria-label="Conformidade por categoria"] rect[fill="transparent"]');
    const b = rect.getBoundingClientRect();
    rect.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, clientX: b.x + 60, clientY: b.y + 8,
    }));
  })()`);
  let tip: unknown = null;
  for (let attempt = 0; attempt < 3 && !tip; attempt++) {
    await wait(500);
    tip = await evalJs(
      `(() => {
        const t = document.querySelector('[role="tooltip"]');
        return t ? { w: t.getBoundingClientRect().width, text: t.textContent } : null;
      })()`,
    );
    if (!tip) {
      await evalJs(`(() => {
      const rect = document.querySelector(
        'svg[aria-label="Conformidade por categoria"] rect[fill="transparent"]');
      rect.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: 260, clientY: 140,
      }));
    })()`);
    }
  }
  console.log("TOOLTIP:", JSON.stringify(tip));
  check(
    "chart tooltip appears on hover",
    !!(tip as { text: string } | null)?.text?.includes("Conforme"),
  );
  await evalJs(`document.body.dispatchEvent(new Event('scroll'))`);
  await wait(200);

  // press: physical-like key events through CDP Input (listeners on document
  // receive these regardless of JS focus; synthetic KeyboardEvent stubs were
  // unreliable for the modal's native document keydown handler).
  const press = async (key: string) => {
    const vk = key === "Escape" ? 27 : 13;
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      text: "",
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: key,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      text: "",
    });
  };

  // ── Modal: click a barrier row cell, expect detail dialog + ESC close ----
  const modal = await evalJs(`(() => {
    const row = document.querySelector('tbody tr[tabindex="0"]');
    const tag = row.querySelector('.tnum')?.textContent?.trim() ?? '';
    row.children[2].click();
    return new Promise((resolve) => setTimeout(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      resolve({
        opened: !!d && d.inert === false,
        sameTag: !!(d?.getAttribute('aria-label')?.includes(tag)),
      });
    }, 500));
  })()`);
  console.log("MODAL:", JSON.stringify(modal));
  check(
    "barrier modal opens from a row click",
    (modal as { opened: boolean }).opened === true,
  );
  check(
    "modal names the clicked barrier tag",
    (modal as { sameTag: boolean }).sameTag === true,
  );
  await press("Escape");
  await wait(400);
  const modalClosed = await evalJs(`(() => {
    const d = document.querySelector('[role="dialog"][aria-modal="true"]');
    return d ? d.inert === true : true;
  })()`);
  check("ESC closes barrier modal", !!modalClosed);

  // ── Settings: open panel, switch theme, verify, ESC close -------------
  await evalJs(
    `document.querySelector('button[aria-label="Configurações"]').click()`,
  );
  await wait(500);
  const panel = await evalJs(`(() => {
    const start = document.documentElement.dataset.theme;
    const p = document.querySelector('aside[role="dialog"][aria-label="Configurações"]');
    const label = start === 'dark' ? 'Aurora Claro' : 'Aurora Escura';
    const btn = p && [...p.querySelectorAll('button')]
      .find((b) => b.textContent.includes(label));
    if (btn) btn.click();
    return new Promise((resolve) => setTimeout(() => resolve({
      visible: !!p && p.getAttribute('aria-hidden') !== 'true',
      start,
      after: btn ? null : 'no picker',
    }), 400));
  })()`);
  await wait(200);
  const theme = await evalJs(`document.documentElement.dataset.theme`);
  const pv = panel as { visible: boolean; start: string; after: string | null };
  console.log("SETTINGS_VISIBLE:", pv.visible, "THEME:", theme);
  check("settings panel opens", pv.visible);
  check(
    "theme switch applies dataset",
    theme !== pv.start && pv.after === null,
  );
  await press("Escape");
  await wait(400);
  const panelClosed = await evalJs(`(() => {
    const p = document.querySelector('aside[role="dialog"][aria-label="Configurações"]');
    const m = document.querySelector('[role="dialog"][aria-modal="true"]');
    return {
      panel: p ? p.getAttribute('aria-hidden') === 'true' : false,
      modalStillClosed: !m || m.inert === true,
    };
  })()`);
  console.log("AFTER_SETTINGS_ESC:", JSON.stringify(panelClosed));
  check(
    "ESC closes settings panel",
    (panelClosed as { panel: boolean }).panel === true,
  );
  check(
    "modal stays closed through settings ESC",
    (panelClosed as { modalStillClosed: boolean }).modalStillClosed === true,
  );

  console.log("RESULTS:", JSON.stringify(results, null, 1));
  const failed = results.filter(([, ok]) => !ok).length;
  if (failed > 0 || errors.length > 0) Deno.exit(1);
});
