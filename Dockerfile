# syntax=docker/dockerfile:1
# Barrier Monitor image - Deno-only, build + serve in two stages.
# This is why it exists: the production host runs `compose up` instead of a
# local toolchain. The prod stage builds the Fresh bundle (`_fresh/`) at build
# time; runtime config comes from the mounted `.env` (never baked in - see
# .dockerignore), so the same image serves app, poller, and one-off tools.
# The base stage (deps only, no bundle) exists so dev (`compose.dev.yml`,
# `target: base`) skips the ~20s `deno task build` it would otherwise throw
# away under the `./:/app` bind-mount + `task dev` override.
FROM denoland/deno:2.9.7 AS base

WORKDIR /app
ENV DENO_DIR=/deno-dir

# Dependency layer first for cache hits: manifests only, then install.
# DENO_DIR is a BuildKit cache mount, so the multi-hundred-MB JSR/npm cache
# never lands in the image layer (smaller export) and stays warm across
# builds (fast `deno install` / `deno task build`). node_modules itself is
# still written into the layer, so runtime containers work without mounts.
COPY deno.jsonc deno.lock ./
RUN --mount=type=cache,target=/deno-dir deno install

FROM base AS prod

# App sources (test dumps, secrets, and local build output stay out via
# .dockerignore) and the production bundle build.
COPY . ./
RUN --mount=type=cache,target=/deno-dir deno task build

EXPOSE 8000

# Same boot path as local `deno task start` (reads the mounted .env).
CMD ["task", "start"]
