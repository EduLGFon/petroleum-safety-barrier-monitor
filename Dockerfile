# Barrier Monitor image - Deno-only, build + serve in one stage.
# This is why it exists: the production host runs `compose up` instead of a
# local toolchain. The image builds the Fresh bundle (`_fresh/`) at build
# time; runtime config comes from the mounted `.env` (never baked in - see
# .dockerignore), so the same image serves app, poller, and one-off tools.
FROM denoland/deno:2.9.6

WORKDIR /app

# Dependency layer first for cache hits: manifests only, then install.
COPY deno.jsonc deno.lock ./
RUN deno install

# App sources (test dumps, secrets, and local build output stay out via
# .dockerignore) and the production bundle build.
COPY . ./
RUN deno task build

EXPOSE 8000

# Same boot path as local `deno task start` (reads the mounted .env).
CMD ["task", "start"]
