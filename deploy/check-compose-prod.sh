#!/bin/sh
# check-compose-prod.sh - fail-closed guard for production compose deploys.
# Why it exists: compose.yml ships dev-only defaults (POSTGRES_PASSWORD=barrier)
# for one-command local bring-up. A prod `compose up` with those defaults would
# expose a guessable DB password, so CI/prod must run this first: it aborts
# when POSTGRES_PASSWORD is unset, empty, or still the dev default, and when
# the DB/app ports are not loopback-bound.
# Usage: sh deploy/check-compose-prod.sh [.env]
set -eu
ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "check-compose-prod: $ENV_FILE not found (copy .env.example first)" >&2
  exit 1
fi
pw="$(awk -F= '/^[[:space:]]*POSTGRES_PASSWORD[[:space:]]*=/ { v=$2; sub(/^[[:space:]]*/, "", v); sub(/[[:space:]]*$/, "", v); gsub(/^["'\'']|["'\'']$/, "", v); print v }' "$ENV_FILE" | tail -n 1)"
if [ -z "${pw:-}" ]; then
  echo "check-compose-prod: FAIL - POSTGRES_PASSWORD is unset/empty in $ENV_FILE (set a strong password or use DATABASE_URL_DOCKER with an external DB)" >&2
  exit 1
fi
if [ "$pw" = "barrier" ]; then
  echo "check-compose-prod: FAIL - POSTGRES_PASSWORD still has the dev default 'barrier' in $ENV_FILE (set a strong password for prod)" >&2
  exit 1
fi
if [ "${#pw}" -lt 16 ]; then
  echo "check-compose-prod: FAIL - POSTGRES_PASSWORD is shorter than 16 chars (use a generated secret)" >&2
  exit 1
fi
# Loopback-bind guard: compose.yml must keep 127.0.0.1: prefixes on db/app ports.
if ! grep -q '127\.0\.0\.1:\${POSTGRES_PORT' compose.yml; then
  echo "check-compose-prod: FAIL - compose.yml db ports are not loopback-bound (expected 127.0.0.1:\${POSTGRES_PORT:-5432}:5432)" >&2
  exit 1
fi
if ! grep -q '127\.0\.0\.1:8300:8300' compose.yml; then
  echo "check-compose-prod: FAIL - compose.yml app ports are not loopback-bound (expected 127.0.0.1:8300:8300)" >&2
  exit 1
fi
echo "check-compose-prod: OK - POSTGRES_PASSWORD set (len ${#pw}), ports loopback-bound"
