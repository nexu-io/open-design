#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

SHIM_DIR="${TMPDIR:-/tmp}/open-design-command-bin"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/pnpm" <<'SH'
#!/usr/bin/env bash
exec corepack pnpm "$@"
SH
chmod +x "$SHIM_DIR/pnpm"
export PATH="$SHIM_DIR:$PATH"

if ! command -v corepack >/dev/null 2>&1; then
  echo "Corepack nao encontrado. Instale Node.js 24 e tente novamente."
  read -r -p "Pressione Enter para sair."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
if [ "$NODE_MAJOR" != "24" ]; then
  echo "Este projeto exige Node.js 24. Versao atual: $(node -v 2>/dev/null || echo nao encontrada)"
  read -r -p "Pressione Enter para sair."
  exit 1
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if ! corepack pnpm --version >/dev/null 2>&1; then
  if ! corepack prepare pnpm@10.33.2 --activate >/dev/null 2>&1; then
    echo "Corepack encontrado, mas o pnpm nao esta preparado."
    echo "Tente rodar: corepack prepare pnpm@10.33.2 --activate"
    read -r -p "Pressione Enter para sair."
    exit 1
  fi
fi

if [ ! -d node_modules ]; then
  corepack pnpm install
fi

corepack pnpm exec tools-dev stop >/dev/null 2>&1 || true
corepack pnpm exec tools-dev

cleanup() {
  corepack pnpm exec tools-dev stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -t 0 ]; then
  read -r -p "Open Design em execucao no app. Pressione Enter para encerrar."
else
  echo "Open Design em execucao no app. Pressione Ctrl+C para encerrar."
  while true; do sleep 3600; done
fi
