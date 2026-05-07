# -- Build stage -------------------------------------------------------
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# Pin to the exact pnpm version declared in package.json
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY . .

# Install dependencies (postinstall builds workspace packages)
RUN pnpm install --frozen-lockfile

# Build the daemon CLI and the static web UI
RUN pnpm -C apps/daemon run build \
    && pnpm --filter @open-design/web build

# -- Runtime stage ------------------------------------------------------
FROM node:24-slim

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# Create unprivileged user
RUN groupadd -r oduser && useradd -r -g oduser oduser \
    && mkdir -p /app/.od && chown -R oduser:oduser /app

WORKDIR /app

# Runtime dependencies (pnpm workspace resolution)
COPY --from=builder --chown=oduser:oduser /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=oduser:oduser /app/node_modules ./node_modules

# Workspace package manifests (needed for module resolution)
COPY --from=builder --chown=oduser:oduser /app/packages ./packages
COPY --from=builder --chown=oduser:oduser /app/tools ./tools
COPY --from=builder --chown=oduser:oduser /app/apps ./apps

# Built artifacts
COPY --from=builder --chown=oduser:oduser /app/apps/daemon/dist ./apps/daemon/dist
COPY --from=builder --chown=oduser:oduser /app/apps/web/out ./apps/web/out

# Runtime data directories
COPY --from=builder --chown=oduser:oduser /app/skills ./skills
COPY --from=builder --chown=oduser:oduser /app/design-systems ./design-systems
COPY --from=builder --chown=oduser:oduser /app/prompt-templates ./prompt-templates
COPY --from=builder --chown=oduser:oduser /app/templates ./templates
COPY --from=builder --chown=oduser:oduser /app/craft ./craft
COPY --from=builder --chown=oduser:oduser /app/assets ./assets

USER oduser

EXPOSE 7456

# Default to loopback-only — the daemon is local-first with no auth.
# To bind broadly, explicitly set OD_BIND_HOST=0.0.0.0 at runtime.
ENV OD_BIND_HOST=127.0.0.1

# Do NOT add --host here — the CLI flag overrides OD_BIND_HOST env.
CMD ["node", "apps/daemon/dist/cli.js", "--no-open"]
