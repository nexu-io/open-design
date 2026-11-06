#!/bin/bash
# Run from a normal user terminal. Only registers OpenDesign; does not restart Codex.
set -euo pipefail

motion_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
motion_logs="$motion_root/.artifacts/install"

command -v node >/dev/null || { echo '需要先安装 Node.js 22.18+'; exit 1; }
command -v npm >/dev/null || { echo '需要先安装 npm'; exit 1; }
command -v codex >/dev/null || { echo '未找到 codex CLI，请在能运行 codex 的终端执行此脚本。'; exit 1; }
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<18)){console.error("需要 Node.js 22.18+");process.exit(1)}'
codex plugin add --help >/dev/null || { echo '当前 Codex CLI 不支持插件安装，请升级后重试。'; exit 1; }

mkdir -p "$motion_root/.agents/plugins" "$motion_logs"
motion_catalog="$motion_root/.agents/plugins/marketplace.json"
if [ -e "$motion_catalog" ]; then
  node --input-type=module - "$motion_catalog" <<'JS'
import fs from 'node:fs';
const catalog = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (catalog.name !== 'motion-local' || !catalog.plugins?.some(p => p.name === 'motion' && p.source?.source === 'local' && p.source.path === './')) {
  console.error('已有不同的 marketplace 配置，已停止，未覆盖该文件。'); process.exit(1);
}
JS
else
  cp "$motion_root/marketplace.example.json" "$motion_catalog"
fi

# Git checkouts omit studio/build; release ZIPs already contain the editor.
if [ ! -f "$motion_root/studio/build/index.html" ]; then
  echo '首次从源码安装：下载锁定依赖并构建编辑器。'
  (
    cd "$motion_root"
    npm ci --include=dev
    npm run build:studio
  )
fi

echo '只注册 motion-local 并安装 OpenDesign（Motion），不升级或移除其他插件。'
codex plugin marketplace add "$motion_root"
codex plugin add motion@motion-local
codex plugin list --marketplace motion-local
node "$motion_root/scripts/check-installed-mcp.mjs"

cat <<'MOTION_ONBOARDING'
OpenDesign（Motion） 已安装。MCP 连接预检通过。

安装后引导（Codex / Agent）：
请在当前对话简要介绍 OpenDesign（Motion） 支持产品宣传视频、动态图表与流程动画、模板和可编辑预览、MP4 导出。
然后主动询问用户：“要现在体验一个无需准备素材的 20 秒视频吗？我会提供 MP4，并打开可编辑工程。”
停下来等待用户选择；用户明确只要安装或暂不体验时，尊重该选择。
用户回复“体验”或明确接受本次邀请，即确认使用内置 Product Promo（product-promo）：沿用示例文字、图形和动画，创建独立的 20 秒可编辑工程，保留原有工程；同一次体验已创建则复用。
不再追问素材、品牌、风格或模板。进入 motion-template 的首次体验默认路径，在 Codex 右侧打开工作室的可编辑工程，检查载入与播放，并导出 MP4。
接受本次邀请即授权示例导出。等待导出完成并检查实际文件后，最终回复给出简短说明与可播放/下载的 MP4，同时保持右侧工程可用；ZIP/截图仅作补充。
宿主无浏览器/面板能力时仍提供 MP4 与实际工程链接，并说明页面未自动打开；导出失败时保留工程并说明原因，不以预览或排队状态冒充成片。
先在当前对话完成介绍与邀请。若新插件工具尚未加载，在用户同意体验后再提供新会话接续方式。
MOTION_ONBOARDING
