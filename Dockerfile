FROM node:24-slim

# Build deps needed for better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make gcc g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy entire repo (use .dockerignore to skip .git, etc.)
COPY . .

# Install dependencies (postinstall builds workspace packages)
RUN pnpm install --frozen-lockfile

# Build the daemon CLI
RUN pnpm -C apps/daemon run build

EXPOSE 7456

ENV OD_BIND_HOST=0.0.0.0

CMD ["node", "apps/daemon/dist/cli.js", "--no-open", "--host", "0.0.0.0"]
