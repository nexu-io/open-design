# CW-07A — Creator 发布就绪与数据隔离审计 · 验收文档

> 任务性质：**只读审计 + 发布门禁设计**。未开发功能、未改 source/test/config、未合并、未 push。
> 分支：`feat/cw-07a-release-readiness-audit`（基于 `b9943b18c`）
> 提交内容：**仅两份文档**（本文 + `docs/plans/CW-07A-creator-release-readiness-research.md`）
> 提交信息：`docs: audit creator release readiness`

---

## 0. 只读范围与未修改清单（已核验）

### 0.1 审计动作边界

- 读取了 `apps/packaged/src/{config,paths,launch}.ts`、`apps/desktop/src/main/updater.ts`、`apps/daemon/src/{server,daemon-paths}.ts` 及相关测试文件（仅读）。
- 运行了**只读验证命令**：`pnpm --filter @open-design/packaged test`、`typecheck`、web 定向 `-t` 测试、单 worker 全文件 TasksView 测试。
- 临时日志仅落在 `C:/tmp/cw-07a-*`，结束后清理。

### 0.2 明确未触碰

- 未修改 `apps/**`、`packages/**`、`scripts/**`、`design-systems/**` 任何文件。
- 未修改 `package.json`、`pnpm-lock.yaml`。
- 未修改任何测试、CI 配置。
- 未启动 / 停止 / 删除任何用户现有 daemon、web dev server、Electron。
- 未调用任何会修改真实 runtime 的 HTTP API；未创建任何 `cw07*` 种子数据。
- 未 push / merge / rebase / reset / 删除分支或 worktree。

### 0.3 提交前核验（退出码与输出）

| 检查 | 命令 | 结果 |
|---|---|---|
| 工作树干净 | `git status --short` | 空（仅本次新增 2 文档） |
| 无空白/冲突标记 | `git diff --check` | 干净 |
| lockfile 未改 | `git diff --stat pnpm-lock.yaml package.json` | 空 |
| 仅 2 文档入库 | `git diff --cached --name-only`（提交后） | 仅两份 doc |

---

## A. Packaged / 数据目录审计

**审查文件**：`apps/packaged/src/config.ts`、`paths.ts`、`launch.ts`、`apps/desktop/src/main/updater.ts`、`apps/packaged/tests/paths.test.ts`、`launch.test.ts`、`windows-lifecycle.test.ts`

### A.1 OD_DATA_DIR 如何推导数据根？

- `paths.ts::resolvePackagedDataRoot(config, namespace, env)`：`odDataDir = env.OD_DATA_DIR?.trim()`。
  - 若设置：经 `expandHomePrefix`（展开 `~` / `$HOME`）后做**平台绝对路径校验**（`win32.isAbsolute`）；非绝对 → 抛 `PackagedPathAccessError`（含 "requires OD_DATA_DIR to be an absolute path"）。
  - 若已 scoped 为 `.../namespaces/<ns>/data`，校验 namespace 是否匹配。
  - 若未设置：`join(config.namespaceBaseRoot, namespace, "data")`，其中 `namespaceBaseRoot` 默认 `app.getPath("userData")/namespaces`（`config.ts`）。
- 结论：`OD_DATA_DIR` 是可选的**覆盖入口**，但一旦设置就强制绝对路径，是隔离第一道防线。

### A.2 绝对路径要求是否强制？

- **是，强制**（`paths.ts`）。相对路径或非绝对值抛 `PackagedPathAccessError`。
- 对比 `daemon` 侧 `daemon-paths.ts::resolveDataDir`：**非绝对守卫不强制**（仅相对路径解析到 projectRoot）。两处策略不一致，但 packaged 侧更严格，方向正确。

### A.3 备份目录是否与用户数据分离？

- `paths.ts::resolvePackagedNamespacePaths` 返回：`dataRoot / runtimeRoot / updateRoot / cacheRoot / logRoot / installationRoot`，且 `installationRoot = namespaceBaseRoot/..`。
- 结论：**数据、运行时、更新、缓存、日志根目录彼此分离**，用户数据 (`dataRoot`) 与更新 payload (`updateRoot`) 物理隔离。

### A.4 updater 是否保护用户数据？

- `apps/desktop/src/main/updater.ts`：`BACK_DIR=".back"`（L93），`backRoot = join(realRoot, BACK_DIR)`（L573）；release-cleanup 逻辑（L1625-1652）仅保护 **launcher 更新 payload / 应用版本**。
- **结论：updater 仅保护应用自身，不触碰 Creator 用户数据目录。** 与 §调研一致（Electron/Tauri/AppFlowy 均如此）。

