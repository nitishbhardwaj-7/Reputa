#!/usr/bin/env bash
# Nightly PostgreSQL dump from the reputa-db container with 14-day retention.
# Installed by install_backup_cron.sh.
set -euo pipefail

PG_DB=${PG_DB:-reputa}
PG_USER=${PG_USER:-reputa}
CONTAINER=${CONTAINER:-reputa-db}
BACKUP_DIR=${BACKUP_DIR:-/opt/backups/reputa}
KEEP_DAYS=${KEEP_DAYS:-14}

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/${PG_DB}_${STAMP}.sql.gz"

docker exec "$CONTAINER" pg_dump -U "$PG_USER" --no-owner --no-privileges "$PG_DB" | gzip -6 > "$OUT"
find "$BACKUP_DIR" -name "${PG_DB}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete

echo "$(date -u +%FT%TZ) backup ok $(du -h "$OUT" | cut -f1) $OUT"
