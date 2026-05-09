# 快速上手 · Quickstart

<p align="center"><a href="QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <b>简体中文</b></p>

在本地运行完整的产品。

## 环境要求

- **Node.js：** `~24`（Node 24.x）。仓库在 `package.json#engines` 中强制要求该版本。
- **pnpm：** `10.33.x`。仓库通过 `packageManager` 固定为 `pnpm@10.33.2`；若使用 Corepack，该固定版本将被自动选中。
- **操作系统：** 主要支持 macOS、Linux、WSL2。Windows 原生环境大部分流程也可运行，但 WSL2 是更稳定的基线。
- **可选的本地 agent CLI：** Claude Code、Codex、Devin for Terminal、Gemini CLI、OpenCode、Cursor Agent、Qwen、Qoder CLI、GitHub Copilot CLI 等。即使未安装任何 CLI，也可在 Settings 中切换至 BYOK API 模式。

`nvm` / `fnm` 为可选的便捷工具，并非项目必要依赖。如需使用，请在执行 pnpm 之前安装并切换到 Node 24：

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

随后启用 Corepack，由仓库自动选择 pnpm：

```bash
corepack enable
corepack pnpm --version   # 应输出 10.33.2
```

## 一条命令（dev 模式）

```bash
corepack enable
pnpm install
pnpm tools-dev run web # 在前台启动 daemon + web
# 打开 tools-dev 输出的 web URL
```

如需将 desktop shell 和所有受管 sidecar 置于后台运行：

```bash
pnpm tools-dev # 在后台启动 daemon + web + desktop
```

首次加载时，应用会扫描已安装的 code-agent CLI（Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen / Qoder CLI），并自动选择其中之一；默认使用 `web-prototype` skill 与 `Neutral Modern` design system。输入 prompt，点击 **Send**。Agent 将以流式方式输出至左侧面板；`<artifact>` 标签会被解析，HTML 在右侧实时渲染。运行完成后，点击 **Save to disk**，artifact 将被写入磁盘 `./.od/artifacts/<timestamp>-<slug>/index.html`。

**Design system** 下拉框内置 **129 套 design system** —— 包含 2 套手工编写的 starter（Neutral Modern、Warm Editorial）、70 套打包的产品级系统，以及来自 [`awesome-design-skills`](https://github.com/bergside/awesome-design-skills) 的 57 个 design skill。选择任意一套，所有原型都会应用该品牌的视觉风格。

**Skill** 下拉框按 mode 分组（Prototype / Deck / Template / Design system），每个 mode 的默认 skill 带有 `· default` 后缀。内置 skill 如下：

- **Prototype** —— `web-prototype`（通用）、`saas-landing`、`dashboard`、`pricing-page`、`docs-page`、`blog-post`、`mobile-app`。
- **Deck / PPT** —— `simple-deck`（单文件横向翻页）与 `magazine-web-ppt`（`guizang-ppt` 捆绑包，来自 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) —— deck mode 的默认 skill，自带 assets/template 与 4 份 reference）。附带 sidefile 的 skill 会自动添加一段 "Skill root (absolute)" 前言，使 agent 能够基于真实的磁盘路径解析 `assets/template.html` 与 `references/*.md`，而非在自身 CWD 中猜测。

将 skill 与 design system 组合使用，仅需一句 prompt 即可产出符合布局规范、并采用所选视觉语言的原型或 deck。

## 其他脚本

```bash
pnpm tools-dev                 # 在后台启动 daemon + web + desktop
pnpm tools-dev start web       # 在后台启动 daemon + web
pnpm tools-dev run web         # 在前台启动 daemon + web（e2e / dev server）
pnpm tools-dev restart         # 重启 daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # 检查托管的 runtime 状态
pnpm tools-dev logs            # 查看 daemon / web / desktop 日志
pnpm tools-dev check           # 查看 status + 最近日志 + 常见诊断
pnpm tools-dev stop            # 停止托管 runtime
pnpm --filter @open-design/daemon build  # 构建 apps/daemon/dist/cli.js，供 `od` 使用
pnpm --filter @open-design/web build     # 在需要时构建 web package
pnpm typecheck                 # 对整个 workspace 执行 typecheck
```

`pnpm tools-dev` 是本地生命周期的唯一入口。请勿再使用已被移除的根级别历史别名（`pnpm dev`、`pnpm dev:all`、`pnpm daemon`、`pnpm preview`、`pnpm start`）。

