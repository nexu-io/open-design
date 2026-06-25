---
name: OD Library and Clipper
overview: 为 Open Design 新增一个全局资源库（OD Library，全系统统一资产登记中心）与 Chrome MV3 浏览器采集插件（OD Clipper）。资源库记录所有来源的资产（插件采集 / 手动上传 / Agent 任务上传或生成 / 设计系统提取），每条资产带来源标识与回链（可跳回对应 Agent 任务或设计系统），打通「采集/入库 → 可视化标记 → 语义检索 → 一键应用到设计稿 → 沉淀设计系统 → 一键产出 PPT/落地页/海报等材料」的持续积累闭环，遵循 HTTP + CLI + Web UI 三轨闭环与 daemon 数据目录契约。
todos:
  - id: phase0
    content: Phase 0 地基：在 packages/contracts/src/api/library.ts 定义 DTO（含 storage/sources/LibrarySourceKind）；在 apps/daemon/src/db.ts 新增 library_assets/library_asset_sources/library_embeddings/library_tasks/library_tokens/library_digests 表；新增 LIBRARY_DIR 解析（派生自 RUNTIME_DATA_DIR）与内容寻址存储 helper；实现集中索引函数 registerLibraryAsset（按 content_hash 幂等合并 + 追加来源）；搭建富化任务骨架（仿 media-tasks.ts）。
    status: pending
  - id: phase1
    content: Phase 1 采集→入库→语义搜索 + 统一登记中心：实现 registerLibraryRoutes 的 ingest/assets(含 sources 回链与 source/project/designSystem 过滤)/search/raw/tasks-wait + SSE；把 registerLibraryAsset 接入现有入库点（project upload/files、media generateMedia 完成、设计系统 staging），落来源标识与回链；富化管线（调色板/caption/OCR/embedding via BYOK media-config provider，缺失则降级）；od library list/get/import/search/apply CLI；apps/web 新增 Library tab（网格+过滤+语义搜索+来源徽标+跳回深链）。
    status: pending
  - id: phase2
    content: Phase 2 OD Clipper（Chrome MV3）：新建 clipper/ 子项目（background/content/popup）；浮动工具条三模式（Capture page 整页 / Select element 选元素 / 批量篮 Copy all + 打标签）；两个高价值出口——POST /api/library/capture/page（整页/区块→新建可编辑 HTML artifact project 并 open）与 /capture/compose（批量元素→合成 OD 网页 project），资源同步 registerLibraryAsset 带回链；实现配对流（/api/library/pair + confirm）与 od_library_token；扩展 origin-validation 支持持久化 extension origin allowlist；Settings → Browser Extension 配对 UI。
    status: pending
  - id: phase3
    content: Phase 3 原型增强：FileViewer srcDoc bridge 新增 Insert from Library 图片插入桥；POST /api/library/assets/:id/apply 拷贝进 project 并更新 <img src>；新增 /api/tools/library/search 与 apply（tool-token）供 chat agent 调用；skills/library-curator 技能。
    status: pending
  - id: phase4
    content: Phase 4 Brand Kit 抽取 + 设计系统：新增 brand_kits 表/profile_json + POST /api/library/brand-kits（程序化抽取 palette/typography/logo/layout/identity/images，AI 增强可选，手动采用选择）+ od brand-kit extract CLI + Brand Kit tab（对齐截图分区）；从 Brand Kit/资源库选材，扩展 DesignSystemFlow.tsx 的 SetupState 增加 From Library 选择器，选中资源经 stageAssetFiles 入 project context/，复用现有 DS 创建链由 agent 提炼 DESIGN.md/tokens。
    status: pending
  - id: phase5
    content: Phase 5 每日归档流：archived_date 归档 feed 视图 + GET /api/library/archive；新增 Daily Library Digest routine（仿 Orbit）生成日报 Live Artifact；对某天资源做语义检索拼上下文的 Q&A（复用 chat run）。
    status: pending
  - id: phase6
    content: Phase 6 Brand Kit → 一键产出 brand assets：在 Brand Kit 详情页 BRAND ASSETS 区接入一键按钮，用 Brand Kit 的设计系统 + 现有 design-templates（deck/landing/poster/newsletter/email/form）创建 project，完成持续积累→输出闭环。
    status: pending
isProject: false
---

# OD Library + OD Clipper Spec