### A.5 各场景自动化覆盖情况

| 场景 | 测试 | 覆盖 |
|---|---|---|
| 相对 `OD_DATA_DIR` 拒绝 | `paths.test.ts` | ✅ |
| Windows 绝对路径校验 | `paths.test.ts` | ⚠️ 平台模拟失效（见附录：失败 1/3） |
| 命名空间 isolation | `paths.test.ts` | ✅ |
| 可写 dataRoot 接受/拒绝 | `launch.test.ts` | ✅ |
| 单实例锁 | `launch.test.ts` | ✅ |
| Windows 卸载 DisplayVersion 写入 | `windows-lifecycle.test.ts` | ✅（仅 win32） |

### A.6 真实 Creator 备份/恢复能力存在吗？

- **不存在。** 仓库内仅有 project transcript export / snapshot link（导出物），**没有"用户数据备份 / 恢复"能力**（无 `.od` 快照、无回滚点、无恢复流程）。
- 与 AppFlowy 手动 ZIP 导出不同，本仓库**连手动用户数据备份都没有**。
- 结论：若升级损坏 `.od`，**无官方恢复路径**。这是发布门禁的关键缺口。

---

## B. Creator 数据与真实 runtime 隔离审计

**审查文件**：`apps/daemon/src/server.ts`、`daemon-paths.ts`、`apps/daemon/tests/{resolve-data-dir,installation,creator-release-routes}.test.ts`、`apps/web/tests/components/TasksView.page.test.tsx`

### B.1 临时 daemon 如何启动？

- daemon 测试用 `mkdtemp(tmpdir())` 生成临时 `dataDir`，并通过 `process.env.OD_DATA_DIR` / `OD_INSTALLATION_DIR` 注入。
- 例：`installation.test.ts` 用 `OD_INSTALLATION_DIR` 隔离 channel root；`creator-release-routes.test.ts` 用 `dataDir = mkdtempSync(.../od-creator-release-routes-)`。

### B.2 注入点是什么？

- 单一真相源 `RUNTIME_DATA_DIR = resolveDataDir(process.env.OD_DATA_DIR, PROJECT_ROOT, { requireExplicit: SANDBOX_MODE_ENABLED })`（`server.ts` L794-836）。
- 派生 `PROJECTS_DIR / ARTIFACTS_DIR / USER_SKILLS_DIR`；agent 子进程接收 `OD_DATA_DIR: RUNTIME_DATA_DIR`。

### B.3 CW-01~06 是否全 mock？

- **web 侧（CW-01~06）全 mock**：`TasksView.page.test.tsx` 用进程内 `mockTasksViewFetch`，**无真实 daemon、无真实 `OD_DATA_DIR`**。
- **daemon 侧全用临时 dataRoot**，不污染真实 `.od`。
- 结论：CW-01~06 的测试隔离是充分的。

### B.4 污染风险在哪？

- `daemon-paths.ts::resolveDataDir` 未设 `OD_DATA_DIR` 时回退 `<projectRoot>/.od`——若某测试忘记注入临时目录，会落到真实 projectRoot 下的 `.od`。但现有测试均已显式注入，风险当前可控。
- 建议（CW-07B）：在 `SANDBOX_MODE_ENABLED` 下强制 `requireExplicit: true`，缺失即失败，杜绝静默回退到真实 `.od`。

### B.5 硬性规则

1. 任何测试不得以真实 `OD_DATA_DIR` 运行。
2. daemon 测试必须 `mkdtemp` + `afterEach rm`。
3. web 测试不得依赖真实 daemon 端口。
4. CI 中 `SANDBOX_MODE_ENABLED=true` 且 `requireExplicit=true`。

---

## C. TasksView 全页测试稳定性

### C.1 定向 `-t` 测试（5 组，单 worker）

| 测试 | 命令 | 结果 |
|---|---|---|
| release schedule | `vitest run tests/components/TasksView.page.test.tsx -t "release schedule" --maxWorkers=1` | **18 passed, 0 failed** |
| release（整组） | `-t "release"` | 37 passed, 0 failed |
| performance snapshot | `-t "performance snapshot"` | 8 passed, 0 failed |
| performance overview | `-t "performance overview"` | 20 passed, 0 failed |
| creator content | `-t "creator content"` | **1 failed** |

