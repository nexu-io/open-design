ARG NODE_IMAGE=docker.io/library/node:22-alpine
ARG RUNTIME_IMAGE=docker.io/library/alpine:3.22

FROM ${NODE_IMAGE} AS build

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV no_proxy=${no_proxy}
ENV NO_PROXY=${NO_PROXY}

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && \
    corepack prepare pnpm@9.15.9 --activate && \
    pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN pnpm build && \
    pnpm prune --prod && \
    pnpm store prune && \
    rm -rf \
      /root/.cache \
      /root/.local/share/pnpm/store \
      node_modules/.cache \
      node_modules/@types \
      node_modules/.pnpm/@types+* \
      node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/deps \
      node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/src && \
    find node_modules -type d \( \
      -name test -o \
      -name tests -o \
      -name "__tests__" -o \
      -name docs -o \
      -name doc -o \
      -name example -o \
      -name examples -o \
      -name ".github" \
    \) -prune -exec rm -rf '{}' + && \
    find node_modules -type f \( \
      -name "*.md" -o \
      -name "*.markdown" -o \
      -name "*.d.ts" -o \
      -name "*.d.cts" -o \
      -name "*.d.mts" -o \
      -name "*.map" -o \
      -name "*.tsbuildinfo" -o \
      -name "binding.gyp" \
    \) -delete

FROM ${RUNTIME_IMAGE}

RUN apk add --no-cache nodejs tini && \
    addgroup -S -g 1001 open-design && \
    adduser -S -D -H -u 1001 -G open-design open-design

WORKDIR /app
COPY --from=build --chown=open-design:open-design /app/package.json ./package.json
COPY --from=build --chown=open-design:open-design /app/node_modules ./node_modules
COPY --from=build --chown=open-design:open-design /app/dist ./dist
COPY --chown=open-design:open-design daemon ./daemon
COPY --chown=open-design:open-design skills ./skills
COPY --chown=open-design:open-design design-systems ./design-systems
COPY --chown=open-design:open-design assets/frames ./assets/frames

RUN mkdir -p /app/.od && \
    chown -R open-design:open-design /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=192
ENV OD_HOST=0.0.0.0
ENV OD_PORT=7456

EXPOSE 7456

USER open-design
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "daemon/cli.js", "--no-open"]
