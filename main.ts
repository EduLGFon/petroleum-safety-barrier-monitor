// Fresh server entry - wires static files and file-system routes.
// This is why it exists: single place that boots the Fresh app for
// `deno task dev` (vite) and `deno task start` (compiled server).
import { App, staticFiles } from "fresh";
import type { State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());

// Include file-system based routes from routes/.
app.fsRoutes();
