# 快速上手 · Quickstart

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <b>繁體中文</b> · <a href="QUICKSTART.th.md">ภาษาไทย</a></p>

在本地執行完整的產品。

## 環境要求

- **Node.js：** `~24`（Node 24.x）。程式碼庫在 `package.json#engines` 中強制要求該版本。
- **pnpm：** `10.33.x`。程式碼庫透過 `packageManager` 固定為 `pnpm@10.33.2`；若使用 Corepack，該固定版本將被自動選中。
- **作業系統：** 主要支援 macOS、Linux、WSL2。Windows 原生環境大部分流程也可執行，但 WSL2 是更穩定的基準。
- **可選的本地 agent CLI：** Open Design 透過 registry 支援 Claude Code、Codex、Devin for Terminal、OpenCode、Cursor Agent、Qwen、Qoder CLI、GitHub Copilot CLI 等本地 runtime；目前清單以 [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) 為準。即使未安裝任何本地 runtime，也可使用在 Settings 中設定的 BYOK runtime。

`nvm` / `fnm` 為可選的便捷工具，並非專案必要依賴。如需使用，請在執行 pnpm 之前安裝並切換到 Node 24：

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

隨後啟用 Corepack，由程式碼庫自動選擇 pnpm：

```bash
corepack enable
corepack pnpm --version   # 應輸出 10.33.2
```

## 一條指令（dev 模式）

```bash
corepack enable
pnpm install
pnpm tools-dev run web # 在前景啟動 daemon + web
# 開啟 tools-dev 輸出的 web URL
```

如需將 desktop shell 和所有受管 sidecar 置於背景執行：

```bash
pnpm tools-dev # 在背景啟動 daemon + web + desktop
```

首次載入時，應用程式會偵測可用的本地 runtime，並顯示在 Settings 中設定的 BYOK runtime。選擇 runtime、design template 與 design system，輸入 prompt，然後點擊 **Send**。結構化的本地 runtime 會寫入規範專案檔案並串流傳送檔案/工具事件；檔案工作區與預覽由這些寫入更新。純文字與 BYOK 執行則回傳一個完整的 `<artifact>` 區塊供宿主解析。在記錄或修改任何 artifact 儲存路徑之前，必須閱讀儲存庫根目錄 `AGENTS.md` 中的 **Daemon data directory contract**。

**Design systems** 目錄直接從 [`design-systems/`](../../design-systems/) 下的 `DESIGN.md` 套件載入。選擇任意一套，即可將該品牌的視覺語言套用到 artifact。

**Templates** 目錄來自 [`design-templates/`](../../design-templates/)，依原型、deck、文件、圖像、影片與音訊等 artifact 格式組織。[`skills/`](../../skills/) 則保留給 agent 在工作過程中呼叫的功能性能力。將 template 與 design system 組合使用，即可產出採用所選視覺語言的 artifact。

## 其他腳本

```bash
pnpm tools-dev                 # 在背景啟動 daemon + web + desktop
pnpm tools-dev start web       # 在背景啟動 daemon + web
pnpm tools-dev run web         # 在前景啟動 daemon + web（e2e / dev server）
pnpm tools-dev restart         # 重新啟動 daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # 檢查受管理的 runtime 狀態
pnpm tools-dev logs            # 查看 daemon / web / desktop 日誌
pnpm tools-dev check           # 查看 status + 最近日誌 + 常見診斷
pnpm tools-dev stop            # 停止受管理的 runtime
pnpm --filter @open-design/daemon build  # 建置 apps/daemon/dist/cli.js，供 `od` 使用
pnpm --filter @open-design/web build     # 在需要時建置 web package
pnpm typecheck                 # 對整個 workspace 執行 typecheck
```

`pnpm tools-dev` 是本地生命週期的唯一入口。請勿再使用已被移除的頂層歷史別名（`pnpm dev`、`pnpm dev:all`、`pnpm daemon`、`pnpm preview`、`pnpm start`）。

本地開發時，`tools-dev` 會先啟動 daemon，並將其連接埠傳遞給 `apps/web`，`apps/web/next.config.ts` 會將 `/api/*`、`/artifacts/*`、`/frames/*` 重寫到該 daemon 連接埠，從而使 App Router 能夠與相鄰的 Express 行程通訊，無需設定 CORS。

## Docker 部署

在一個完全容器化的環境中執行 Open Design，無需安裝 Node.js 或 pnpm。

### 環境需求

* Docker Desktop
* Docker Compose v2

驗證 Docker 是否正確安裝：

```bash
docker compose version
```

---

## 啟動 Open Design

從倉庫根目錄開始：

1. 進入 deploy 目錄並複製環境設定範本：

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. 產生安全令牌：

   ```bash
   openssl rand -hex 32
   ```

3. 用編輯器開啟 `.env`，找到 `OD_API_TOKEN=`，將產生的令牌貼上。

然後啟動服務：

```bash
docker compose up -d
```

在瀏覽器中開啟應用：

```text
http://localhost:7456
```

首次啟動可能需要幾秒鐘，Docker 會拉取最新映像檔。

---

## 常用 Docker 指令

### 檢視日誌

