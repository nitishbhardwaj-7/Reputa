# Deploying Reputa

Single-server layout: nginx serves the built SPA and proxies `/api` to the Node API
(pm2, port 4100). PostgreSQL and the Python/Playwright scrapers run on the same box.

## First-time setup (as root on a fresh Ubuntu 22.04/24.04 or AlmaLinux/Rocky 9/10 server)

```bash
git clone <repo-url> /opt/reputa
bash /opt/reputa/deploy/provision.sh            # node, python+chromium, postgres, nginx, certbot, pm2
cp /opt/reputa/backend/.env.example /opt/reputa/backend/.env
cat /root/.reputa_database_url                  # paste as DATABASE_URL in backend/.env
openssl rand -hex 48                            # paste as JWT_SECRET
# fill in NODE_ENV=production, COOKIE_SECURE=true, AI_API_KEY, SERPER_API_KEY, MONGODB_URI, SMTP_*
DOMAIN=app.example.com bash /opt/reputa/deploy/deploy.sh
DOMAIN=app.example.com CERT_EMAIL=you@example.com bash /opt/reputa/deploy/nginx.sh
bash /opt/reputa/deploy/install_backup_cron.sh
```

Point the domain's A record at the server **before** running `nginx.sh` (Let's Encrypt
needs to reach it over HTTP).

## Every deploy after that

Push to `main`. GitHub Actions typechecks and builds both halves, then runs
`deploy/deploy.sh` over SSH and polls `/api/health`.

Repository secrets required: `DEPLOY_SSH_KEY` (private key whose public half is in
root's `authorized_keys`), `DEPLOY_HOST`, `DEPLOY_USER` (`root`), `DEPLOY_DOMAIN`.

Manual alternative: `DOMAIN=app.example.com bash /opt/reputa/deploy/deploy.sh`.

## Operations

```bash
pm2 list; pm2 logs reputa-api --lines 100 --nostream; pm2 restart reputa-api --update-env
sudo -u postgres psql -d reputa
ls -la /opt/backups/postgres          # nightly dumps, 14-day retention
tail /var/log/reputa-backup.log
```

## Notes

- The API runs `prisma db push` on boot to keep the schema in sync. Once tenants hold
  data you can't afford to reshape, switch to `prisma migrate deploy`.
- Integration keys (AI, Serper, SMTP, MongoDB) are platform-wide and live only in
  `backend/.env`; tenants never see them. Rotating one = edit `.env`, `pm2 restart`.
- Reddit and TeamBlind block many datacenter IP ranges. If scans return nothing for
  them, the fix is a residential proxy, not code.
