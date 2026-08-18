#!/usr/bin/env bash
# bin/gate.sh — gate entry for the zenprocess/open-design fork
# (dagger/qa-fast lane on macgate). Bootstraps Node 24 + pnpm into the
# worker, then runs the repo's own pre-PR checks for this branch's
# changed area. Kept minimal so the fast lane stays fast.
set -euo pipefail

case "$(uname -m)" in
  arm64|aarch64 NODE_ARCH=arm64 ;;
  x86_64) NODE_ARCH=x64 ;;
  *) echo unsupportedarch >&2; exit 2 ;;
esac
NODE_VERSION=v24.19.0
NODE_DIR=/Users/vvladescu/.node-
export PATH=/bin:/Users/vvladescu/.npm/_npx/1e7f6d9597241db0/node_modules/.bin:/Users/vvladescu/Desktop/ZenInfra/node_modules/.bin:/Users/vvladescu/Desktop/node_modules/.bin:/Users/vvladescu/node_modules/.bin:/Users/node_modules/.bin:/node_modules/.bin:/Users/vvladescu/.local/share/mise/installs/node/22.22.0/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/Users/vvladescu/.local/bin:/Users/vvladescu/.claude/bin:/Users/vvladescu/.codeium/windsurf/bin:/Users/vvladescu/.local/bin:/Users/vvladescu/go/bin:/Users/vvladescu/.local/share/mise/installs/bun/latest/bin:/Users/vvladescu/.local/share/mise/installs/node/22/bin:/usr/local/bin:/usr/local/sbin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Library/TeX/texbin:/Users/vvladescu/.cargo/bin:/Users/vvladescu/.orbstack/bin:/usr/local/opt/fzf/bin:/Users/vvladescu/.pulumi/bin

if ! command -v node >/dev/null 2>&1; then
  mkdir -p /tmp/node-dl
  curl -fsSL https://nodejs.org/dist//node--darwin-.tar.gz -o /tmp/node-dl/node.tgz
  tar xzf /tmp/node-dl/node.tgz -C /tmp/node-dl
  mv /tmp/node-dl/node--darwin- 
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
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts   tests/run-create-validation.test.ts tests/project-file-rename.test.ts tests/mcp-write-tools.test.ts
echo GATE_OK
GATEEOF
)