```bash
docker compose logs -f
```

### 重新啟動容器

```bash
docker compose restart
```

### 停止容器

```bash
docker compose down
```

### 拉取最新映像檔

```bash
docker compose pull
docker compose up -d
```

### 刪除所有本地應用資料

```bash
docker compose down -v
```

---

## 環境設定

建立 `deploy/.env` 檔案來覆蓋預設設定。從提供的範例開始：

```bash
cp deploy/.env.example deploy/.env
```

編輯 `deploy/.env` 來設定你的令牌並調整其他值：

```env
# 主機暴露的埠號
OPEN_DESIGN_PORT=7456

# 容器記憶體限制
OPEN_DESIGN_MEM_LIMIT=384m

# 允許的 CORS 來源
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker 映像檔標籤
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

# Daemon 安全所需的 API 令牌
# 使用以下命令產生：openssl rand -hex 32
OD_API_TOKEN=
```

---

## 持久化儲存

在記錄、修改或選擇任何持久 daemon 儲存路徑之前，
必須閱讀儲存庫根目錄 `AGENTS.md` 中的 **Daemon data directory contract**。
本 Quickstart 不得重述該契約，也不得定義儲存路徑。

---

## 注意事項

* Docker 模式非常適合不想在本機安裝 Node.js 或 pnpm 的貢獻者。
* 容器直接在連接埠 `7456` 上暴露生產環境的 daemon 建置。
* 如需開發工作流程和進階本機設定，請參閱本快速入門指南的其餘部分。

---

## 媒體生成 / agent dispatcher 問題排除

Image、video、audio、HyperFrames 等 skill 在透過 daemon 啟動 agent 時，會注入環境變數以呼叫本地 `od` CLI：

- `OD_BIN` —— `apps/daemon/dist/cli.js` 的絕對路徑。
- `OD_DAEMON_URL` —— 目前執行的 daemon URL。
- `OD_PROJECT_ID` —— 目前啟用的專案 id。
- `OD_PROJECT_DIR` —— 目前啟用專案的檔案目錄。

若媒體生成發生錯誤 `OD_BIN: parameter not set`、提示找不到 `apps/daemon/dist/cli.js`、或出現 `failed to reach daemon at http://127.0.0.1:0`，請重新建置 daemon CLI 並重新啟動受管理的 runtime：

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

隨後，在 Open Design 應用程式中**重新開啟**該專案，請勿重複使用先前 terminal 中的 agent 會話。由 daemon 啟動的 agent 應當能夠看到類似如下的值：

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` 必須為真實的 daemon 連接埠，例如 `http://127.0.0.1:7457`，而非 `http://127.0.0.1:0`。`:0` 僅是內部用於「自動選擇可用連接埠」的啟動佔位值，不應洩漏到 agent 會話中。

僅執行 daemon 的生產模式下，daemon 會自行在 `http://localhost:7456` 提供 Next.js 的靜態匯出產物，不經過反向代理。

若在 daemon 前部署了 nginx，請關閉 SSE 路由的 buffering 與壓縮。常見問題：瀏覽器控制台在 80-90 秒後顯示錯誤 `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)`——原因是 nginx 的 `gzip on` 會緩衝分塊的 SSE 回應，即使 daemon 已傳送 `X-Accel-Buffering: no`。

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

## 兩種執行模式

| 模式 | picker 中的值 | 請求流轉路徑 |
|---|---|---|
| **Local CLI**（daemon 偵測到 agent 時的預設模式） | "Local CLI" | 前端 → daemon `/api/chat` → `spawn(<agent>, ...)` → 結構化工具/檔案事件經 SSE 傳輸 → 專案檔案 → 預覽。plain-stream CLI 改走 text-artifact 路徑。 |
| **API 模式**（fallback / 未安裝 CLI） | "Anthropic API" / "OpenAI API" / "Atlas Cloud" / "Azure OpenAI" / "Google Gemini" | 前端 → daemon `/api/proxy/{provider}/stream` → provider SSE 歸一化為 `delta/end/error` → `<artifact>` 解析器 → 預覽 |

兩種模式最終進入同一個檔案工作區與沙箱預覽，但交付契約不同。具備檔案系統能力的 runtime 寫入規範檔案，不應在 `<artifact>` 中重複原始碼；plain/純文字與 BYOK 執行沒有檔案工具，其規範交付物是 `<artifact>` 中的完整 HTML。執行 profile 由 runtime transport 決定。

## Prompt 組合

每次 send 時，應用程式都會從三層建構 system prompt，然後傳送至 provider：

```
BASE_SYSTEM_PROMPT   （按執行 profile 採用檔案或 <artifact> 交付）
   + 目前啟用的 design system 正文  （DESIGN.md —— 色板 / 字型 / 版面配置）
   + 目前啟用的 skill 正文          （SKILL.md —— 工作流與輸出規則）
```

在頂部 bar 切換 skill 或 design system 後，下一次 send 將使用新的組合。正文會按 session 在記憶體中快取，每次切換僅需從 daemon 獲取一次。

