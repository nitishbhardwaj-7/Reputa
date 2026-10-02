#!/usr/bin/env bash
# Build and (re)start Reputa on the server. Idempotent; run on every deploy.
#
#   bash deploy/deploy.sh
#
# Expects: /opt/reputa checked out, backend/.env and deploy/.env present, Docker with
# the external `dokploy-network` (Traefik) available.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/reputa}
BRANCH=${BRANCH:-main}

cd "$APP_DIR"

if [ -d .git ]; then
  git fetch --all --prune
  git reset --hard "origin/$BRANCH"
fi

[ -f backend/.env ] || { echo "backend/.env is missing. Copy backend/.env.example and fill it in." >&2; exit 1; }
[ -f deploy/.env ] || { echo "deploy/.env is missing (APP_DOMAIN, POSTGRES_PASSWORD)." >&2; exit 1; }

echo "==> Build + start"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans

echo "==> Health"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4100/api/health >/dev/null; then
    echo "healthy"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 4
done
echo "api did not become healthy" >&2
docker logs --tail 60 reputa-api
exit 1