一个持续积累的设计资源库（全局、跨项目）+ Chrome 采集插件。决策已定：Chrome MV3 优先、插件直连 daemon + 配对 token、BYOK provider 做 embedding + SQLite 存向量、完整 spec 分阶段落地。

## 1. 为什么 / 用户能看到什么

- 资源库是**全系统统一的资产登记中心**：不只是插件采集，凡是进入系统的资源都自动入库——插件采集、手动上传、Agent 任务里上传或生成的图片、设计系统提取时上传的素材，全部出现在同一个资源库。
- 每条资产带**来源标识**（clipper 采集 / 手动上传 / agent 任务 / 设计系统 / AI 生成）与**回链**：点一条资产能跳回它来源的 Agent 任务会话或设计系统；当天上传/采集形成每日归档记录。
- 用户装上 OD Clipper 后，在任意网页一键识别并高亮图片/配色/字体/区块，选中即采集入库。
- 入库时自动做可视化标记（调色板、caption、OCR、标签），之后用自然语言语义搜索；搜索结果可一键应用到设计稿，也可在任意 Agent 任务和设计系统里反向引用。
- 资源库形成每日归档（日报流），可对当天内容问答；可一键提炼设计系统，再一键产出 PPT/落地页/表单/Poster/Newsletter/Email。
- **终态形态 = Brand Kit（品牌套件）**：把一个品牌/网页抽取并聚合成结构化套件——IDENTITY / LOGO / TYPOGRAPHY / PALETTE / VOICE & TONE / IMAGERY & LAYOUT / IMAGES / 设计系统（组件 kit + tokens）/ BRAND ASSETS（Landing page、Pitch deck、Poster、Email、Newsletter、Form page）。抽取方式三选一/组合：程序化自动识别、AI 增强、用户手动选元素或整页 capture（见 §10）。

## 2. 核心架构决策

- **统一资产登记中心**：资源库是所有资产的索引层。任何现有入库点（project 上传、project 文件写入、media 生成完成、设计系统素材 staging、clipper）都通过一个集中函数 `registerLibraryAsset(...)` 登记到 `library_assets`。这是「记录所有内容」的核心机制。
- **双存储模型**：
  - **owned（自有副本）**：clipper 采集、`od library import` 等独立来源 → 存进 `LIBRARY_DIR`，内容寻址（按 hash）。
  - **referenced（索引引用）**：已存在于某 project / 设计系统目录内的文件（agent 上传/生成、DS 素材）→ 资源库只存指针（`origin_project_id` + 相对路径）+ 元信息 + embedding，不复制字节，避免重复占用。
- **去重与多来源**：按 `content_hash` 去重为一条逻辑资产；同一资产可有多条来源记录（`library_asset_sources`），所以「一张图在两个任务里都用过」会合并为一条资产 + 两条来源回链。
- **全局资源库目录**：`LIBRARY_DIR = path.join(RUNTIME_DATA_DIR, 'library')`，符合 `AGENTS.md` 数据目录契约（派生自 `RUNTIME_DATA_DIR`）。
- **数据模型**：新增 SQLite 表（`apps/daemon/src/db.ts`），不复用 `media_tasks`。
- **AI 可选、程序化入库优先**：富化分两层——
  - **程序化层（无需 AI，永远可用）**：尺寸/mime/hash、主色与调色板提取、字体栈、EXIF、来源 URL/标题/域名、纯文本/HTML 文本抽取、文件名/页面标题派生标签。仅靠这层即可入库、去重、按标签/文本/来源/日期检索。
  - **AI 增强层（配了模型才启用）**：vision caption、OCR、embedding 语义向量。
- **AI 模型配置**：复用 `media-config.json` 的 BYOK provider（OpenAI/AIHubMix），在 Settings 暴露 library 专用的 caption/OCR/embedding 模型选择（缺省继承 media providers）。未配置时这三项自动跳过，不报错。
- **语义检索**：embedding 走上面 BYOK provider 的 `/embeddings`，向量存 SQLite BLOB（float32）。MVP 用暴力余弦 topK；规模大再切 `sqlite-vec`。**无 embedding 时降级为关键词/标签/元信息检索**，UI 提示去 Settings 配置可解锁语义搜索。
- **插件鉴权**：配对码换长期 `od_library_token`；把 `chrome-extension://<id>` 注入持久化 origin allowlist（扩展 `origin-validation.ts` 的 `extraAllowedOrigins` 来源为「app-config 持久化 + OD_ALLOWED_ORIGINS」）；采集端点用新的 library-token authorizer（仿 `authorizeToolRequest`）。
- **三轨闭环**：每个能力同时落 HTTP（`apps/daemon/src/routes/library.ts`）+ CLI（`od library …`）+ Web UI（新 Library tab），DTO 先进 `packages/contracts/src/api/library.ts`。

