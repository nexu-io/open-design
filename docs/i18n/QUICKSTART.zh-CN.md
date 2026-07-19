# 快速上手 · Quickstart

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.ko.md">한국어</a> · <b>简体中文</b> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <a href="QUICKSTART.th.md">ภาษาไทย</a></p>

在本地运行完整的产品。

## 环境要求

- **Node.js：** `~24`（Node 24.x）。仓库在 `package.json#engines` 中强制要求该版本。
- **pnpm：** `10.33.x`。仓库通过 `packageManager` 固定为 `pnpm@10.33.2`；若使用 Corepack，该固定版本将被自动选中。
- **操作系统：** 主要支持 macOS、Linux、WSL2。Windows 原生环境大部分流程也可运行，但 WSL2 是更稳定的基线。
- **可选的本地 agent CLI：** Open Design 通过 registry 支持 Claude Code、Codex、Devin for Terminal、OpenCode、Cursor Agent、Qwen、Qoder CLI、GitHub Copilot CLI 等本地 runtime；当前清单以 [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) 为准。即使未安装任何本地 runtime，也可使用在 Settings 中配置的 BYOK runtime。

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

首次加载时，应用会检测可用的本地 runtime，并显示在 Settings 中配置的 BYOK runtime。选择 runtime、design template 与 design system，输入 prompt，然后点击 **Send**。结构化的本地 runtime 会写入规范项目文件并流式发送文件/工具事件；文件工作区和预览由这些写入更新。纯文本与 BYOK 运行则返回一个完整的 `<artifact>` 块供宿主解析。在记录或修改任何 artifact 存储路径之前，必须阅读仓库根目录 `AGENTS.md` 中的 **Daemon data directory contract**。

**Design systems** 目录直接从 [`design-systems/`](../../design-systems/) 下的 `DESIGN.md` 包加载。选择任意一套，即可将该品牌的视觉语言应用到 artifact。

**Templates** 目录来自 [`design-templates/`](../../design-templates/)，按原型、deck、文档、图像、视频与音频等 artifact 格式组织。[`skills/`](../../skills/) 则保留给 agent 在工作过程中调用的功能性能力。将 template 与 design system 组合使用，即可产出采用所选视觉语言的 artifact。

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

## Docker 部署

在一个完全容器化的环境中运行 Open Design，无需安装 Node.js 或 pnpm。

### 环境要求

* Docker Desktop
* Docker Compose v2

验证 Docker 是否正确安装：

```bash
docker compose version
```

---

## 启动 Open Design

从仓库根目录开始：

1. 进入 deploy 目录并复制环境配置模板：

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. 生成安全令牌：

   ```bash
   openssl rand -hex 32
   ```

3. 用编辑器打开 `.env`，找到 `OD_API_TOKEN=`，将生成的令牌粘贴进去。

然后启动服务：

```bash
docker compose up -d
```

在浏览器中打开应用：

```text
http://localhost:7456
```

首次启动可能需要几秒钟，Docker 会拉取最新镜像。

---

## 常用 Docker 命令

### 查看日志

```bash
docker compose logs -f
```

### 重启容器

```bash
docker compose restart
```

### 停止容器

```bash
docker compose down
```

### 拉取最新镜像

```bash
docker compose pull
docker compose up -d
```

### 删除所有本地应用数据

```bash
docker compose down -v
```

---

## 环境配置

创建 `deploy/.env` 文件来覆盖默认配置。从提供的模板开始：

```bash
cp deploy/.env.example deploy/.env
```

编辑 `deploy/.env` 来设置你自己的令牌并调整其他值：

```env
# 宿主机暴露的端口
OPEN_DESIGN_PORT=7456

# 容器内存限制
OPEN_DESIGN_MEM_LIMIT=384m

# 允许的 CORS 来源
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker 镜像标签
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

# Daemon 安全所需的 API 令牌
# 使用以下命令生成：openssl rand -hex 32
OD_API_TOKEN=
```

---

## 持久化存储

在记录、修改或选择任何持久 daemon 存储路径之前，
必须阅读仓库根目录 `AGENTS.md` 中的 **Daemon data directory contract**。
本 Quickstart 不得重复该契约，也不得定义存储路径。

---

## 注意事项

* Docker 模式非常适合不希望在本地安装 Node.js 或 pnpm 的贡献者。
* 容器直接在端口 `7456` 上暴露生产环境的 daemon 构建。
* 如需开发工作流和高级本地配置，请参阅本快速上手指南的其余部分。

---

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
| **Local CLI**（daemon 检测到 agent 时的默认模式） | "Local CLI" | 前端 → daemon `/api/chat` → `spawn(<agent>, ...)` → 结构化工具/文件事件经 SSE 传输 → 项目文件 → 预览。plain-stream CLI 改走 text-artifact 路径。 |
| **API 模式**（fallback / 未安装 CLI） | "Anthropic API" / "OpenAI API" / "Atlas Cloud" / "Azure OpenAI" / "Google Gemini" | 前端 → daemon `/api/proxy/{provider}/stream` → provider SSE 归一化为 `delta/end/error` → `<artifact>` 解析器 → 预览 |

