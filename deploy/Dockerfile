# Reputa: API + built SPA + Python/Playwright scrapers in one image.
# Build from the repository root:  docker build -f deploy/Dockerfile -t reputa-app .

# ---------------------------------------------------------------- frontend
FROM node:22-bookworm-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY frontend ./
RUN npm run build

# ---------------------------------------------------------------- backend
FROM node:22-bookworm-slim AS backend
WORKDIR /app/backend
# openssl: Prisma's engine needs it to detect the platform at generate time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
# --ignore-scripts: postinstall runs `prisma generate`, which needs the schema copied first.
RUN npm ci --ignore-scripts --include=dev --no-audit --no-fund
COPY backend ./
RUN npx prisma generate --schema=prisma/schema.prisma && npm run build

# ---------------------------------------------------------------- runtime
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PYTHON_EXECUTABLE=/opt/pyenv/bin/python \
    SERVE_STATIC_DIR=/app/frontend/dist \
    PORT=4100
# Python + Chromium for the scrapers. `--with-deps` pulls the shared libraries Chromium needs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates curl openssl \
 && python3 -m venv /opt/pyenv \
 && /opt/pyenv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/pyenv/bin/pip install --no-cache-dir playwright pymongo dnspython \
 && /opt/pyenv/bin/playwright install --with-deps chromium \
 && apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY --from=backend /app/backend ./
COPY --from=frontend /fe/dist /app/frontend/dist
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://127.0.0.1:4100/api/health || exit 1
CMD ["node", "dist/server.js"]
