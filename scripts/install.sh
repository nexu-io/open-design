#!/bin/bash
# install.sh — Open Design macOS 一鍵安裝腳本
#
# 使用方式：
#   bash <(curl -s https://your-url/install.sh)
#
# 注意：此腳本設計為 idempotent（重跑安全），不需要 chmod +x 即可透過 bash 直接執行。

set -euo pipefail

# ── 顏色輸出 ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── 1. 檢查 macOS ────────────────────────────────────────────────────────────
info "檢查作業系統..."
if [ "$(uname -s)" != "Darwin" ]; then
  error "此腳本僅支援 macOS（Darwin）。偵測到：$(uname -s)"
  exit 1
fi
success "macOS 確認。"

# ── 2. 檢查 / 安裝 nvm ──────────────────────────────────────────────────────
info "檢查 nvm..."
# nvm 是 shell function，不是獨立執行檔；透過 source 載入
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  success "nvm 已存在（$(nvm --version)）。"
else
  warn "nvm 未安裝，正在安裝..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # 安裝後立即 source，使當前 shell session 可用
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    success "nvm 安裝完成（$(nvm --version)）。"
  else
    error "nvm 安裝失敗。請手動安裝後重試：https://github.com/nvm-sh/nvm"
    exit 1
  fi
fi

# ── 3. 安裝並使用 Node 24 ────────────────────────────────────────────────────
info "安裝 Node.js 24..."
nvm install 24
nvm use 24
success "Node.js 版本：$(node --version)"

# ── 4. 啟用 corepack ─────────────────────────────────────────────────────────
info "啟用 corepack..."
corepack enable
success "corepack 已啟用。"

# ── 5. Clone 或 pull repo ────────────────────────────────────────────────────
REPO_URL="https://github.com/nicepkg/open-design.git"
INSTALL_DIR="$HOME/open-design"

info "設定 open-design 原始碼到 $INSTALL_DIR..."
if [ -d "$INSTALL_DIR/.git" ]; then
  info "目錄已存在，執行 git pull..."
  git -C "$INSTALL_DIR" pull --ff-only || {
    error "git pull 失敗。請確認網路連線，或手動解決 $INSTALL_DIR 內的衝突後重試。"
    exit 1
  }
  success "原始碼已更新。"
else
  if [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR")" ]; then
    error "目錄 $INSTALL_DIR 已存在且非空，但不是 git repo。請手動清除後重試。"
    exit 1
  fi
  info "Clone repo..."
  git clone "$REPO_URL" "$INSTALL_DIR" || {
    error "git clone 失敗。請確認網路連線及 repo URL：$REPO_URL"
    exit 1
  }
  success "Clone 完成。"
fi

# ── 6. 安裝依賴 ──────────────────────────────────────────────────────────────
info "安裝 pnpm 依賴..."
cd "$INSTALL_DIR"
pnpm install || {
  error "pnpm install 失敗。請查看上方錯誤訊息。"
  exit 1
}
success "依賴安裝完成。"

# ── 7. 建置 app ──────────────────────────────────────────────────────────────
info "建置 Open Design app（此步驟需要數分鐘）..."
pnpm tools-pack mac build --to app || {
  error "建置失敗。請查看上方錯誤訊息。"
  exit 1
}
success "建置完成。"

# ── 8. 安裝到 /Applications ──────────────────────────────────────────────────
APP_SRC="$INSTALL_DIR/.tmp/tools-pack/out/mac/namespaces/default/builder/mac-arm64/Open Design.app"
APP_DEST="/Applications/Open Design.app"

info "安裝 Open Design.app 到 /Applications/..."
if [ ! -d "$APP_SRC" ]; then
  error "找不到建置產物：$APP_SRC"
  error "請確認 pnpm tools-pack mac build --to app 是否成功完成。"
  exit 1
fi

# 若已有舊版，先移除
if [ -d "$APP_DEST" ]; then
  warn "偵測到已安裝的舊版，正在覆蓋..."
  rm -rf "$APP_DEST"
fi

cp -R "$APP_SRC" /Applications/ || {
  error "複製 app 到 /Applications/ 失敗。可能需要管理員權限，請加上 sudo 重試最後一個步驟。"
  exit 1
}
success "Open Design.app 已複製到 /Applications/。"

# ── 完成 ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Open Design installed to /Applications/.${NC}"
echo -e "${GREEN}  You can find it in Launchpad.${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