## 檔案結構

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express —— 啟動本地 agent + 提供 API
│   │   └── src/
│   │       ├── cli.ts             # `od` bin 入口
│   │       ├── server.ts          # /api/* + 靜態資源
│   │       ├── agents.ts          # runtime 模組的相容性匯出
│   │       ├── runtimes/
│   │       │   ├── registry.ts    # 支援的 runtime registry
│   │       │   └── defs/          # 各 runtime 的啟動與參數定義
│   │       ├── skills.ts          # SKILL.md loader（frontmatter 解析器）
│   │       └── design-systems/    # DESIGN.md loader 與服務
│   │   ├── sidecar/           # tools-dev daemon sidecar 包裝層
│   │   └── tests/             # daemon 包的測試
│   ├── web/                   # Next.js 16 App Router + React 客戶端
│       ├── app/               # App Router 入口
│       ├── src/               # React + TypeScript 客戶端 / runtime 模組
│       │   ├── App.tsx        # 調度 mode / skill / DS picker + send
│       │   ├── providers/     # daemon + BYOK API transport
│       │   ├── prompts/       # system、discovery、directions、deck framework
│       │   ├── artifacts/     # text-artifact 解析 + artifact manifest
│       │   ├── runtime/       # iframe srcdoc、markdown、export 輔助函數
│       │   └── state/         # localStorage + 由 daemon 持久化的專案狀態
│       ├── sidecar/           # tools-dev web sidecar 包裝層
│       └── next.config.ts     # tools-dev rewrites + 生產環境 apps/web/out 匯出配置
│   └── desktop/               # Electron runtime，由 tools-dev 啟動 / 檢查
├── packages/
│   ├── contracts/             # 共享的 web/daemon 應用程式契約
│   ├── sidecar-proto/         # Open Design sidecar 協定契約
│   ├── sidecar/               # 通用 sidecar runtime 原語
│   └── platform/              # 通用 process/platform 原語
├── tools/dev/                 # `pnpm tools-dev` 生命週期與 inspect CLI
├── e2e/                       # Playwright UI + 外部整合 / Vitest 測試場
├── skills/                    # agent 在工作過程中呼叫的功能性能力
├── design-templates/          # 原型、deck、文件與媒體的渲染目錄
├── design-systems/            # 以 DESIGN.md 為基礎的品牌套件
├── scripts/sync-design-systems.ts    # 從上游 getdesign tarball 重新匯入
├── docs/                      # 產品願景 + spec
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # 頂層品質腳本 + `od` bin
```

## 排障

- **"no agents found on PATH"** —— 安裝 [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) 中註冊的任一本地 runtime，確認 daemon 能找到其執行檔，然後在 **Settings → Execution mode** 中執行 **Rescan**；也可以在 Settings 中設定 BYOK runtime。
- **daemon 在 /api/chat 上返回 500** —— 查看 daemon 終端機的 stderr 尾部；通常是 CLI 拒絕了傳入的參數。不同 CLI 的 argv 結構各異；如需調整，請查看 `apps/daemon/src/runtimes/defs/` 中對應的定義。
- **媒體生成發生錯誤，`OD_BIN` 缺失、或 daemon URL 為 `:0`** —— 執行上述媒體 dispatcher 問題排除步驟。請勿重複使用既有的 CLI 會話；從 Open Design 應用程式中重新開啟專案，daemon 才會注入新的 `OD_*` 變數。
- **Codex 載入的插件上下文過多** —— 使用 `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` 啟動 Open Design，daemon 啟動 Codex 時會傳入 `--disable plugins`。
- **artifact 始終不渲染** —— 先確認本次執行的交付 profile。對於具備檔案系統能力的本地 runtime，檢查 agent 是否建立了可預覽的專案檔案、檔案事件是否抵達 daemon；此路徑不應把原始碼放進 `<artifact>`。對於 plain/純文字或 BYOK 執行，檢查是否存在一個完整的 `<artifact>` 區塊，並在 daemon 日誌中定位第一處失敗邊界。

## 回到產品願景

本 Quickstart 對應 [`docs/`](../../docs/) 中 spec 的可執行起點；spec 描述了其演進方向（見 [`docs/roadmap.md`](../../docs/roadmap.md)）。要點如下：

- `docs/architecture.md` 描述了目前這套已交付的 stack：前端為 Next.js 16 App Router，後端為本地 daemon；`apps/web/next.config.ts` 在 dev 模式下進行 rewrite，使瀏覽器始終透過同一套 `/api` 入口通訊。
- `docs/skills-protocol.md` 描述目前的 `SKILL.md`/`od:` frontmatter，以及功能性 skill 與渲染範本的分離。`apps/daemon/src/skills.ts` 中的解析與正規化邏輯是實作層事實來源。
- `docs/agent-adapters.md` 描述 adapter contract。各 runtime 的啟動、參數、模型與 stream 設定位於 `apps/daemon/src/runtimes/defs/`，並在 `apps/daemon/src/runtimes/registry.ts` 中註冊；`apps/daemon/src/agents.ts` 是相容性匯出層。
- `docs/modes.md` 區分六個 New Project 頁籤與七個正規化 registry mode（`prototype`、`deck`、`template`、`design-system`、`image`、`video`、`audio`）。