## 3. 数据模型（`apps/daemon/src/db.ts`）

- `library_assets`：`id, kind('image'|'color'|'font'|'html'|'text'|'url'|'video'), storage('owned'|'referenced'), source_url, source_title, source_domain, captured_at, archived_date('YYYY-MM-DD'), file_path(owned 时指 LIBRARY_DIR), origin_project_id(referenced 时指 project 内相对路径配合 file_path), mime, width, height, size, content_hash, caption, ocr_text, palette_json, tags_json, metadata_json`。索引：`archived_date`、`content_hash`(去重)、`kind`、`source_domain`、`origin_project_id`。
- `library_asset_sources`（来源/回链，1 资产:多来源）：`asset_id(FK), source_kind('clipper'|'manual-upload'|'agent-task'|'design-system'|'generated'), project_id, conversation_id, run_id, design_system_id, rel_path, created_at`。驱动「跳回对应 Agent 任务/设计系统」与「当日上传记录」。
- `library_embeddings`：`asset_id(FK), model, dim, vector(BLOB), indexed_text, created_at`。
- `library_tasks`：入库后异步富化任务，分阶段且每阶段独立成功/跳过——程序化阶段（下载/规范化 → 调色板/尺寸/文本 → 标签）始终执行；AI 阶段（caption/OCR/embedding）仅在模型已配置时执行，否则标记 `skipped`。仿 `media-tasks.ts` 内存 Map + SQLite 双写 + `/wait` 长轮询。
- `library_tokens`：`token_hash, label, extension_origin, created_at, last_used_at`。
- `library_digests`：`date, project_id, artifact_path, summary` —— 每日归档 digest 产物。

## 3b. 统一入库钩子（registerLibraryAsset）

集中索引函数 `registerLibraryAsset({ kind, bytesOrPath, storage, source })`，幂等（按 `content_hash` 合并，追加 `library_asset_sources`），由以下现有入库点调用：

- `project-routes.ts` 的 `POST /api/projects/:id/upload` 与 `POST /api/projects/:id/files`（手动/agent 上传）→ source `manual-upload` 或 `agent-task`（按是否带 run/conversation 上下文判定），`storage: referenced`。
- `media.ts` `generateMedia()` 完成回调 → source `generated`，`storage: referenced`。
- 设计系统创建 staging（`stageAssetFiles` / `prepareCreatedDesignSystemProject`）→ source `design-system`，带 `design_system_id`，`storage: referenced`。
- `POST /api/library/ingest`（clipper / `od library import`）→ source `clipper`/`manual-upload`，`storage: owned`。

钩子失败不得阻断主流程（best-effort 索引 + 日志）；富化任务异步补齐元信息与 embedding。

## 4. HTTP API（`apps/daemon/src/routes/library.ts` → `registerLibraryRoutes`）

入库/管理：
- `POST /api/library/pair`（loopback-only `requireLocalDaemonRequest`，OD UI 触发，返回配对码）
- `POST /api/library/pair/confirm`（插件用配对码换 `od_library_token`，同时登记 extension origin 进 allowlist）
- `POST /api/library/ingest`（library-token 鉴权；JSON + multipart；返回 `assetId` + 富化 `taskId`）
- `POST /api/library/capture/page`（整页/区块快照 → 新建 project 的可编辑 HTML artifact，资源同步入库；返回 `projectId`）
- `POST /api/library/capture/compose`（采集篮多元素/资源 → 合成一个 OD 网页 project，按标签组织；返回 `projectId`）
- `GET /api/library/assets`（filter：kind/tag/domain/date/q/`source`/`projectId`/`designSystemId`）、`GET/DELETE /api/library/assets/:id`（详情含 `sources[]` 回链）、`GET /api/library/assets/:id/raw`
- `POST /api/library/tasks/:id/wait`（长轮询富化进度）

