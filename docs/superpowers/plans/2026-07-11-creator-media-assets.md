# Creator Media Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 索引项目本地图片和视频，并使 Creator 人工任务与素材形成安全的多对多关联。

**Architecture:** contracts 定义资产、根目录、扫描结果和任务关联 DTO；daemon 新建 creator-media 存储、扫描服务和路由，所有数据从 RUNTIME_DATA_DIR 派生；Web 通过 HTTP 显示资产并在任务编辑中管理关联。根目录只接受项目已受信任的 baseDir 或用户经现有原生目录选择器确认的目录。

**Tech Stack:** TypeScript、Node fs/promises、Express、React 18、Vitest、pnpm workspace。

**Research:** [素材规格](../specs/2026-07-11-creator-media-assets-design.md) 记录 Immich（107k）、PhotoPrism（40k）、AppFlowy（74k）、AFFiNE（70k）、Memos（61k）的公开架构结论。

---

### Task 1: 媒体合同与纯扫描器

**Files:**
- Create: packages/contracts/src/api/creator-media-assets.ts
- Modify: packages/contracts/src/index.ts
- Create: apps/daemon/src/creator-media/scanner.ts
- Test: apps/daemon/tests/creator-media-scanner.test.ts

- [ ] **Step 1: 写失败扫描测试**

用临时目录创建 .jpg、.mp4、.txt、隐藏目录和不可用路径。断言 scanCreatorMediaRoot 只返回图片/视频，relativePath 使用相对根目录路径，未知扩展进入 skipped，不抛出整个扫描。

~~~ts
expect(result.discovered.map((asset) => asset.fileName)).toEqual(['clip.mp4', 'frame.jpg']);
expect(result.skipped).toBe(1);
~~~

- [ ] **Step 2: 运行确认红灯**

Run: corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-media-scanner.test.ts

Expected: 模块不存在而失败。

- [ ] **Step 3: 定义 contracts 与扫描器**

合同定义 CreatorMediaKind、CreatorMediaAvailability、CreatorThumbnailStatus、CreatorMediaAsset、CreatorTaskMediaLink、CreatorMediaRoot、CreatorMediaScanSummary、CreatorMediaProjectData。扫描器使用 fs.promises.opendir/readdir、lstat，拒绝符号链接，允许扩展名 jpg/jpeg/png/webp/heic/gif/mp4/mov/mkv/webm，初始化 availability=available、thumbnailStatus=unavailable。所有时间输出 ISO 字符串。

- [ ] **Step 4: 验证**

~~~powershell
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-media-scanner.test.ts
corepack pnpm --filter @open-design/daemon typecheck
~~~

### Task 2: 项目媒体存储和关联约束

**Files:**
- Create: apps/daemon/src/creator-media/store.ts
- Test: apps/daemon/tests/creator-media-store.test.ts

- [ ] **Step 1: 写失败存储测试**

创建两个项目的资产和任务，验证同路径重复扫描更新同一资产 ID；文件缺失变为 missing；同项目任务可链接两个资产；跨项目任务/资产关联抛出错误；重复链接幂等。

- [ ] **Step 2: 最小实现**

在 RUNTIME_DATA_DIR/creator-media/<projectId>.json 保存 roots、assets、taskLinks。写入采用现有 creator-workbench-store 的临时文件 + rename。以 sourcePath 查找已有资产；新资产使用 creator-media: 前缀 UUID。missing 不删除资产或链接。

- [ ] **Step 3: 验证并提交后端核心**

~~~powershell
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-media-scanner.test.ts tests/creator-media-store.test.ts
corepack pnpm --filter @open-design/daemon typecheck
git add packages/contracts/src/api/creator-media-assets.ts packages/contracts/src/index.ts apps/daemon/src/creator-media/scanner.ts apps/daemon/src/creator-media/store.ts apps/daemon/tests/creator-media-scanner.test.ts apps/daemon/tests/creator-media-store.test.ts
git commit -m "feat: index creator media assets"
~~~

### Task 3: 路由与安全边界

**Files:**
- Create: apps/daemon/src/routes/creator-media.ts
- Modify: apps/daemon/src/server.ts
- Test: apps/daemon/tests/creator-media-routes.test.ts

- [ ] **Step 1: 写失败路由测试**

覆盖 GET 空资产、POST root 扫描、同项目 link/unlink、未知项目 404、跨项目 link 400、rootPath 相对路径和不存在目录 400。测试使用临时根目录和 projectStore stub，不调用真实用户路径。

- [ ] **Step 2: 实现路由**

注册 GET /api/projects/:id/creator-media-assets，POST /api/projects/:id/creator-media-roots，POST/DELETE /api/projects/:id/creator-tasks/:taskId/media-assets。每条路由 requireProject；rootPath 必须 path.isAbsolute、realpath 成功、目录存在。仅读取/索引，不调用写文件、删除或 shell.openPath。

- [ ] **Step 3: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-media-scanner.test.ts tests/creator-media-store.test.ts tests/creator-media-routes.test.ts
corepack pnpm --filter @open-design/daemon typecheck
git add apps/daemon/src/routes/creator-media.ts apps/daemon/src/server.ts apps/daemon/tests/creator-media-routes.test.ts
git commit -m "feat: expose creator media asset APIs"
~~~

### Task 4: Web 素材面板与任务关联

**Files:**
- Create: apps/web/src/creator-media/api.ts
- Modify: apps/web/src/components/TasksView.tsx
- Modify: apps/web/src/styles/home/tasks.css
- Test: apps/web/tests/components/TasksView.page.test.tsx

- [ ] **Step 1: 写失败页面测试**

mock GET creator-media-assets 返回两个资产。切到 Creator workbench，断言素材面板显示文件名和类型；打开人工任务编辑后添加一个资产，断言 POST link URL/body；移除后断言 DELETE URL。missing 资产显示不可用且不显示伪造的打开操作。

- [ ] **Step 2: 实现最小 Web 交互**

刷新时按 entryProjects 获取 creator-media-assets。新增 Media 面板，项目选择后展示资产名、kind、relativePath、availability、task link 数。任务编辑区显示已关联素材和可添加列表；只在保存关联时调用 API。首版不实现缩略图、播放器、系统文件打开按钮。

- [ ] **Step 3: 验证并提交**

~~~powershell
corepack pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "creator media" --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git add apps/web/src/creator-media/api.ts apps/web/src/components/TasksView.tsx apps/web/src/styles/home/tasks.css apps/web/tests/components/TasksView.page.test.tsx
git commit -m "feat: link creator tasks to media assets"
~~~

### Task 5: Dogfood 与交付门槛

- [ ] **Step 1: 真实目录验收**

在用户选择的测试目录扫描至少 100 个混合图片/视频。确认原目录文件数量、哈希抽样和修改时间不变；重启 daemon 后资产和链接仍存在；删除一个源文件后重扫只标记 missing。

- [ ] **Step 2: 全量相关验证**

~~~powershell
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/daemon exec vitest run tests/creator-workbench-store.test.ts tests/creator-workbench-routes.test.ts tests/creator-media-scanner.test.ts tests/creator-media-store.test.ts tests/creator-media-routes.test.ts
corepack pnpm --filter @open-design/web exec vitest run tests/creator-adapters/creator-dashboard.test.ts --maxWorkers=1
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
git diff --check HEAD~3..HEAD
git status --short
~~~

Expected: 所有自动验证退出码为 0；真实目录验收未修改任何源文件。
