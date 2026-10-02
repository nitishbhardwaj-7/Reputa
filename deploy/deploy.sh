#!/usr/bin/env bash
# Build and (re)start Reputa on the server. Idempotent; run on every deploy.
#
#   DOMAIN=app.example.com bash deploy/deploy.sh
#
# Expects: backend/.env present, /opt/pyenv from provision.sh, pm2 installed.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/reputa}
PYENV=${PYENV:-/opt/pyenv}
DOMAIN=${DOMAIN:?Set DOMAIN=your.domain}
BRANCH=${BRANCH:-main}

cd "$APP_DIR"

if [ -d .git ]; then
  git fetch --all --prune
  git reset --hard "origin/$BRANCH"
fi

[ -f backend/.env ] || { echo "backend/.env is missing. Copy backend/.env.example and fill it in." >&2; exit 1; }

echo "==> Backend"
cd "$APP_DIR/backend"
# --ignore-scripts: nothing to pip-install here, Playwright lives in $PYENV.
npm ci --ignore-scripts --include=dev --no-audit --no-fund
npx prisma generate --schema=prisma/schema.prisma
npm run build

echo "==> Frontend"
cd "$APP_DIR/frontend"
# Same-origin API behind nginx; no VITE_API_BASE_URL needed.
npm ci --include=dev --no-audit --no-fund
npm run build
chmod -R o+rX "$APP_DIR/frontend/dist"
chmod o+rx "$APP_DIR" "$APP_DIR/frontend"

echo "==> Process"
cd "$APP_DIR"
# pm2 ecosystem sets NODE_ENV/PYTHON_EXECUTABLE; secrets stay in backend/.env.
pm2 startOrReload deploy/ecosystem.config.js --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> Health"
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:4100/api/health >/dev/null; then echo "healthy"; exit 0; fi
  sleep 3
done
echo "backend did not become healthy" >&2
pm2 logs reputa-api --lines 40 --nostream
exit 1