检索/应用：
- `POST /api/library/search`（query → embed → 余弦 topK；支持 kind/date 过滤）
- `POST /api/library/assets/:id/apply`（拷贝资源进目标 project，返回相对路径，供原型/编辑器插入）

归档/流：
- `GET /api/library/archive?date=YYYY-MM-DD`（当天资源流）
- `POST /api/library/archive/:date/digest`（生成日报 digest，走 agent）
- `GET /api/library/events`（SSE，实时入库/富化进度，复用 `createSseResponse`）

Brand Kit（详见 §10）：
- `POST /api/library/brand-kits`（从 url 或 capture 快照抽取）、`GET /api/library/brand-kits`、`GET/PATCH/DELETE /api/library/brand-kits/:id`

Agent 工具轨（tool-token，供 chat 内 agent 调用，实现「平台连通」）：
- `POST /api/tools/library/search`、`POST /api/tools/library/apply`（仿 `/api/tools/media/generate` 的 `authorizeToolRequest`）

## 5. Contracts（`packages/contracts/src/api/library.ts`）

`LibraryAsset`（含 `storage` 与 `sources[]`）、`LibraryAssetKind`、`LibraryAssetSource` + `LibrarySourceKind`、`LibraryIngestRequest/Response`、`LibrarySearchRequest/Response`、`LibraryArchiveResponse`、`LibraryPairingStart/Confirm`、`LibraryTask`、`LibraryDigest`。先行定义，daemon 与 web 共享。

## 6. CLI（`apps/daemon/src/cli.ts`，注册进 `SUBCOMMAND_MAP`）

- `od library list|get|rm`、`od library import <file|url>`、`od library ingest --json --prompt-file -`
- `od library search "<query>" [--json]`、`od library apply <assetId> --project <id>`
- `od library archive [--date]`、`od library pair`（打印配对状态/码）、`od library reindex [--assetId|--all]`（AI 模型配齐后补跑 caption/OCR/embedding）
- `od brand-kit extract <url>`、`od brand-kit list|get|rm`、`od brand-kit asset <id> --template <landing|deck|poster|email|newsletter|form>`（一键产出 brand asset）
- 全部支持 `--json` / `--daemon-url`，长文走 `--prompt-file`（复用 `readPromptFromFlags`）。

## 7. Web UI（`apps/web/src/`）

- **Library tab**（Home 视图新增，和 Projects/Design Systems 并列）：资源网格 + 过滤（kind/来源/项目/设计系统/日期）+ 顶部语义搜索框 + 每日归档时间线/日报流 + 问答入口。每张资产卡显示**来源徽标**（clipper/手动/agent/设计系统/生成）；详情面板列出 `sources[]` 并提供「跳回 Agent 任务会话 / 跳到设计系统」深链。
- **Settings → Library**：library 专用 AI 模型选择（caption/OCR/embedding，缺省继承 media providers）+ 「未配置 → 仅程序化入库/基础检索」状态提示 + 一键 reindex。
- **Settings → Browser Extension**：配对流程、token 管理、连接状态（仿 `DesignSystemsSection` 结构）。
- **原型增强 "Insert from Library"**：在 `FileViewer.tsx` 的 srcDoc bridge（`file-viewer-render-mode.ts`）新增图片插入桥；语义搜索选图 → `apply` 拷进 project → 更新 `<img src>`。
- **设计系统创建引用资源库**：扩展 `DesignSystemFlow.tsx` 的 `SetupState`，加 "From Library" 选择器，选中资源走现有 `stageAssetFiles` 入 project `context/`，再由 agent 提炼。
- **每日归档/内容流 + 问答**：归档流视图，按天分组；对某天资源用语义检索拼上下文做 Q&A（复用 chat run）。

## 8. Agent / 平台连通 + 一键产材料

- 新增 functional skill（`skills/library-curator/SKILL.md`，`od.mode: utility`）让 agent 在任务中检索/应用资源库；并在 system prompt 注明 library 工具可用。
- 每日归档 digest = 一条 `RoutineService` 定时 routine（仿 Orbit），每天汇总当天资源成 Live Artifact 日报。
- 「一键输出材料」：资源库 → 生成设计系统（复用现有 DS 创建链）→ 用现有 `design-templates/`（deck/landing/poster…）+ 该设计系统创建 project。Phase 6 只做「一键」按钮接线，渲染能力已存在。

## 9. 浏览器插件 OD Clipper（新目录 `clipper/`，Chrome MV3）

