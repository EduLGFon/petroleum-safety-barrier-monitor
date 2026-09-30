// Vite config - enables the Fresh plugin for dev/build bundling.
// This is why it exists: `deno task dev` and `deno task build` run vite.
import { fresh } from "@fresh/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [fresh()],
  // Skip per-chunk gzip-size computation: identical output, faster build
  // (matters twice: local `deno task build` and `RUN deno task build`).
  build: { reportCompressedSize: false },
});
