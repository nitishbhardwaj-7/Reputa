#!/usr/bin/env bash
# Schedules deploy/backup_db.sh nightly at 02:30 UTC and runs it once now.
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/reputa}
chmod +x "$APP_DIR/deploy/backup_db.sh"
mkdir -p /opt/backups/reputa
cat > /etc/cron.d/reputa-db-backup <<CRON
30 2 * * * root APP_DIR=$APP_DIR bash $APP_DIR/deploy/backup_db.sh >> /var/log/reputa-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/reputa-db-backup
bash "$APP_DIR/deploy/backup_db.sh"
echo "Nightly backups installed (/etc/cron.d/reputa-db-backup, log at /var/log/reputa-backup.log)"
