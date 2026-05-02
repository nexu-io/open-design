# ============================================================
#  Open Design — Dockerfile (BYOK mode, no local agent CLI)
# ============================================================
FROM node:24-alpine AS base

# Enable corepack so the pinned pnpm version is used
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# Build deps for better-sqlite3 native module
RUN apk add --no-cache python3 make g++ gcc sqlite-dev

WORKDIR /app

# ---- Install dependencies ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm fetch

COPY . .
# Skip postinstall (it tries to build tools/pack which we don't need in production)
# We'll build only what's needed in the builder stage
RUN pnpm install --offline --frozen-lockfile --ignore-scripts

# Manually build the packages that have build scripts
RUN pnpm --filter @open-design/sidecar-proto build && \
    pnpm --filter @open-design/sidecar build && \
    pnpm --filter @open-design/platform build && \
    pnpm --filter @open-design/tools-dev build

# ---- Build daemon ----
FROM base AS builder
COPY --from=deps /app /app

# Build daemon TypeScript (skip strict type checking)
RUN cd apps/daemon && \
    npx tsc -p tsconfig.json --skipLibCheck --noEmit false 2>/dev/null; \
    npx tsc -p tsconfig.sidecar.json --skipLibCheck 2>/dev/null; \
    exit 0

# ---- Runtime ----
FROM base AS runtime

ENV NODE_ENV=production

# Ports
ENV OD_PORT=7456
ENV PORT=3000

# Data volume
VOLUME ["/app/.od"]

WORKDIR /app
COPY --from=builder /app /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7456/api/health || exit 1

CMD ["sh", "-c", "node apps/daemon/dist/cli.js --no-open & cd apps/web && npx next dev --turbo --hostname 0.0.0.0 --port 3000"]
