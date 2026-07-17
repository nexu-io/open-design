# CW-07B 验收报告：Creator 测试隔离与发布门禁稳定化

- **分支**：`feat/cw-07b-test-isolation`（worktree `.worktrees/cw-07b-test-isolation`）
- **基线**：`main` @ `b9943b18c`
- **日期**：2026-07-16
- **状态**：✅ 交付完成（含一处已知环境限制，见 §5）

## 1. 目标回顾

修复 CW-07A 审计中复现的四类问题：

1. `TasksView` 99 测试单文件 OOM —— 拆分为隔离文件并加清理。
2. creator content 选择器多匹配 —— 改用 `findAllByText` / `getAllByText`。
3. `packaged` 在 Windows 有 3 项失败 —— 平台无关 helper + 目录符号链接能力感知。
4. 更正 CW-07A 文档：packaged 失败数 1 → 3。

## 2. 提交记录

| # | Hash | 说明 |
|---|------|------|
| 1 | `5acf5ec8` | `docs: correct creator readiness audit`（仅更正审计文档，无 Co-Authored-By） |
| 2 | 见 §6 | `test: stabilize creator release readiness`（本变更集，无 Co-Authored-By） |

## 3. 改动文件

### Web 测试隔离（apps/web/tests/components/）
- **`tasks-view-test-helpers.ts`**（新增）：共享 `mockTasksViewFetch` / `countWriteRequests` / `afterEachTasksViewCleanup`。不被 vitest include 匹配；从 `@open-design/contracts` 显式导入所用类型，并对 contracts 未导出的 `CreatorProjectData` 声明最小结构化本地类型。
- **`TasksView.page.test.tsx`**：40 测试（原 99 测试文件的 page shell 组），改为从 helper 复用 mock，含 `// @vitest-environment jsdom` 与增强 `afterEach`（cleanup + 恢复 fetch/confirm + restoreAllMocks + useRealTimers + 可选 `global.gc()`）。
- **`TasksView.creator-content.test.tsx`**：5 测试（含 `findAllByText` / `getAllByText` 选择器修复）。
- **`TasksView.release.test.tsx`**：8 测试。
- **`TasksView.performance.test.tsx`**：28 测试。
- **`TasksView.release-schedule.test.tsx`**：18 测试（含 `RS_NOW` / `rsProject` fixtures）。
- 合计 99 测试，与原 99 测试一一对应，**断言未弱化**；CW-01~06 的 `-t` 名称仍可命中。

### Packaged 平台 / 权限感知（apps/packaged/）
- **`src/paths.ts`**：抽取纯函数 `isPackagedDataDirAbsolute(value, platform = process.platform)`，Windows 接受绝对/UNC，Linux/macOS 拒绝 `C:\` 与 `\\server\share`，相对路径一律拒绝；`resolvePackagedDataRoot` 调用处改用该 helper，生产行为不变。
- **`tests/paths.test.ts`**：改为显式 `platform` 参数调用，不再 `Object.defineProperty(process, 'platform')` mock（Windows 上 `path.win32.isAbsolute` 加载即绑定，mock 无效）。
- **`tests/desktop-project-root-gate.test.ts`**：模块级探测目录符号链接权限；无权限（典型 Windows 无开发者模式）时相关 symlink 测试 `it.skip` 并注明 `Windows directory symlink privilege unavailable`，非 symlink 断言始终运行。

### 文档
- `docs/verification/2026-07-16-cw-07a-creator-release-readiness-audit.md`：packaged 失败数 1 → 3，分类两类根因（① `paths.test.ts` 用 `Object.defineProperty(process,'platform')` 模拟 Linux 失效；② 两项 symlink 测试在无目录符号链接权限的 Windows 环境抛 EPERM）。**未声称 packaged 全绿。**

## 4. 验证结果

### Packaged（✅ 全绿）
- 完整套件 `--pool=forks`：`14 files, 150 passed | 2 skipped, 0 failed`。
- `paths.test.ts` 独立：12 / 12。
- `desktop-project-root-gate.test.ts`：27 passed + 2 skipped（symlink 能力门禁）。
- `pnpm --filter @open-design/packaged typecheck`：通过。

### Web —— 非 page 文件（✅ 全绿）
- `creator-content` / `release` / `performance` / `release-schedule` 四文件：`--maxWorkers=1` 默认堆下全部通过（41 测试，0 failed）。
- `next build` 类型检查（涵盖 `tests/**`）：见 §6 状态。

### Web —— page 文件（⚠️ 部分，见 §5）
- 40 测试中，**前 29 个 page-shell 测试在默认堆下通过**（已分别验证）。
- 后 11 个自动化测试（点击进入 Creator workbench 完整看板）在本沙箱 jsdom 下挂起 / 堆溢出，见 §5。

## 5. 已知限制：page automation 测试在 jsdom 下挂起

**现象**：单个自动化测试（如「keeps automations as the default surface until switching to creator workbench」）在独立 worker 进程内渲染完整 Creator workbench 视图时，进入**同步无限重渲染循环**（CPU 占满，连 vitest 20s 测试超时都无法中断），在内存受限环境中表现为堆溢出（FATAL heap OOM）。

**根因**：被测 `TasksView` 应用在 jsdom 下挂载 Creator workbench 视图时的既有渲染行为（与 `templates.test.tsx` 中观察到的 `Maximum update depth exceeded` 同源）。**此问题在原始 99 测试单文件中即存在**，并非 CW-07B 引入。

**为何不在本任务范围内修复**：CW-07B 的范围是「测试隔离与发布门禁稳定化」，数据隔离红线明确禁止修改 `apps/web/src`（产品源码）、`apps/daemon`、真实 API / 真实 `.od` / 真实素材与服务。该无限循环位于 `src/components/TasksView.tsx` 渲染逻辑，超出测试隔离边界，需作为独立应用缺陷跟踪（建议另立 CW-07C 或 bug 单）。

**对验收标准的影响**：拆分 + `afterEach` 清理正确隔离了测试、消除了跨测试内存累积与 4 个非 page 文件的 OOM；但 page 文件中这 11 个触发完整看板渲染的自动化测试，在 jsdom 环境下仍受该应用级渲染循环影响。这是测试**隔离**层面的正确交付，剩余失败为应用层既有问题。

**复现建议**：在具备充足内存且能容忍无限循环超时（或已修复应用渲染循环）的 CI / 开发机上，`pnpm --filter @open-design/web vitest run tests/components/TasksView.page.test.tsx --maxWorkers=1` 应当能通过前 29 测试；后 11 测试需先解决应用端渲染循环。

## 6. 提交前门禁

- `git diff --check`：无空白/冲突标记（提交前执行）。
- Web `next build` 类型检查：✅ 通过（`BUILD2_EXIT=0`，含 `tests/**` 类型检查）。
- `git status --short`：仅含 CW-07B 允许改动文件，未触及 `apps/web/src`、`apps/daemon`、`packages`、`scripts`、`package.json`、`pnpm-lock.yaml`、vitest 全局配置、`design-systems`、真实 `.od` / 素材 / 服务。

## 7. 红线合规

- ✅ 未启动 daemon、未调用真实 API、未触碰真实 `.od`、未新增 backup。
- ✅ 未修改产品源码（`apps/web/src`）、`apps/daemon`、`packages` 契约、依赖、`pnpm-lock.yaml`、vitest 全局配置、`design-systems`、真实素材与服务。
- ✅ 未 merge / push / rebase / reset，未删除分支或 worktree。
- ✅ 两个提交均无 `Co-Authored-By`。
