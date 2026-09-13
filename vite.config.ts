// Vite config - enables the Fresh plugin for dev/build bundling.
// This is why it exists: `deno task dev` and `deno task build` run vite.
import { fresh } from "@fresh/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [fresh()],
});
