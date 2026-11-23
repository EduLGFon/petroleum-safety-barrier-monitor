// Route tests for PATCH /api/auth/profile - email-change ownership.
// This is why they exist: an email change is an identity change, so it must
// require the current password, reject Entra-only accounts, revoke every
// session, and map a duplicate address to a generic error with no
// account-existence signal. DB-free via a globalThis.__barrierPool stub that
// answers the session, user, and update queries without Postgres.
import { hashPassword } from "../../../lib/server/auth/password.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import type { Pool } from "@db/postgres";

import { PostgresError } from "@db/postgres";

// The route pulls Fresh, whose build-id module reads DENO_DEPLOYMENT_ID and
// its CI fallbacks while it evaluates, and the route reads its boot settings
// through Deno.env. `deno task test` runs with a narrow --allow-env allowlist,
// so swap only the keys this suite owns for an in-memory overlay before
// loading the route. Every other key still goes to the real Deno.env and keeps
// its permission check, and the overlay also isolates the suite from the
// caller's shell environment.
const ENV_KEYS = new Set([
  "DENO_DEPLOYMENT_ID",
  "GITHUB_SHA",
  "CI_COMMIT_SHA",
  "PUBLIC_API_MODE",
  "DENO_ENV",
  "APP_ENV",
  "ADMIN_TOKEN",
  "APP_BASE_URL",
]);
const envOverlay = new Map<string, string>();
const realEnvGet = Deno.env.get.bind(Deno.env);
const realEnvSet = Deno.env.set.bind(Deno.env);
const realEnvDelete = Deno.env.delete.bind(Deno.env);
Deno.env.get = (name: string): string | undefined =>
  ENV_KEYS.has(name) ? envOverlay.get(name) : realEnvGet(name);
Deno.env.set = (name: string, value: string): void => {
  if (ENV_KEYS.has(name)) envOverlay.set(name, value);
  else realEnvSet(name, value);
};
Deno.env.delete = (name: string): void => {
  if (ENV_KEYS.has(name)) {
    envOverlay.delete(name);
    return;
  }
  realEnvDelete(name);
};

// Loaded after the overlay is installed: a static import would be evaluated
// before this module body runs and hit the denied DENO_DEPLOYMENT_ID read.
const { handler } = await import("./profile.ts");

type PatchCtx = Parameters<typeof handler.PATCH>[0];

type Row = Record<string, unknown>;

interface ProfileStub {
  deletedUserIds: unknown[];
  calls: Array<{ text: string; args: unknown[] }>;
  restore: () => void;
}

function profileCtx(req: Request, hostname: string): PatchCtx {
  return {
    req,
    info: { remoteAddr: { transport: "tcp", hostname, port: 4311 } },
  } as unknown as PatchCtx;
}

function profileRequest(body: unknown, token: string): Request {
  return new Request("http://localhost/api/auth/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `barrier_session=${token}`,
    },
    body: JSON.stringify(body),
  });
}

