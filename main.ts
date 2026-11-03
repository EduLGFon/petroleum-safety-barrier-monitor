// Fresh server entry - wires static files and file-system routes.
// This is why it exists: single place that boots the Fresh app for
// `deno task dev` (vite) and `deno task start` (compiled server).
import { App, staticFiles } from "fresh";
import type { State } from "./utils.ts";
import { isProductionEnv, loadServerConfig } from "./lib/server/config.ts";

// Fail fast in a production deployment. In development an absent mode is
// the documented mock default; in production loadServerConfig rejects mock
// mode, a missing DATABASE_URL, and any typo in PUBLIC_API_MODE.
if (isProductionEnv()) loadServerConfig();

export const app = new App<State>();

app.use(staticFiles());

// Include file-system based routes from routes/.
app.fsRoutes();
