// Route edge validation tests - no DB required.
// Covers query param parsing, error envelope shape, throttle decisions
// shared by all 18 API handlers, and the route-level authorization
// boundaries (anonymous, dead credential, authenticated non-admin).
import { handler as barrierStatusHandler } from "./barriers/[id]/status.ts";

import { handler as alertPreviewHandler } from "./alert-rules/preview.ts";

import { badRequest, unauthorized } from "../../lib/server/errors.ts";

import { SESSION_COOKIE } from "../../lib/server/auth/session.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { parseFilterQuery, parseIntParam } from "./_params.ts";

import { createThrottle } from "../../lib/server/throttle.ts";

import { handler as userPatchHandler } from "./users/[id].ts";

import { duplicateMessage as accessGroupDuplicateMessage } from "./access-groups/[id].ts";

import { handler as syncRunsRoute } from "./sync-runs.ts";

Deno.test("parseIntParam rejects non-integers", () => {
  assertStrictEquals(parseIntParam("abc"), undefined);
  assertStrictEquals(parseIntParam("1.5"), undefined);
  assertStrictEquals(parseIntParam("42"), 42);
  assertStrictEquals(parseIntParam(null), undefined);
});

Deno.test("parseFilterQuery caps query length", () => {
  const q = parseFilterQuery(new URLSearchParams({ query: "x".repeat(500) }));
  assert((q.query?.length ?? 0) <= 200);
});

Deno.test("error envelope carries code and requestId", async () => {
  const res = badRequest("Invalid JSON body", "req-1");
  assertStrictEquals(res.status, 400);
  const body = await res.json() as { error: string; requestId: string };
  assertStrictEquals(body.requestId, "req-1");
  assertStrictEquals(res.headers.get("x-request-id"), "req-1");
});

Deno.test("unauthorized returns 401 for bad credentials", async () => {
  const res = unauthorized("invalid credentials", "req-2");
  assertStrictEquals(res.status, 401);
  const body = await res.json() as { error: string };
  assertStrictEquals(body.error, "invalid credentials");
});

Deno.test("throttle blocks over limit within window", () => {
  let now = 0;
  const t = createThrottle({ limit: 2, windowMs: 1000, now: () => now });
  assert(t.check("k").allowed);
  assert(t.check("k").allowed);
  assert(!t.check("k").allowed);
  now = 2000;
  assert(t.check("k").allowed);
});

// --- Route-level authorization boundaries --------------------------------
// The guards are only as good as the routes that call them, so these tests
// drive an actual admin-only handler (PATCH /api/users/:id) and assert the
// status each caller class gets: anonymous callers see the 404 camouflage,
// a dead credential is a 401, and an authenticated non-admin is a 403.

type RouteHandler = (ctx: unknown) => Response | Promise<Response>;

function adminWriteHandler(): RouteHandler {
  const handler = userPatchHandler.PATCH as unknown as RouteHandler | undefined;
  if (!handler) throw new Error("PATCH /api/users/:id handler is missing");
  return handler;
}

function statusHandler(): RouteHandler {
  const handler = barrierStatusHandler.PATCH as unknown as
    | RouteHandler
    | undefined;
  if (!handler) {
    throw new Error("PATCH /api/barriers/:id/status handler is missing");
  }
  return handler;
}

function previewHandler(): RouteHandler {
  const handler = alertPreviewHandler.GET as unknown as
    | RouteHandler
    | undefined;
  if (!handler) {
    throw new Error("GET /api/alert-rules/preview handler is missing");
  }
  return handler;
}

function syncRunsHandler(): RouteHandler {
  const handler = syncRunsRoute.GET as unknown as RouteHandler | undefined;
  if (!handler) throw new Error("GET /api/sync-runs handler is missing");
  return handler;
}

// routeCtx: the slice of the Fresh context a route handler reads.
function routeCtx(req: Request, params: Record<string, string> = {}) {
  return {
    req,
    params,
    url: new URL(req.url),
    info: { remoteAddr: { hostname: "203.0.113.9" } },
  };
}

function adminWriteRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/users/1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ name: "Ana" }),
  });
}

interface FakeUser {
  id: number;
  email: string;
  name: string;
  role: string;
  authSource: string;
  passwordHash: string | null;
}

interface FakePoolOptions {
  // session: the row the session lookup resolves to.
  session?: FakeUser | null;
  // target: the row the user lookup resolves to.
  target?: FakeUser | null;
  // onQuery: observes every statement the route runs.
  onQuery?: (text: string, args: unknown[]) => void;
}