本地开发时，`tools-dev` 会先启动 daemon，并将其端口传递给 `apps/web`，`apps/web/next.config.ts` 会将 `/api/*`、`/artifacts/*`、`/frames/*` 重写到该 daemon 端口，从而使 App Router 能够与相邻的 Express 进程通信，无需配置 CORS。

## 媒体生成 / agent dispatcher 排查

Image、video、audio、HyperFrames 等 skill 在通过 daemon 启动 agent 时，会注入环境变量以调用本地 `od` CLI：

- `OD_BIN` —— `apps/daemon/dist/cli.js` 的绝对路径。
- `OD_DAEMON_URL` —— 当前运行的 daemon URL。
- `OD_PROJECT_ID` —— 当前激活的 project id。
- `OD_PROJECT_DIR` —— 当前激活 project 的文件目录。

若媒体生成报错 `OD_BIN: parameter not set`、提示找不到 `apps/daemon/dist/cli.js`、或出现 `failed to reach daemon at http://127.0.0.1:0`，请重新构建 daemon CLI 并重启托管 runtime：

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

随后，在 Open Design 应用中**重新打开**该 project，不要复用之前 terminal 中的 agent 会话。由 daemon 启动的 agent 应当能够看到类似如下的值：

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` 必须为真实的 daemon 端口，例如 `http://127.0.0.1:7457`，而非 `http://127.0.0.1:0`。`:0` 仅是内部用于"自动选择可用端口"的启动占位值，不应泄露到 agent 会话中。

仅运行 daemon 的生产模式下，daemon 会自行在 `http://localhost:7456` 提供 Next.js 的静态导出产物，不经过反向代理。

若在 daemon 前部署了 nginx，请关闭 SSE 路由的 buffering 与压缩。常见问题：浏览器控制台在 80-90 秒后报错 `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)`——原因是 nginx 的 `gzip on` 会缓冲分块的 SSE 响应，即使 daemon 已发送 `X-Accel-Buffering: no`。

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;

    proxy_buffering off;
    gzip off;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 两种执行模式

| 模式 | picker 中的值 | 请求流转路径 |
|---|---|---|
| **Local CLI**（daemon 检测到 agent 时的默认模式） | "Local CLI" | 前端 → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact 解析器 → 预览 |
| **API 模式**（fallback / 未安装 CLI） | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | 前端 → daemon `/api/proxy/{provider}/stream` → provider SSE 归一化为 `delta/end/error` → artifact 解析器 → 预览 |

两种模式均送入**同一个** `<artifact>` 解析器与**同一个**沙箱 iframe。区别仅在于传输层和 system prompt 的投递方式（本地 CLI 没有独立的 system 通道，因此组合好的 prompt 会被折叠进 user message）。

## Prompt 组合

每次 send 时，应用都会从三层构建 system prompt，然后发送至 provider：

```
BASE_SYSTEM_PROMPT   （输出契约：用 <artifact> 包裹，不使用 code fence）
   + 当前激活的 design system 正文  （DESIGN.md —— 色板 / 字体 / 布局）
   + 当前激活的 skill 正文          （SKILL.md —— 工作流与输出规则）
```

在顶部 bar 切换 skill 或 design system 后，下一次 send 将使用新的组合。正文会按 session 在内存中缓存，每次切换仅需从 daemon 获取一次。

