#!/usr/bin/env bash
# One-time provisioning for a fresh Reputa server. Idempotent; safe to re-run.
# Supports Ubuntu/Debian (apt) and RHEL-family (dnf: AlmaLinux, Rocky, CentOS Stream).
#
#   bash deploy/provision.sh
#
# Afterwards: create backend/.env from backend/.env.example, then run deploy/deploy.sh.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/reputa}
PYENV=${PYENV:-/opt/pyenv}
PG_DB=${PG_DB:-reputa}
PG_USER=${PG_USER:-reputa}

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if command -v apt-get >/dev/null 2>&1; then PKG=apt; elif command -v dnf >/dev/null 2>&1; then PKG=dnf; else echo "Unsupported distro"; exit 1; fi

# ---------------------------------------------------------------- base packages
log "Base packages ($PKG)"
if [ "$PKG" = apt ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg git nginx python3 python3-pip python3-venv build-essential \
    postgresql postgresql-contrib certbot python3-certbot-nginx
  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  # Chromium runtime deps for Playwright
  apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 fonts-liberation 2>/dev/null \
  || apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 fonts-liberation
  systemctl enable --now postgresql
else
  dnf install -y epel-release || true
  dnf install -y curl ca-certificates git nginx python3 python3-pip gcc make tar \
    postgresql-server postgresql-contrib certbot python3-certbot-nginx nodejs npm
  for p in alsa-lib atk at-spi2-atk at-spi2-core cairo cups-libs dbus-libs expat libX11 libXcomposite libXdamage \
           libXext libXfixes libXrandr libxcb libxkbcommon mesa-libgbm nspr nss pango libdrm liberation-fonts; do
    dnf install -y "$p" >/dev/null 2>&1 || true
  done
  [ -f /var/lib/pgsql/data/PG_VERSION ] || postgresql-setup --initdb
  systemctl enable --now postgresql
fi
node -v; npm -v
npm install -g pm2@latest >/dev/null

# ---------------------------------------------------------------- python + playwright
log "Python venv + Playwright Chromium"
python3 -m venv "$PYENV"
"$PYENV/bin/pip" install --quiet --upgrade pip
"$PYENV/bin/pip" install --quiet playwright pymongo dnspython
"$PYENV/bin/playwright" install chromium
"$PYENV/bin/python" - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox"]); b.close()
print("Chromium launch OK")
PY

# ---------------------------------------------------------------- postgres role + db
log "PostgreSQL database '$PG_DB' / role '$PG_USER'"
PW_FILE=/root/.reputa_db_pw
if [ ! -f "$PW_FILE" ]; then openssl rand -hex 24 > "$PW_FILE"; chmod 600 "$PW_FILE"; fi
PW=$(cat "$PW_FILE")
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$PG_USER') THEN CREATE ROLE $PG_USER LOGIN; END IF; END \$\$;
ALTER ROLE $PG_USER WITH PASSWORD '$PW';
SELECT 'CREATE DATABASE $PG_DB OWNER $PG_USER' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$PG_DB')\gexec
SQL
echo "DATABASE_URL=postgresql://$PG_USER:$PW@127.0.0.1:5432/$PG_DB?schema=public" > /root/.reputa_database_url
chmod 600 /root/.reputa_database_url
echo "Connection string written to /root/.reputa_database_url (copy into backend/.env)"

# ---------------------------------------------------------------- app directory
log "App directory $APP_DIR"
mkdir -p "$APP_DIR" /opt/backups
echo
echo "Provisioning complete. Next:"
echo "  1. git clone <repo> $APP_DIR   (or let CI do it)"
echo "  2. cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env and fill it in (see /root/.reputa_database_url)"
echo "  3. DOMAIN=your.domain bash $APP_DIR/deploy/deploy.sh"
echo "  4. DOMAIN=your.domain bash $APP_DIR/deploy/nginx.sh   (vhost + HTTPS)"
echo "  5. bash $APP_DIR/deploy/install_backup_cron.sh"