对标 Figma Chrome 扩展（截图参考：`Capture page` / `Select an element` / `Copy all` + 打标签）。页面内浮动工具条提供三个采集模式 + 两个「立马有价值」的转化出口。

- MV3：`background`（service worker，持 token、调 daemon API）、`content script`（注入浮动工具条、识别/高亮元素、序列化 DOM/CSS/资源）、`popup`（配对、最近采集、采集篮、设置 daemon URL）。
- 连接：popup 输入配对码 → 换 token；之后直连 `127.0.0.1:7456`。daemon 侧 origin allowlist 放行该扩展。
- 注：插件代码作为独立子项目（非 pnpm workspace app），不污染 daemon/web 边界；构建产物不入 git。

### 9.1 采集模式（工具条）

- **Capture page（整页）**：序列化当前页面 DOM + 内联/外链 CSS + 字体 + 图片/SVG（内联或内容寻址），打包成自包含快照。
- **Select an element（选元素）**：hover 高亮、点选某个区块，仅采集该子树 + 其样式与资源。
- **Multi-select / Copy all（批量篮）**：跨页持续把多个 element/asset 加入「采集篮」，每个可打标签（仿 Figma 的 "Pick some tags"），最后一键 `Copy all` 批量入库 + 转化。

### 9.2 高价值转化出口（采集后一键转成 OD）

- **出口 A：整页/区块 → 可编辑的 OD 页面**：采集的快照经 `POST /api/library/capture/page` 落地为一个新 project 的 HTML artifact（可编辑原型），自动 open 进编辑器；页面里的图片/字体等资源同步 `registerLibraryAsset`（source `clipper`）。用户/agent 可立即在上面增改（复用现有 HTML artifact 编辑 + srcDoc 桥 + agent surgical edit）。这是「把我喜欢的页面一键变成 OD 界面，并在上面快速编辑」。
- **出口 B：批量 element/asset → 合成一个 OD 网页**：采集篮里的多个元素/资源经 `POST /api/library/capture/compose` 生成一个新 OD 网页 project——把选中的 block/图片按标签组织成一张可编辑画布/落地页骨架，资源全部入库并带回链。这是「批量采集多个 asset/element → 转成 OD 网页」。

### 9.3 落地复用

- 两个出口都落到现有「project + HTML artifact + 编辑器」体系，不新造编辑器；clipper 只负责采集与规范化，转化在 daemon 侧完成。
- 整页快照规范化（内联资源、去脚本、保留结构与样式）放 daemon 的 capture 处理器（可后续接入 agent 做语义化清洗/重排）。

## 10. Brand Kit（品牌套件）— 统一抽取与聚合

Brand Kit 是资源库 + 设计系统 + 生成材料的**统一聚合实体与 UI 终态**（见截图：左侧按品牌/域名列出，右侧分区展示）。一个 Brand Kit 绑定一个来源品牌（域名/URL 或手动），聚合：抽取出的品牌属性 + 关联的 library 资产（logo 变体、images）+ 由此生成的设计系统（DESIGN.md/tokens）+ 一键产出的 brand assets。

### 10.1 实现取向：复用设计系统，叠加品牌层

- Brand Kit **不另起一套设计系统引擎**：底层视觉规则仍落在现有 `design-systems`（`DESIGN.md` 的章节已覆盖 palette/typography/voice/imagery），Brand Kit 在其上叠加 `brand profile`（结构化抽取字段）+ library 资产关联 + 生成材料索引。
- 新增 `brand_kits` 表（或扩展 user design system `metadata.json`）：`id, name, source_domain, source_url, design_system_id, profile_json, created_at`。`profile_json` 存结构化抽取结果（identity/logo 变体/typography/palette 角色/voice tags + use·avoid/imagery rules/layout posture）。
- 关联资产经 `library_asset_sources`（source `design-system` 或新 `brand-kit`）回链到该 Brand Kit。

### 10.2 三种抽取方式（对应「程序化 / AI / 手动」）

- **程序化自动识别（无需 AI，永远可用）**：从 DOM/CSS/meta 直接抽取——
  - PALETTE：computed colors 频次聚类 + CSS 变量 + 主色。
  - TYPOGRAPHY：`font-family` 栈、`@font-face`、display/body/mono 分层。
  - LOGO：`favicon` / `apple-touch-icon` / `og:image` / header 内 svg·img 启发式，多变体收集。
  - LAYOUT posture：`border-radius`、间距、`max-width`、栅格。
  - IDENTITY/meta：`<title>`、`meta description`、`og:*`、域名。
  - IMAGES：页面 `img` / `og:image` 收集入库。
