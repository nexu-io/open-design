#!/usr/bin/env bash
# Remote entry point: download the source, then use the repository installer.
set -euo pipefail

main() {
  local motion_repo='https://github.com/nexu-io/open-design.git'
  local motion_ref="${OPENMOTION_REF:-main}"
  local motion_destination="${OPENMOTION_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/open-motion}"

  for motion_command in git node npm codex; do
    command -v "$motion_command" >/dev/null || { echo "缺少 $motion_command，请先安装后重试。" >&2; exit 1; }
  done
  node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<18)){console.error("需要 Node.js 22.18+");process.exit(1)}'
  codex plugin add --help >/dev/null || { echo '当前 Codex CLI 不支持插件安装，请升级后重试。' >&2; exit 1; }

  case "$motion_destination" in
    /*) ;;
    *) echo 'OPENMOTION_INSTALL_DIR 必须是绝对路径。' >&2; exit 1 ;;
  esac
  if [ -e "$motion_destination" ] || [ -L "$motion_destination" ]; then
    echo "安装目录已存在，未覆盖：$motion_destination" >&2
    echo '如需重新安装，请用 OPENMOTION_INSTALL_DIR 指定新的空目录。' >&2
    exit 1
  fi

  mkdir -p "$(dirname -- "$motion_destination")"
  echo "下载 OpenMotion ($motion_ref) 到 $motion_destination"
  git clone --depth 1 --filter=blob:none --sparse --branch "$motion_ref" -- "$motion_repo" "$motion_destination"
  git -C "$motion_destination" sparse-checkout set plugins/motion
  bash "$motion_destination/plugins/motion/scripts/install-motion.command"
}

main "$@"
