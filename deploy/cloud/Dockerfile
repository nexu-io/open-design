# Cloud business backend only. Build context is the monorepo root.
FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY . .
# Root postinstall owns desktop tooling; the cloud closure builds explicitly.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter ./apps/cloud... && \
    pnpm --filter ./apps/cloud... -r rebuild && \
    pnpm --filter ./apps/cloud... --workspace-concurrency=1 -r --if-present run build && \
    pnpm --filter ./apps/cloud deploy --legacy --prod /cloud

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY --from=build --chown=node:node /cloud/ ./
USER node
CMD ["pnpm", "start"]