// fakePool: the pool is a process-wide cache (globalThis.__barrierPool), so
// a test can install a stub that answers the lookups it needs and nothing
// else. No real database is contacted.
function fakePool(options: FakePoolOptions): unknown {
  const sessionRow = options.session
    ? {
      id: options.session.id,
      email: options.session.email,
      name: options.session.name,
      phone: "",
      role: options.session.role,
      active: true,
      auth_source: options.session.authSource,
      auth_method: "password",
      mustChangePassword: false,
    }
    : null;
  const userRow = options.target
    ? {
      id: options.target.id,
      email: options.target.email,
      name: options.target.name,
      phone: "",
      role: options.target.role,
      active: true,
      password_hash: options.target.passwordHash,
      must_change_password: false,
      auth_source: options.target.authSource,
      entra_tid: null,
      entra_oid: null,
    }
    : null;
  const client = {
    queryObject: (text: string, args: unknown[] = []) => {
      options.onQuery?.(text, args);
      const sql = text.toLowerCase();
      if (sql.includes("from sessions s join users u")) {
        return Promise.resolve({ rows: sessionRow ? [sessionRow] : [] });
      }
      if (sql.includes("from users where id = $1")) {
        return Promise.resolve({ rows: userRow ? [userRow] : [] });
      }
      if (sql.includes("count(*)::text as n from user_access_groups")) {
        return Promise.resolve({ rows: [{ n: "0" }] });
      }
      return Promise.resolve({ rows: [] });
    },
    release: () => {},
  };
  return {
    connect: () => Promise.resolve(client),
    end: () => Promise.resolve(),
  };
}

// installPool: swaps the cached pool and returns the restore function, so
// the previous pool (if any) survives the test untouched.
function installPool(pool: unknown): () => void {
  const globals = globalThis as unknown as { __barrierPool?: unknown };
  const previous = globals.__barrierPool;
  globals.__barrierPool = pool;
  return () => {
    globals.__barrierPool = previous;
  };
}

async function envelope(res: Response): Promise<{
  error: string;
  code: string;
  requestId: string;
}> {
  assert(res.headers.get("x-request-id"), "missing x-request-id header");
  return await res.json() as {
    error: string;
    code: string;
    requestId: string;
  };
}

Deno.test("anonymous admin write answers the 404 camouflage", async () => {
  const res = await adminWriteHandler()(routeCtx(adminWriteRequest({})));
  assertStrictEquals(res.status, 404);
  const body = await envelope(res);
  assertStrictEquals(body.code, "NOT_FOUND");
  assertStrictEquals(body.error, "not found");
});

Deno.test("dead credential on an admin write answers 401", async () => {
  const res = await adminWriteHandler()(
    routeCtx(adminWriteRequest({ authorization: "Bearer dead-token" })),
  );
  assertStrictEquals(res.status, 401);
  const body = await envelope(res);
  assertStrictEquals(body.code, "UNAUTHORIZED");
});

Deno.test("authenticated non-admin on an admin write answers 403", async () => {
  const restore = installPool(fakePool({
    session: {
      id: 7,
      email: "user@example.com",
      name: "User",
      role: "user",
      authSource: "local",
      passwordHash: null,
    },
  }));
  try {
    const res = await adminWriteHandler()(
      routeCtx(
        adminWriteRequest({
          cookie: `${SESSION_COOKIE}=session-token`,
        }),
      ),
    );
    assertStrictEquals(res.status, 403);
    const body = await envelope(res);
    assertStrictEquals(body.code, "FORBIDDEN");
  } finally {
    restore();
  }
});

// --- Strict numeric parsing on the request path ---------------------------

// withAdminToken: the admin-only routes accept the ADMIN_TOKEN bearer, so a
// test can reach their validation without a database.
async function withAdminToken(fn: () => Promise<void>): Promise<void> {
  const previous = Deno.env.get("ADMIN_TOKEN");
  Deno.env.set("ADMIN_TOKEN", "test-admin-token");
  try {
    await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("ADMIN_TOKEN");
    else Deno.env.set("ADMIN_TOKEN", previous);
  }
}

Deno.test("status write rejects a status id that is not a safe integer", async () => {
  await withAdminToken(async () => {
    const req = new Request("http://localhost/api/barriers/1/status", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-admin-token",
      },
      // 1e300 is an integer value but not a safe one: it can never be a row
      // id, so it is a client mistake rather than a database failure.
      body: JSON.stringify({ statusId: 1e300, authorId: 1 }),
    });
    const res = await statusHandler()(routeCtx(req, { id: "1" }));
    assertStrictEquals(res.status, 400);
    const body = await envelope(res);
    assertStrictEquals(body.code, "BAD_REQUEST");
    assertStrictEquals(
      body.error,
      "statusId is a required non-negative integer",
    );
  });
});