function installProfileStub(opts: {
  userRow: Row;
  sessionRow: Row;
  updatedRow: Row;
  duplicate: boolean;
}): ProfileStub {
  const prev = globalThis.__barrierPool;
  const deletedUserIds: unknown[] = [];
  const calls: Array<{ text: string; args: unknown[] }> = [];
  const respond = (text: string, args: unknown[]): { rows: unknown[] } => {
    calls.push({ text, args });
    const lowered = text.trim().toLowerCase();
    if (
      lowered === "begin" || lowered === "commit" ||
      lowered === "rollback"
    ) {
      return { rows: [] };
    }
    if (lowered.startsWith("select set_config")) return { rows: [] };
    if (lowered.includes("from sessions s join users u")) {
      return { rows: [opts.sessionRow] };
    }
    if (
      lowered.includes("from user_access_groups where user_id") &&
      lowered.includes("count(*)")
    ) {
      return { rows: [{ n: "0" }] };
    }
    if (lowered.includes("select distinct gal.location_id")) {
      return { rows: [] };
    }
    if (
      lowered.includes(
        "where role = 'admin' and active order by id for update",
      )
    ) {
      return { rows: [{ id: 1 }] };
    }
    if (
      lowered.startsWith("select") && lowered.includes("from users where id")
    ) {
      return { rows: [opts.userRow] };
    }
    if (lowered.startsWith("update users set")) {
      if (opts.duplicate) {
        throw new PostgresError({ code: "23505" } as unknown as never);
      }
      return { rows: [opts.updatedRow] };
    }
    if (lowered.startsWith("delete from sessions where user_id")) {
      deletedUserIds.push(args[0]);
      return { rows: [{ id: 1 }] };
    }
    if (lowered.startsWith("delete from sessions where token_hash")) {
      return { rows: [] };
    }
    return { rows: [] };
  };
  const stubClient = {
    queryObject: (
      text: string,
      args: unknown[] = [],
    ): Promise<{ rows: unknown[] }> => Promise.resolve(respond(text, args)),
    release: (): void => {},
  };
  const stubPool = {
    connect: (): Promise<typeof stubClient> => Promise.resolve(stubClient),
    end: async (): Promise<void> => {},
  };
  globalThis.__barrierPool = stubPool as unknown as Pool;
  return {
    deletedUserIds,
    calls,
    restore: (): void => {
      globalThis.__barrierPool = prev;
    },
  };
}

function localRows(passwordHash: string, email: string): {
  userRow: Row;
  sessionRow: Row;
  updatedRow: Row;
} {
  const userRow: Row = {
    id: 42,
    email,
    name: "Risk Owner",
    phone: "",
    password_hash: passwordHash,
    role: "user",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    auth_source: "local",
    entra_tid: null,
    entra_oid: null,
    must_change_password: false,
  };
  const sessionRow: Row = {
    id: 42,
    email,
    name: "Risk Owner",
    phone: "",
    role: "user",
    active: true,
    allowedLocationIds: [],
    auth_source: "local",
    auth_method: "password",
    mustChangePassword: false,
  };
  const updatedRow: Row = {
    id: 42,
    email: "new-address@example.com",
    name: "Risk Owner",
    phone: "",
    role: "user",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    auth_source: "local",
    must_change_password: false,
  };
  return { userRow, sessionRow, updatedRow };
}

