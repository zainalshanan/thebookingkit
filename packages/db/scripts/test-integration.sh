#!/usr/bin/env bash
# Runs the DB integration tests against a fresh, isolated Postgres container.
# Spins up the container, runs migrations + tests, then removes the container
# AND its anonymous volume — regardless of whether the tests pass or fail.
#
# Usage:
#   bash packages/db/scripts/test-integration.sh
#   # or via npm: npm run test:integration:fresh  (from packages/db)
#
# Does NOT touch the dev DB (docker-compose postgres on port 5432).

set -euo pipefail

CONTAINER="thebookingkit-integration-test"
PORT=5433
DB_URL="postgresql://thebookingkit:thebookingkit@localhost:${PORT}/thebookingkit"

# Resolve the directory containing this script so the script works regardless
# of the working directory it's called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cleanup() {
  echo ""
  echo "→ Stopping and removing test container + volume..."
  docker stop "${CONTAINER}" >/dev/null 2>&1 || true
  docker rm -v "${CONTAINER}" >/dev/null 2>&1 || true
  echo "✓ Container and volume removed."
}

# Always clean up on exit (success, failure, or interrupt).
trap cleanup EXIT

echo "→ Starting isolated Postgres 15 container on port ${PORT}..."
docker run -d \
  --name "${CONTAINER}" \
  -e POSTGRES_DB=thebookingkit \
  -e POSTGRES_USER=thebookingkit \
  -e POSTGRES_PASSWORD=thebookingkit \
  -p "${PORT}:5432" \
  postgres:15-alpine

echo "→ Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  docker exec "${CONTAINER}" pg_isready -U thebookingkit -q && break
  echo "   ($i/30) not ready yet..."
  sleep 1
done
docker exec "${CONTAINER}" pg_isready -U thebookingkit

echo "→ Pushing Drizzle schema..."
(cd "${PKG_DIR}" && export DATABASE_URL="${DB_URL}" && echo "yes" | npx drizzle-kit push)

echo "→ Running custom SQL migrations..."
(cd "${PKG_DIR}" && DATABASE_URL="${DB_URL}" node --import tsx/esm src/migrate.ts)

echo "→ Running integration tests..."
(cd "${PKG_DIR}" && DATABASE_URL="${DB_URL}" npx vitest run src/__tests__/integration.test.ts)