Deno.test("alert rule preview rejects a stale day count that is not a whole number", async () => {
  await withAdminToken(async () => {
    const res = await previewHandler()(
      routeCtx(
        new Request(
          "http://localhost/api/alert-rules/preview?staleDays=1e2",
          { headers: { authorization: "Bearer test-admin-token" } },
        ),
      ),
    );
    assertStrictEquals(res.status, 400);
    const body = await envelope(res);
    assertStrictEquals(body.code, "BAD_REQUEST");
    assertStrictEquals(body.error, "staleDays must be a positive integer");
  });
});

Deno.test("alert rule preview rejects a scope id list that is not whole numbers", async () => {
  await withAdminToken(async () => {
    // "1e2", "0x10", a negative and a zero are not ids the caller may have
    // meant: they used to be read as 100, 16, -1 and 0.
    for (const bad of ["1e2", "0x10", "-1", "0"]) {
      const res = await previewHandler()(
        routeCtx(
          new Request(
            `http://localhost/api/alert-rules/preview?categoryIds=${
              encodeURIComponent(bad)
            }`,
            { headers: { authorization: "Bearer test-admin-token" } },
          ),
        ),
      );
      assertStrictEquals(res.status, 400, bad);
      const body = await envelope(res);
      assertStrictEquals(body.code, "BAD_REQUEST", bad);
      assertStrictEquals(
        body.error,
        "categoryIds must be positive integers",
        bad,
      );
    }
  });
});

Deno.test("sync runs limit falls back to the default for a malformed value", async () => {
  await withAdminToken(async () => {
    const seen: unknown[][] = [];
    const restore = installPool(fakePool({
      onQuery: (text, args) => {
        if (text.toLowerCase().includes("from sync_state")) seen.push(args);
      },
    }));
    try {
      // A partial or exponential value is not a limit: the route must ask
      // for the default 10 runs instead of 12 or 100.
      for (const bad of ["12abc", "1e2"]) {
        const res = await syncRunsHandler()(
          routeCtx(
            new Request(`http://localhost/api/sync-runs?limit=${bad}`, {
              headers: { authorization: "Bearer test-admin-token" },
            }),
          ),
        );
        assertStrictEquals(res.status, 200, bad);
      }
      assertStrictEquals(seen.length, 2);
      for (const args of seen) assertStrictEquals(args[0], 10);
    } finally {
      restore();
    }
  });
});

Deno.test("admin password write with a too short password answers 400", async () => {
  await withAdminToken(async () => {
    const restore = installPool(fakePool({
      target: {
        id: 1,
        email: "user@example.com",
        name: "User",
        role: "user",
        authSource: "local",
        passwordHash: "pbkdf2$210000$salt$hash",
      },
    }));
    try {
      const req = new Request("http://localhost/api/users/1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-admin-token",
        },
        body: JSON.stringify({ password: "short" }),
      });
      const res = await adminWriteHandler()(routeCtx(req, { id: "1" }));
      assertStrictEquals(res.status, 400);
      const body = await envelope(res);
      assertStrictEquals(body.code, "BAD_REQUEST");
      assertStrictEquals(
        body.error,
        "password must be at least 12 characters",
      );
    } finally {
      restore();
    }
  });
});

Deno.test("access-groups duplicateMessage: 23505 + access_groups_name_key -> group name already exists", () => {
  const err = Object.assign(new Error("anything"), {
    fields: { code: "23505", constraint: "access_groups_name_key" },
  });
  assertStrictEquals(
    accessGroupDuplicateMessage(err),
    "group name already exists",
  );
});

Deno.test("access-groups duplicateMessage: other 23505 -> duplicate value", () => {
  const err = Object.assign(new Error("anything"), {
    fields: { code: "23505", constraint: "something_else" },
  });
  assertStrictEquals(accessGroupDuplicateMessage(err), "duplicate value");
});

Deno.test("access-groups duplicateMessage: non-23505 -> undefined", () => {
  const err = Object.assign(new Error("anything"), {
    fields: { code: "23503", constraint: "access_groups_name_key" },
  });
  assertStrictEquals(accessGroupDuplicateMessage(err), undefined);
});

Deno.test("access-groups duplicateMessage: message containing unique but no SQLSTATE -> undefined", () => {
  const err = new Error("unique constraint violated");
  assertStrictEquals(accessGroupDuplicateMessage(err), undefined);
});

import { handler as authPasswordHandler } from "./auth/password.ts";
import { handler as authProfileHandler } from "./auth/profile.ts";
import { handler as authLoginHandler } from "./auth/login.ts";
import { handler as contingenciesHandler } from "./barriers/[id]/contingencies.ts";

Deno.test("typed error classification routes export handlers", () => {
  for (
    const h of [
      authPasswordHandler,
      authProfileHandler,
      authLoginHandler,
      contingenciesHandler,
    ]
  ) {
    if (!h || typeof h !== "object") throw new Error("handler missing");
  }
});