Deno.test("profile rejects an email change without the current password", async () => {
  const stored = await hashPassword("correct-current-123456");
  const { userRow, sessionRow, updatedRow } = localRows(
    stored,
    "old-address@example.com",
  );
  const stub = installProfileStub({
    userRow,
    sessionRow,
    updatedRow,
    duplicate: false,
  });
  try {
    const res = await handler.PATCH(
      profileCtx(
        profileRequest({ email: "new-address@example.com" }, "token-a"),
        "profile-without-password",
      ),
    );
    assertStrictEquals(res.status, 400);
    const body = await res.json() as { error: string; code: string };
    assertStrictEquals(body.code, "BAD_REQUEST");
    assertStrictEquals(body.error, "current password is required");
    assertStrictEquals(stub.deletedUserIds.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test("profile rejects an email change with the wrong current password", async () => {
  const stored = await hashPassword("correct-current-123456");
  const { userRow, sessionRow, updatedRow } = localRows(
    stored,
    "old-address@example.com",
  );
  const stub = installProfileStub({
    userRow,
    sessionRow,
    updatedRow,
    duplicate: false,
  });
  try {
    const res = await handler.PATCH(
      profileCtx(
        profileRequest(
          {
            email: "new-address@example.com",
            currentPassword: "wrong-password-999999",
          },
          "token-b",
        ),
        "profile-wrong-password",
      ),
    );
    // A wrong current password maps to 401 per the documented contract, the
    // same as POST /api/auth/password; it is a credential failure, not a
    // validation failure.
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string; code: string };
    assertStrictEquals(body.code, "UNAUTHORIZED");
    assertStrictEquals(body.error, "current password is incorrect");
    assertStrictEquals(stub.deletedUserIds.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test("profile rejects an email change for an Entra-only account", async () => {
  const entraUser: Row = {
    id: 43,
    email: "entra-person@example.com",
    name: "Entra Person",
    phone: "",
    password_hash: null,
    role: "user",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    auth_source: "entra",
    entra_tid: "11111111-1111-1111-1111-111111111111",
    entra_oid: "22222222-2222-2222-2222-222222222222",
    must_change_password: false,
  };
  const entraSession: Row = {
    id: 43,
    email: "entra-person@example.com",
    name: "Entra Person",
    phone: "",
    role: "user",
    active: true,
    allowedLocationIds: [],
    auth_source: "entra",
    auth_method: "entra",
    mustChangePassword: false,
  };
  const entraUpdated: Row = {
    id: 43,
    email: "entra-person@example.com",
    name: "Entra Person",
    phone: "",
    role: "user",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    auth_source: "entra",
    must_change_password: false,
  };
  const stub = installProfileStub({
    userRow: entraUser,
    sessionRow: entraSession,
    updatedRow: entraUpdated,
    duplicate: false,
  });
  try {
    const res = await handler.PATCH(
      profileCtx(
        profileRequest(
          {
            email: "new-address@example.com",
            currentPassword: "anything-at-all-123",
          },
          "token-c",
        ),
        "profile-entra-account",
      ),
    );
    assertStrictEquals(res.status, 400);
    const body = await res.json() as { error: string; code: string };
    assertStrictEquals(body.code, "BAD_REQUEST");
    assert(body.error.includes("password login is not enabled"));
    assertStrictEquals(stub.deletedUserIds.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test("profile email change revokes sessions and clears the cookie", async () => {
  const stored = await hashPassword("correct-current-123456");
  const { userRow, sessionRow, updatedRow } = localRows(
    stored,
    "old-address@example.com",
  );
  const stub = installProfileStub({
    userRow,
    sessionRow,
    updatedRow,
    duplicate: false,
  });
  try {
    const res = await handler.PATCH(
      profileCtx(
        profileRequest(
          {
            email: "new-address@example.com",
            currentPassword: "correct-current-123456",
          },
          "token-d",
        ),
        "profile-email-success",
      ),
    );
    assertStrictEquals(res.status, 200);
    const body = await res.json() as { email: string };
    assertStrictEquals(body.email, "new-address@example.com");
    assert(stub.deletedUserIds.length > 0);
    assertStrictEquals(stub.deletedUserIds[0], 42);
    const cleared = res.headers.get("set-cookie") ?? "";
    assert(cleared.includes("barrier_session="));
    assert(cleared.includes("Expires=Thu, 01 Jan 1970"));
  } finally {
    stub.restore();
  }
});

Deno.test("profile duplicate email maps to a generic error without a signal", async () => {
  const stored = await hashPassword("correct-current-123456");
  const { userRow, sessionRow, updatedRow } = localRows(
    stored,
    "old-address@example.com",
  );
  const stub = installProfileStub({
    userRow,
    sessionRow,
    updatedRow,
    duplicate: true,
  });
  const taken = "taken-address@example.com";
  try {
    const res = await handler.PATCH(
      profileCtx(
        profileRequest(
          { email: taken, currentPassword: "correct-current-123456" },
          "token-e",
        ),
        "profile-duplicate-email",
      ),
    );
    assertStrictEquals(res.status, 400);
    const body = await res.json() as { error: string; code: string };
    assertStrictEquals(body.code, "BAD_REQUEST");
    assertStrictEquals(body.error, "profile update failed");
    assert(!body.error.includes(taken));
    assert(!body.error.toLowerCase().includes("already exists"));
    assert(!body.error.toLowerCase().includes("duplicate"));
    assert(!body.error.toLowerCase().includes("unique"));
  } finally {
    stub.restore();
  }
});
