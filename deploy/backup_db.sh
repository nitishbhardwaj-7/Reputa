#!/usr/bin/env bash
# Nightly PostgreSQL dump with 14-day retention. Installed by install_backup_cron.sh.
set -euo pipefail

PG_DB=${PG_DB:-reputa}
BACKUP_DIR=${BACKUP_DIR:-/opt/backups/postgres}
KEEP_DAYS=${KEEP_DAYS:-14}

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/${PG_DB}_${STAMP}.sql.gz"

sudo -u postgres pg_dump --no-owner --no-privileges "$PG_DB" | gzip -6 > "$OUT"
find "$BACKUP_DIR" -name "${PG_DB}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete

echo "$(date -u +%FT%TZ) backup ok $(du -h "$OUT" | cut -f1) $OUT"