## 文件结构

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express —— 启动本地 agent + 提供 API
│   │   └── src/
│   │       ├── cli.ts             # `od` bin 入口
│   │       ├── server.ts          # /api/* + 静态资源
│   │       ├── agents.ts          # 扫描 PATH 中的 claude/codex/devin/gemini/opencode/cursor-agent/qwen/qoder/copilot
│   │       ├── skills.ts          # SKILL.md loader（frontmatter 解析器）
│   │       └── design-systems.ts  # DESIGN.md loader
│   │   ├── sidecar/           # tools-dev daemon sidecar 包装层
│   │   └── tests/             # daemon 包的测试
│   ├── web/                   # Next.js 16 App Router + React 客户端
│       ├── app/               # App Router 入口
│       ├── src/               # React + TypeScript 客户端 / runtime 模块
│       │   ├── App.tsx        # 调度 mode / skill / DS picker + send
│       │   ├── providers/     # daemon + BYOK API transport
│       │   ├── prompts/       # system、discovery、directions、deck framework
│       │   ├── artifacts/     # 流式 <artifact> 解析器 + manifest
│       │   ├── runtime/       # iframe srcdoc、markdown、export 辅助函数
│       │   └── state/         # localStorage + 由 daemon 持久化的 project 状态
│       ├── sidecar/           # tools-dev web sidecar 包装层
│       └── next.config.ts     # tools-dev rewrites + 生产环境 apps/web/out 导出配置
│   └── desktop/               # Electron runtime，由 tools-dev 启动 / 检查
├── packages/
│   ├── contracts/             # 共享的 web/daemon 应用契约
│   ├── sidecar-proto/         # Open Design sidecar 协议契约
│   ├── sidecar/               # 通用 sidecar runtime 原语
│   └── platform/              # 通用 process/platform 原语
├── tools/dev/                 # `pnpm tools-dev` 生命周期与 inspect CLI
├── e2e/                       # Playwright UI + 外部集成 / Vitest 测试场
├── skills/                    # SKILL.md —— 任何 Claude Code skill 仓库均可直接放入
│   ├── web-prototype/         # 通用单屏原型（prototype mode 的默认）
│   ├── saas-landing/          # 营销页（hero / features / pricing / CTA）
│   ├── dashboard/             # 后台 / 分析 dashboard
│   ├── pricing-page/          # 独立的定价 + 对比页
│   ├── docs-page/             # 三栏文档布局
│   ├── blog-post/             # 长文编辑风格
│   ├── mobile-app/            # 手机边框单屏
│   ├── simple-deck/           # 最小化横向翻页 deck
│   └── guizang-ppt/           # magazine-web-ppt —— deck/PPT 默认捆绑包
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,components,checklist}.md
├── design-systems/            # DESIGN.md —— 9 段式 schema（awesome-claude-design）
│   ├── default/               # Neutral Modern（starter）
│   ├── warm-editorial/        # Warm Editorial（starter）
│   ├── README.md              # 目录概览
│   └── …129 systems           # 2 套 starter · 70 套产品系统 · 57 个 design skill
├── scripts/sync-design-systems.ts    # 从上游 getdesign tarball 重新导入
├── docs/                      # 产品愿景 + spec
├── .od/                       # runtime 数据（gitignore，自动创建）
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   一次性 "Save to disk" 产物
│   └── projects/<id>/          #   按 project 划分的工作目录 + agent cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # 根级质量脚本 + `od` bin
```

## 排障

- **"no agents found on PATH"** —— 安装以下 CLI 之一：`claude`、`codex`、`devin`、`gemini`、`opencode`、`cursor-agent`、`qwen`、`qodercli`、`copilot`。或者在 Settings 中切换至 API mode，填入 provider key。
- **daemon 在 /api/chat 上返回 500** —— 查看 daemon 终端的 stderr 尾部；通常是 CLI 拒绝了传入的参数。不同 CLI 的 argv 结构各异；如需调整，请参阅 `apps/daemon/src/agents.ts` 中的 `buildArgs`。
- **媒体生成报错 `OD_BIN` 缺失、或 daemon URL 为 `:0`** —— 运行上述媒体 dispatcher 排查步骤。请勿复用已有的 CLI 会话；从 Open Design 应用中重新打开 project，daemon 才会注入新的 `OD_*` 变量。
- **Codex 加载的插件上下文过多** —— 使用 `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` 启动 Open Design，daemon 启动 Codex 时会传入 `--disable plugins`。
- **artifact 始终不渲染** —— 模型输出了文本但未使用 `<artifact>` 包裹。请确认 system prompt 已正确传递（查看 daemon 日志），然后考虑更换能力更强的模型或更严格的 skill。

## 回到产品愿景

本 Quickstart 对应 [`docs/`](docs/) 中 spec 的可运行起点；spec 描述了其演进方向（见 [`docs/roadmap.md`](docs/roadmap.md)）。要点如下：

- `docs/architecture.md` 描述了当前已交付的 stack：前端为 Next.js 16 App Router，后端为本地 daemon；`apps/web/next.config.ts` 在 dev 模式下进行 rewrite，使浏览器始终通过同一套 `/api` 入口通信。
- `docs/skills-protocol.md` 描述了完整的 `od:` frontmatter（类型化输入、slider、能力 gating）。当前 MVP 仅读取 `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires` —— 如需支持更多字段，请扩展 `apps/daemon/src/skills.ts`。
- `docs/agent-adapters.md` 展望了更丰富的 dispatch（能力检测、流式 tool call）。我们的 `apps/daemon/src/agents.ts` 是最小化的 dispatcher —— 刚好足够验证链路通畅。
- `docs/modes.md` 列出了四种 mode：prototype / deck / template / design-system。前两种已有对应的 skill；picker 已按 `mode` 过滤。