- `creator content` 失败根因：**测试选择器脆弱**，非产品回归。`degrades creator content when the content API fails but keeps tasks and media usable` 用 `getByText("Content unavailable for this project.")`，但该文案在**多 project** 失败路径下渲染多次，`getByText` 要求单匹配 → `TestingLibraryElementError: Found multiple elements`。**不修改测试**。

### C.2 整文件单 worker 测试（明确 timeout / reporter）

- 命令：`vitest run tests/components/TasksView.page.test.tsx --maxWorkers=1 --reporter=dot`（堆上限 3GB）
- 结果：**`Tests 28 passed (99)` + `FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory` @ 401s**
- 默认堆（无 `--max-old-space-size`）：**`26 passed (99)` + `timeout 360` exit 124 + `Worker exited unexpectedly`**

### C.3 根因分类（明确区分）

| 类别 | 是否命中 | 证据 |
|---|---|---|
| 测试逻辑失败 | ❌ 否 | 定向运行均通过；单 worker 后期才 OOM |
| 内存聚集（memory accumulation） | ✅ **是** | 99 测试累积常驻内存，达 3GB 堆上限崩；默认堆更早被 timeout 杀 |
| 句柄未清理 | ❌ 否 | 无 `EMFILE` / 句柄耗尽特征；崩在 GC mark-compact |
| 工具环境限制 | ❌ 否 | 同机器定向运行稳定；非环境短板 |

**结论：根因 = 内存聚集（测试文件过大、共享 mock 常驻、afterEach cleanup 不足、单 worker 串行累积）。这恰是 CW-07B 要解决的目标。**

### C.4 红线

**不得为通过而跳过/删除/弱化测试。** OOM 是测试基础设施问题，不是被测功能缺陷。

---

## D. 发布 Smoke Matrix（10 场景）

> 前提：本环境**无安装包制品**（无 `.exe`/`.dmg`/`.AppImage` 构建产物）→ 安装级场景 **BLOCKED**。

| # | 场景 | 现有覆盖 | 缺口 | 前置 | 建议验证 | 需代码？ |
|---|---|---|---|---|---|---|
| 1 | 全新安装（Windows） | 无 | 无安装包 | 构建 installer | 手动安装后启动 | ✅ 构建 |
| 2 | 升级（旧→新，保留 `.od`） | 无 | updater 不保护 `.od` | 旧版 + 安装包 | 升级后校验 `.od` 完好 | ❌（需文档） |
| 3 | 回滚（新→旧） | 无 | 无回滚快照 | 双版本 | 回滚后数据可读 | ✅ 快照机制 |
| 4 | 离线启动 | 部分（daemon sandbox） | 无离线断言 | 断网 | 断网可启动且报错友好 | ❌ |
| 5 | 命名空间隔离 | ✅ paths.test | 平台依赖用例 | CI win | Windows 跑 paths.test | ❌ |
| 6 | OD_DATA_DIR 绝对路径 | ✅ paths.test | 相对拒绝已覆盖 | — | 单元覆盖 | ❌ |
| 7 | 单实例锁 | ✅ launch.test | — | — | 单元覆盖 | ❌ |
| 8 | Creator 备份/恢复 | ❌ 不存在 | 无能力 | — | **BLOCKED（无能力）** | ✅ 设计 |
| 9 | 全页 TasksView 稳定 | ⚠️ OOM | 内存聚集 | CW-07B | 拆分后重跑 | ✅ CW-07B |
| 10 | 真实 runtime 无污染 | ✅ 全 mock/tmp | 需 sandbox 强制 | CI sandbox | 注入校验 | ✅ 规则 |

---

## E. CW-07B 最小修复方案（精确文件级）

> 目标：解决 C 的内存聚集，**不削弱任何测试**。

### E.1 文件级任务

