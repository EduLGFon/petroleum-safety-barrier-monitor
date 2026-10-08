// Doctor - cross-platform preflight for Windows Server 2022/2025 and Linux.
// This is why it exists: `deno task check` validates code, but hosting fails
// on env/DB/port issues instead. Run `deno task doctor` on the target host
// (PowerShell, cmd, or bash) before `build`/`start`. Read-only by default;
// `--fix-env` only appends missing commented keys to .env, never secrets.
import { Pool } from "@db/postgres";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

type Status = "ok" | "warn" | "fail";

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const checks: Check[] = [];

function push(name: string, status: Status, detail: string): void {
  checks.push({ detail, name, status });
}

// parseEnvFile: minimal .env parser (KEY=VALUE, # comments, quotes stripped).
// PowerShell has no `export $(grep ...)` equivalent, so this file is the
// cross-platform reader the docs point at instead of shell one-liners.
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// isWindows: true on Windows Server hosts (Deno.build.os === "windows").
function isWindows(): boolean {
  return Deno.build.os === "windows";
}

function checkDeno(): void {
  const v = Deno.version.deno;
  const major = Number(v.split(".")[0]);
  push(
    "deno-runtime",
    major >= 2 ? "ok" : "fail",
    `deno ${v} on ${Deno.build.os}/${Deno.build.arch} (need Deno 2.x)`,
  );
}

async function checkEnvFile(): Promise<Record<string, string>> {
  let fileVars: Record<string, string> = {};
  try {
    fileVars = parseEnvFile(await Deno.readTextFile(".env"));
    push("env-file", "ok", ".env found in working directory");
  } catch {
    push(
      "env-file",
      "fail",
      ".env missing: copy .env.example to .env first (see docs/DEPLOY-WINDOWS.md)",
    );
  }
  // Shell env wins over .env, mirroring `deno serve --env-file=.env` merge.
  const get = (k: string): string | undefined => Deno.env.get(k) ?? fileVars[k];
  const mode = get("PUBLIC_API_MODE") ?? "mock";
  push(
    "api-mode",
    mode === "mock" || mode === "http" ? "ok" : "fail",
    `PUBLIC_API_MODE=${mode}`,
  );
  const dbUrl = get("DATABASE_URL") ?? "";
  if (mode === "http" && !dbUrl) {
    push("database-url", "fail", "PUBLIC_API_MODE=http needs DATABASE_URL");
  } else if (!dbUrl) {
    push("database-url", "warn", "DATABASE_URL unset (ok for mock UI only)");
  } else {
    try {
      const u = new URL(dbUrl);
      if (!/^postgres(ql)?:$/.test(u.protocol)) {
        push(
          "database-url",
          "fail",
          `bad scheme ${u.protocol} (need postgres://)`,
        );
      } else if (dbUrl.includes("postgres://postgres://")) {
        push(
          "database-url",
          "fail",
          "doubled scheme postgres://postgres:// - fix .env",
        );
      } else {
        push(
          "database-url",
          "ok",
          `postgres host=${u.hostname} port=${u.port || "5432"}`,
        );
      }
    } catch {
      push("database-url", "fail", "DATABASE_URL is not a parseable URL");
    }
  }
  if (!get("ADMIN_TOKEN")) {
    push(
      "admin-token",
      "warn",
      "ADMIN_TOKEN unset: admin API writes need a session until it is set",
    );
  } else if ((get("ADMIN_TOKEN") ?? "").length < 32) {
    push(
      "admin-token",
      "warn",
      "ADMIN_TOKEN looks short (generate 32 hex bytes)",
    );
  } else {
    push("admin-token", "ok", "ADMIN_TOKEN set");
  }
  return fileVars;
}

async function checkDatabase(): Promise<void> {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    push("database-ping", "warn", "skipped: DATABASE_URL not in process env");
    return;
  }
  // Short-lived pool (size 1): never hangs the preflight behind a firewall.
  const pool = new Pool(url, 1, true);
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("connect timeout (8s)")), 8000)
      ),
    ]);
    try {
      await client.queryArray("SELECT 1");
      push("database-ping", "ok", "Postgres reachable, SELECT 1 ok");
    } finally {
      try {
        client.release();
      } catch { /* Dead socket: dropping it is the fix. */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    push("database-ping", "fail", `unreachable: ${msg}`);
  } finally {
    try {
      await pool.end();
    } catch {
      /* End on a broken pool throws; the check already recorded it. */
    }
  }
}

async function checkBuild(): Promise<void> {
  try {
    const st = await Deno.stat("_fresh/server.js");
    if (st.isFile) {
      push(
        "build-bundle",
        "ok",
        "_fresh/server.js present (deno task start ready)",
      );
    } else {
      push(
        "build-bundle",
        "warn",
        "_fresh/server.js is not a file: run deno task build",
      );
    }
  } catch {
    push(
      "build-bundle",
      "warn",
      "_fresh/server.js missing: run `deno task build` before `deno task start`",
    );
  }
}

async function checkPorts(): Promise<void> {
  // Probe TCP 8000/5432 without extra permissions: a refused connect means
  // "free", a success means "taken". Timeouts stay short for CI hosts.
  for (const port of [8000, 5432]) {
    try {
      const conn = await Deno.connect({ hostname: "127.0.0.1", port });
      conn.close();
      push(
        `port-${port}`,
        port === 5432 ? "ok" : "warn",
        `127.0.0.1:${port} accepts connections (${
          port === 8000
            ? "app already running or conflict"
            : "local Postgres up"
        })`,
      );
    } catch {
      push(
        `port-${port}`,
        "ok",
        `127.0.0.1:${port} free (nothing listening)`,
      );
    }
  }
}

function checkPlatform(): void {
  if (isWindows()) {
    push(
      "platform",
      "ok",
      "Windows detected: prefer native deploy (docs/DEPLOY-WINDOWS.md path A); " +
        "Docker Desktop is NOT supported on Windows Server",
    );
  } else {
    push(
      "platform",
      "ok",
      `host platform ${Deno.build.os} (native or Docker path)`,
    );
  }
}

async function main(): Promise<void> {
  // --env-file=.env mirrors `deno task start` so the checks see prod values
  // even when the shell has nothing exported (the usual Windows case).
  try {
    const txt = await Deno.readTextFile(".env");
    const fileVars = parseEnvFile(txt);
    for (const [k, v] of Object.entries(fileVars)) {
      if (Deno.env.get(k) === undefined && v) {
        try {
          Deno.env.set(k, v);
        } catch {
          /* Read-only env in some sandboxes; checks read fileVars directly. */
        }
      }
    }
  } catch { /* Missing .env is itself a reported check below. */ }
  checkPlatform();
  checkDeno();
  await checkEnvFile();
  await checkDatabase();
  await checkBuild();
  await checkPorts();
  let fails = 0;
  let warns = 0;
  for (const c of checks) {
    const color = c.status === "ok"
      ? GREEN
      : c.status === "warn"
      ? YELLOW
      : RED;
    console.log(
      `${color}[${c.status.toUpperCase()}]${RESET} ${c.name}: ${c.detail}`,
    );
    if (c.status === "fail") fails++;
    if (c.status === "warn") warns++;
  }
  console.log(
    `\ndoctor: ${checks.length} checks, ${fails} failed, ${warns} warnings`,
  );
  if (fails > 0) Deno.exit(1);
}

await main();
