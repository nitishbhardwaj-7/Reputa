# Deploying Reputa

One image, two containers: `reputa-api` (Node API + built SPA + Python/Playwright
scrapers) and `reputa-db` (PostgreSQL 16 on a named volume). Traefik, already running
on the host for other apps (Dokploy), terminates TLS and routes the domain to the API
by Docker labels. Nothing in this repo binds ports 80/443.

## First-time setup (as root, on a host that already runs Dokploy/Traefik)

```bash
git clone https://github.com/nitishbhardwaj-7/Reputa.git /opt/reputa
cp /opt/reputa/backend/.env.example /opt/reputa/backend/.env
# fill in JWT_SECRET (openssl rand -hex 48), AI_API_KEY, SERPER_API_KEY, MONGODB_URI, SMTP_*
# DATABASE_URL / PORT / NODE_ENV / COOKIE_SECURE are injected by docker-compose; leave them.
printf 'APP_DOMAIN=orm.webflowby.online\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > /opt/reputa/deploy/.env
bash /opt/reputa/deploy/deploy.sh
bash /opt/reputa/deploy/install_backup_cron.sh
```

Point the domain's A record at the server first — Traefik completes the Let's Encrypt
HTTP challenge on the first request.

## Every deploy after that

Push to `main`. GitHub Actions typechecks and builds both halves, then runs
`deploy/deploy.sh` over SSH (git reset → `docker compose up -d --build`) and polls
`https://<domain>/api/health`.

Repository secrets required: `DEPLOY_SSH_KEY` (private key whose public half is in
root's `authorized_keys`), `DEPLOY_HOST`, `DEPLOY_USER` (`root`), `DEPLOY_DOMAIN`.

Manual alternative: `bash /opt/reputa/deploy/deploy.sh`.

## Operations

```bash
docker compose -f /opt/reputa/deploy/docker-compose.yml --env-file /opt/reputa/deploy/.env ps
docker logs -f --tail 100 reputa-api
docker exec -it reputa-db psql -U reputa reputa
ls -la /opt/backups/reputa                # nightly dumps, 14-day retention
tail /var/log/reputa-backup.log
# restore: gunzip -c dump.sql.gz | docker exec -i reputa-db psql -U reputa reputa
```

## Notes

- The API runs `prisma db push` on boot to keep the schema in sync. Once tenants hold
  data you can't afford to reshape, switch to `prisma migrate deploy`.
- Integration keys (AI, Serper, SMTP, MongoDB) are platform-wide and live only in
  `backend/.env`; tenants never see them. Rotating one = edit `.env`, then
  `docker compose ... up -d` (no rebuild needed).
- Chromium runs inside the container with `shm_size: 1g`. Reddit and TeamBlind block
  many datacenter IP ranges; if scans return nothing for them, the fix is a residential
  proxy, not code.