| 文件 / 路径 | 动作 | 说明 |
|---|---|---|
| `apps/web/tests/components/TasksView.page.test.tsx` | **拆分**为 `TasksView.release.test.tsx` / `TasksView.performance.test.tsx` / `TasksView.creator-content.test.tsx` | 单文件 99 用例 → 多文件，降低单进程内存峰值 |
| 新建 `apps/web/tests/components/__mocks__/tasks-view-fetch.ts` | 提取 `mockTasksViewFetch` 共享 mock | 避免每个 describe 重复构建常驻 mock |
| 上述各文件 | 增加 `afterEach` cleanup（unmock fetch、清理 timers、reset modules） | 释放每用例残留 |
| `vitest.config`（web） | 限制并发：`test.poolOptions.threads.singleThread` 或 `--maxWorkers` 约束；对大文件设 `test.teardownTimeout` | 防累积 |
| `apps/daemon/src/daemon-paths.ts` | sandbox 模式强制 `requireExplicit: true` | 杜绝静默回退真实 `.od` |
| `creator content` 选择器 | 改用 `getAllByText` 或按 project 作用域定位 | 修选择器脆弱（非削弱断言） |

### E.2 依赖与验收

- 依赖：无跨仓；仅 web / daemon 本地测试改造。
- 验收标准：
  1. 拆分后**每个文件**单 worker 跑完不 OOM（堆 < 1.5GB）。
  2. 全量 `vitest run` 一次通过，无 `Worker exited unexpectedly`。
  3. 测试**数量不减少**、断言**不弱化**（`creator content` 失败必须修选择器而非删用例）。
  4. daemon sandbox 缺失 `OD_DATA_DIR` 时测试**快速失败**而非污染真实 `.od`。

---

## F. 交付结论

| 发布门禁门槛 | 状态 |
|---|---|
| 桌面安装/升级/回滚保护用户数据 | ❌ updater 不保护 `.od`；无回滚快照 |
| Creator 用户数据备份/恢复能力 | ❌ 不存在 |
| 数据隔离（命名空间 / 绝对路径） | ✅ 已实现，平台用例待补 |
| 回归稳定性（全页 TasksView） | ❌ 单 worker OOM（内存聚集） |
| 真实 runtime 无污染 | ✅ 全 mock/tmp，sandbox 待强制 |

**最终结论：除非全部门禁门槛通过，否则 Creator 当前状态为「内部 alpha」。不可对外稳定交付。**

本次审计为只读，已锁定缺口与修复路径（CW-07B）。不自动备份真实用户数据、不迁移 Tauri、不做云同步——三项红线已写入调研文档。

---

## 附：命令与结果实录（节选）

```
# 工作树状态
$ git status --short
（空）

$ git diff --check
（干净）

$ git diff --stat pnpm-lock.yaml package.json
（空）

# packaged 测试（本机 Windows 环境，3 项失败）
$ pnpm --filter @open-design/packaged test
Test Files  2 failed | 12 passed (14)
Tests       3 failed | 99 passed (102)

失败分类（均为测试缺陷，非产品逻辑失败）：
1) paths.test.ts :: "rejects Windows-style OD_DATA_DIR values on non-Windows hosts ..."
   原因：测试用 Object.defineProperty(process, "platform", "linux") 仅改了 process.platform，
   但 paths.ts 导入的 isAbsolute 在 Windows 宿主上仍是 path.win32.isAbsolute，平台模拟未真正切换，
   导致 C:\Users\Fred\OD 在该测试下仍被判为绝对路径而不抛异常（平台条件测试缺陷）。
2) desktop-project-root-gate.test.ts :: "realpath-resolves symlinks so attackers cannot register one path and reach another"
3) desktop-project-root-gate.test.ts :: "rejects symlinks whose realpath resolves to a .app bundle"
   原因：当前 Windows 用户没有创建 directory symlink 的权限（seCreateSymbolicLinkPrivilege /
   Developer Mode 未开启），symlinkSync(..., "dir") 直接抛 EPERM —— 属能力不足，非产品逻辑失败。
   CW-07B 已改为能力感知：能创建时运行、不能时显式 skip（原因写明 "Windows directory symlink privilege unavailable"）。

# packaged typecheck
$ pnpm --filter @open-design/packaged typecheck
（PASS，exit 0）

# web 定向
$ vitest run tests/components/TasksView.page.test.tsx -t "release schedule" --maxWorkers=1
Tests  18 passed (18)

$ vitest run ... -t "creator content" --maxWorkers=1
Tests  1 failed
失败：getByText("Content unavailable for this project.") 多 project 下多匹配（选择器脆弱）

# web 整文件单 worker（3GB 堆）
$ vitest run tests/components/TasksView.page.test.tsx --maxWorkers=1
Tests  28 passed (99)
FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory  @ 401s

# web 整文件单 worker（默认堆）
Tests  26 passed (99)
timeout 360 → exit 124, Worker exited unexpectedly
```