两种模式最终进入同一个文件工作区和沙箱预览，但交付契约不同。具备文件系统能力的 runtime 写入规范文件，不应在 `<artifact>` 中重复源码；plain/纯文本与 BYOK 运行没有文件工具，其规范交付物是 `<artifact>` 中的完整 HTML。执行 profile 由 runtime transport 决定。

## Prompt 组合

每次 send 时，应用都会从三层构建 system prompt，然后发送至 provider：

```
BASE_SYSTEM_PROMPT   （按执行 profile 采用文件或 <artifact> 交付）
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
│   │       ├── agents.ts          # runtime 模块的兼容性导出
│   │       ├── runtimes/
│   │       │   ├── registry.ts    # 受支持的 runtime registry
│   │       │   └── defs/          # 各 runtime 的启动与参数定义
│   │       ├── skills.ts          # SKILL.md loader（frontmatter 解析器）
│   │       └── design-systems/    # DESIGN.md loader 与服务
│   │   ├── sidecar/           # tools-dev daemon sidecar 包装层
│   │   └── tests/             # daemon 包的测试
│   ├── web/                   # Next.js 16 App Router + React 客户端
│       ├── app/               # App Router 入口
│       ├── src/               # React + TypeScript 客户端 / runtime 模块
│       │   ├── App.tsx        # 调度 mode / skill / DS picker + send
│       │   ├── providers/     # daemon + BYOK API transport
│       │   ├── prompts/       # system、discovery、directions、deck framework
│       │   ├── artifacts/     # text-artifact 解析 + artifact manifest
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
├── skills/                    # agent 在工作过程中调用的功能性能力
├── design-templates/          # 原型、deck、文档与媒体的渲染目录
├── design-systems/            # 以 DESIGN.md 为基础的品牌包
├── scripts/sync-design-systems.ts    # 从上游 getdesign tarball 重新导入
├── docs/                      # 产品愿景 + spec
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # 根级质量脚本 + `od` bin
```

## 排障

- **"no agents found on PATH"** —— 安装 [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) 中注册的任一本地 runtime，确认 daemon 能找到其可执行文件，然后在 **Settings → Execution mode** 中执行 **Rescan**；也可以在 Settings 中配置 BYOK runtime。
- **daemon 在 /api/chat 上返回 500** —— 查看 daemon 终端的 stderr 尾部；通常是 CLI 拒绝了传入的参数。不同 CLI 的 argv 结构各异；如需调整，请查看 `apps/daemon/src/runtimes/defs/` 中对应的定义。
- **媒体生成报错 `OD_BIN` 缺失、或 daemon URL 为 `:0`** —— 运行上述媒体 dispatcher 排查步骤。请勿复用已有的 CLI 会话；从 Open Design 应用中重新打开 project，daemon 才会注入新的 `OD_*` 变量。
- **Codex 加载的插件上下文过多** —— 使用 `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` 启动 Open Design，daemon 启动 Codex 时会传入 `--disable plugins`。
- **artifact 始终不渲染** —— 先确认本次运行的交付 profile。对于具备文件系统能力的本地 runtime，检查 agent 是否创建了可预览的项目文件、文件事件是否到达 daemon；该路径不应把源码放进 `<artifact>`。对于 plain/纯文本或 BYOK 运行，检查是否存在一个完整的 `<artifact>` 块，并在 daemon 日志中定位第一处失败边界。

## 回到产品愿景

本 Quickstart 对应 [`docs/`](../../docs/) 中 spec 的可运行起点；spec 描述了其演进方向（见 [`docs/roadmap.md`](../../docs/roadmap.md)）。要点如下：

- `docs/architecture.md` 描述了当前已交付的 stack：前端为 Next.js 16 App Router，后端为本地 daemon；`apps/web/next.config.ts` 在 dev 模式下进行 rewrite，使浏览器始终通过同一套 `/api` 入口通信。
- `docs/skills-protocol.md` 描述当前 `SKILL.md`/`od:` frontmatter，以及功能性 skill 与渲染模板的分离。`apps/daemon/src/skills.ts` 中的解析与归一化逻辑是实现层事实来源。
- `docs/agent-adapters.md` 描述 adapter contract。各 runtime 的启动、参数、模型与 stream 设置位于 `apps/daemon/src/runtimes/defs/`，并在 `apps/daemon/src/runtimes/registry.ts` 中注册；`apps/daemon/src/agents.ts` 是兼容性导出层。
- `docs/modes.md` 区分六个 New Project 页签与七个归一化 registry mode（`prototype`、`deck`、`template`、`design-system`、`image`、`video`、`audio`）。
