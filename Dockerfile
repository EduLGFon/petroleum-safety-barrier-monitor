# syntax=docker/dockerfile:1
# Barrier Monitor image - Deno-only, build + serve in two stages.
# This is why it exists: the production host runs `compose up` instead of a
# local toolchain. The prod stage builds the Fresh bundle (`_fresh/`) at build
# time; runtime config comes from the mounted `.env` (never baked in - see
# .dockerignore), so the same image serves app, poller, and one-off tools.
# The base stage (deps only, no bundle) exists so dev (`compose.dev.yml`,
# `target: base` + its own `barrier-monitor:dev` tag) skips the ~20s
# `deno task build` it would otherwise throw away under the `./:/app`
# bind-mount + `task dev` override.
# Base digest is pinned: skips the per-build registry metadata check and
# makes rebuilds reproducible (refresh intentionally via `docker pull`).
FROM denoland/deno:2.9.7@sha256:fa335acdf6b72106eda2cb6a8cb5f4187e7630e357467489db4b2e7352d5e432 AS base

WORKDIR /app
ENV DENO_DIR=/deno-dir

# Dependency layer first for cache hits: manifests only, then install.
# Downloaded warm through the BuildKit mount (never lands in a layer), then
# the JSR/remote cache is persisted into the image (~16MB) so containers boot
# hermetic with no first-start downloads. npm/ tarballs are dropped: runtime
# npm resolves from node_modules (verified via `deno check --cached-only` on
# every service entrypoint). node_modules itself stays in the layer, so
# runtime containers work without mounts.
COPY deno.jsonc deno.lock ./
RUN --mount=type=cache,target=/tmp/dcache \
    DENO_DIR=/tmp/dcache deno install && \
    cp -a /tmp/dcache/. /deno-dir/ && \
    rm -rf /deno-dir/npm

FROM base AS prod

# App sources (test dumps, secrets, and local build output stay out via
# .dockerignore) and the production bundle build. Same warm mount as above,
# so repeat builds resolve from cache instead of the registry.
COPY . ./
RUN --mount=type=cache,target=/tmp/dcache \
    DENO_DIR=/tmp/dcache deno task build

# Runtime prune: node_modules is 100MB+ of build/test toolchain (vite +
# esbuild/rollup family, linkedom test DOM, xlsx test validator) that the
# prebuilt `_fresh/` bundle + server routes never import at runtime (kept:
# preact/signals/render-to-string, openid-client auth, Fresh/jsr in
# /deno-dir). Name-prefix globs survive version bumps in deno.lock.
# Verified below via `deno check --cached-only` on the app + worker
# entrypoints: any surviving runtime import of a pruned package fails the
# build here instead of a container at 3am. Dev (`target: base`) and host
# runs keep the full tree, so tests/scripts stay untouched.
RUN rm -rf \
      node_modules/vite node_modules/rollup node_modules/esbuild \
      node_modules/esbuild-wasm node_modules/linkedom node_modules/xlsx \
      node_modules/codepage node_modules/caniuse-lite \
      node_modules/@esbuild node_modules/@rollup node_modules/@types \
      node_modules/@babel \
      node_modules/.deno/vite@* node_modules/.deno/rollup@* \
      node_modules/.deno/esbuild@* node_modules/.deno/esbuild-wasm@* \
      node_modules/.deno/linkedom@* node_modules/.deno/xlsx@* \
      node_modules/.deno/codepage@* node_modules/.deno/caniuse-lite@* \
      node_modules/.deno/@esbuild+* node_modules/.deno/@rollup+* \
      node_modules/.deno/@types+* node_modules/.deno/@babel+* && \
    DENO_DIR=/deno-dir deno check --cached-only main.ts \
      scripts/fracttal-poll.ts scripts/alerts-poll.ts scripts/migrate.ts

EXPOSE 8300

# Drop privileges: the deno base image ships a `deno` user; runtime processes
# (app/poller/tools) must not run as root. /app and /deno-dir are chowned so
# the bundle + cache stay readable after the switch. If a bind-mount needs
# root-owned writes, chown the host path to 1000:1000 instead of removing USER.
RUN chown -R deno:deno /app /deno-dir
USER deno

# Same boot path as local `deno task start` (reads the mounted .env).
CMD ["task", "start"]