- **AI 增强（配了模型才启用）**：identity 文案、voice & tone 标签 + use·avoid、imagery & layout 规则、palette 角色命名与取舍、语义分组。未配置则这些字段留空/可手填，不阻断。
- **手动选择 / 整页 capture（用户驱动）**：用户可在 clipper 里手动选元素或 `Capture page`，也可在 Brand Kit 编辑界面挑选/增删抽取结果里要保留要用的项（哪些 logo 变体、哪些色、哪些字体、哪些图）。「程序化先识别候选 → 用户确认采用」是默认交互。

### 10.3 入口与产出

- **抽取入口**：`POST /api/library/brand-kits`（body：`{ url }` 或 capture 快照引用）→ 跑程序化抽取（+ 可选 AI）→ 生成 brand profile + 关联资产 + 草稿设计系统。对应 CLI `od brand-kit extract <url>`、Web「New Brand Kit」。
- **管理**：`GET /api/library/brand-kits`、`GET/PATCH/DELETE /api/library/brand-kits/:id`（PATCH 用于手动增删采用项）。
- **产出 brand assets**：Brand Kit 详情页「BRAND ASSETS」区的 Landing/Pitch deck/Poster/Email/Newsletter/Form 按钮 = 用该 Brand Kit 的设计系统 + 现有 `design-templates/` 一键创建 project（即 §8 的一键产材料，归到 Brand Kit 出口）。
- **Web UI**：新增 Brand Kit tab（左栏品牌列表 + New Brand Kit；右栏分区：IDENTITY/LOGO/TYPOGRAPHY/PALETTE/VOICE & TONE/IMAGERY/IMAGES/DESIGN SYSTEM 预览/BRAND ASSETS），对齐截图。

## 11. 关键风险 / 约束

- **跨域**：必须把 extension origin 纳入 allowlist；否则被 `/api` Origin 中间件 403。配对流程负责登记。
- **数据契约**：所有路径派生自 `RUNTIME_DATA_DIR`，新增表/目录不得引入 cwd 相对回退。
- **AI 缺失降级**：程序化入库与基础检索不依赖任何 AI；未配置 caption/OCR/embedding 模型时这些阶段标记 skipped，语义搜索降级为标签/文本/元信息检索，UI 提示去 Settings 配置可解锁。配置补齐后可对历史资产重跑 AI 富化（`od library reindex` / 后台补齐）。
- **测试位置**：daemon 测试入 `apps/daemon/tests/`，web 入 `apps/web/tests/`，跨边界一致性入 `e2e/tests/`，不放 `src/`。

## 12. 分阶段路线（每阶段三轨闭环 + 测试）

- Phase 0 地基：contracts + db 表（含 `library_asset_sources`）+ `LIBRARY_DIR` + `registerLibraryAsset` 集中钩子 + 富化任务骨架。
- Phase 1 采集→入库→语义搜索 + **统一入库钩子接入所有现有入库点**（project 上传/文件写入、media 生成、DS staging），来源标识与回链落库（HTTP+CLI+Library tab，先用本地 import/CLI/已有上传验证，不依赖插件）。
- Phase 2 OD Clipper（Chrome MV3）+ 配对鉴权 + origin allowlist；含工具条三模式（Capture page / Select element / 批量篮+标签）与两个高价值出口（整页→可编辑 OD 页面、批量元素→合成 OD 网页）。
- Phase 3 原型增强（Insert from Library）+ apply-to-design + agent tool 端点。
- Phase 4 Brand Kit 抽取 + 设计系统：程序化抽取（palette/typography/logo/layout/identity/images）+ 可选 AI 增强 + 手动采用选择；从 Brand Kit/资源库选材生成设计系统。`POST /api/library/brand-kits` + `od brand-kit extract` + Brand Kit tab。
- Phase 5 每日归档流 + 日报 digest routine + 问答。
- Phase 6 Brand Kit → 一键产出 brand assets（Landing/Pitch deck/Poster/Email/Newsletter/Form）按钮接线（用 Brand Kit 设计系统 + 现有 design-templates）。