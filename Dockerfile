FROM node:24-bookworm-slim

ENV CI=1 \
    HOME=/app/.agent-home \
    NEXT_TELEMETRY_DISABLED=1 \
    OD_HOST=0.0.0.0 \
    OD_PORT=7456 \
    PNPM_HOME=/pnpm

ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
COPY scripts ./scripts
COPY assets ./assets
COPY craft ./craft
COPY design-systems ./design-systems
COPY prompt-templates ./prompt-templates
COPY skills ./skills
COPY templates ./templates
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN pnpm install --frozen-lockfile
RUN npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai
RUN pnpm build
RUN mkdir -p /app/.agent-home /app/.od /app/.tmp \
    && chown -R node:node /app/.agent-home /app/.od /app/.tmp \
    && chmod +x /app/docker-entrypoint.sh

EXPOSE 22095

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:22095/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["pnpm", "tools-dev", "run", "web", "--namespace", "docker", "--daemon-port", "7456", "--web-port", "22095", "--prod"]
