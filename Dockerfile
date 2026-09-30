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

EXPOSE 8000

# Same boot path as local `deno task start` (reads the mounted .env).
CMD ["task", "start"]
