#!/usr/bin/env bash
# scripts/gate-tests.sh — gate entry for the zenprocess/open-design fork
# (dagger/qa-fast gate lane). Bootstraps Node 24 + pnpm into the
# worker, then runs the repo's own pre-PR checks for this branch's
# changed area. Kept minimal so the fast lane stays fast.
set -euo pipefail

# Force Node 24: the worker ships node 22, but the repo targets node ~24
# (AGENTS.md: Node 22 is unsupported). The lane runs inside Docker on
# Linux, so pick the tarball by OS, not by the worker host.
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v24'; then
  case "$(uname -s)" in
    Darwin) NODE_OS=darwin ;;
    Linux) NODE_OS=linux ;;
    *) echo "unsupported os" >&2; exit 2 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) NODE_ARCH=arm64 ;;
    x86_64) NODE_ARCH=x64 ;;
    *) echo "unsupported arch" >&2; exit 2 ;;
  esac
  NODE_VERSION=v24.19.0
  NODE_DIR="$HOME/.node-$NODE_VERSION"
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    mkdir -p /tmp/node-dl
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-$NODE_OS-$NODE_ARCH.tar.gz" -o /tmp/node-dl/node.tgz
    tar xzf /tmp/node-dl/node.tgz -C /tmp/node-dl
    mv "/tmp/node-dl/node-$NODE_VERSION-$NODE_OS-$NODE_ARCH" "$NODE_DIR"
  fi
  export PATH="$NODE_DIR/bin:$PATH"
fi
node -v

export CI=true
export COREPACK_HOME=/tmp/corepack-home
export npm_config_cache=/tmp/npm-cache
npm install -g pnpm@10.33.2 >/dev/null 2>&1 || true
pnpm install --frozen-lockfile --ignore-scripts >/tmp/pnpm-install.log 2>&1
pnpm rebuild better-sqlite3 >/tmp/sqlite-rebuild.log 2>&1
pnpm --filter @open-design/daemon build >/tmp/daemon-build.log 2>&1

# Branch-specific hardening suite + shared regression files.
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts \
  tests/project-name-validation.test.ts tests/project-file-rename.test.ts tests/mcp-write-tools.test.ts
echo GATE_OK

