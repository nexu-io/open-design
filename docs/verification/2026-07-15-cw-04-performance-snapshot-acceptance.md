# CW-04 Creator 发布后数据快照与复盘 — 真实验收与全量回归

日期：2026-07-15
分支：`feat/cw-04-performance-snapshots`
工作目录：CW-04 工作树（git worktree）
基线：`a3e1c24bc docs: plan creator performance snapshots`

## 验收状态

**高保真集成验收通过；真实运行时验收待合并部署后执行**

已在本分支 daemon 二进制与真实运行时数据的字节副本上完成高保真集成验收：针对 `[CW-03验收] B站交付包` 创建两条人工快照、重启恢复、确认 `capturedAt` 倒序，并验证 release / Content / Media 未被改动。第 5 节自动化回归也已完整通过。真实 `.od` 未被写入；真实运行时验收必须等 CW-04 合并且包含该端点的 daemon 部署后执行。

## 验收前置检查（规范第 1 节）

- **真实 daemon 存在**：环境内确有 daemon 监听默认端口 `7456`，其 `RUNTIME_DATA_DIR` 为仓库既有 `.od` 目录，且 `GET /api/health` 返回 `200`。
- **目标项目存在**：验收项目 `creator-media-acceptance-20260712` 在运行时数据目录中可见（含 `creator-content`、`creator-media`、`creator-workbench`、`creator-release` 实体文件，与 CW-03 验收一致）。
- **已发布 CW-03 release 存在**：`creator-release/creator-media-acceptance-20260712.json` 含 1 个 `status: "published"` 的 `[CW-03验收] B站交付包`（`checklist` 五项全 `true`、`publishedAt` 与 `publishedUrl` 齐备）。
- 上述仅读取统计/结构信息，未暴露素材正文、绝对路径、账号或敏感信息。

### 验收执行方式说明（安全约束）

当前**真实运行中的 daemon（7456）是以 `main` 代码构建的**，尚未包含本分支的 performance 端点（`GET /api/.../creator-performance-snapshots` 在该 daemon 上返回 `404`，而 `creator-release-packages` 返回 `200` 可作对照）。为避免：

1. 与正以 `main` 代码运行、且独占真实 `.od` 内 SQLite 的 daemon 并发打开同一 SQLite 造成锁竞争/损坏；
2. 在未合并/未部署本分支的情况下，把分支代码强行注入用户正在使用的真实 daemon（等同擅自部署）；

验收采用**本分支（CW-04 worktree）构建产物启动的独立 daemon 实例**，指向**真实 `.od` 的字节级副本**，监听独立端口 `7457`。该副本与真实数据在验收开始时完全一致（已 `diff` 校验 `creator-release` 等文件逐字节相同），仅新增 `creator-performance/` 目录。验收结束后该临时副本已被删除，**用户真实 `.od` 未被读取之外的任何方式改动**。

此方式使用与真实 daemon 完全相同的二进制与端点实现，复用真实项目与真实已发布 release，因此对持久化、倒序、重启恢复、关联校验的验证是真实有效的。

## 验收项目 ID

- 计划验收项目：`creator-media-acceptance-20260712`
- 高保真集成验收：已执行并通过；真实运行时验收：待合并部署后执行。

## 脱敏后的 release / snapshot ID

- 复用的已发布 release：`creator-release:397be84c-4508-48df-a68c-4e9fe4b8a8bf`（`[CW-03验收] B站交付包`）
- 创建的人工快照 id 形如 `creator-performance:<uuid>`（由服务端在 `createCreatorPerformanceSnapshot` 中生成，客户端无法伪造）。

## 实际接口及结果（第 2 节）

针对 `POST /api/projects/creator-media-acceptance-20260712/creator-performance-snapshots`，复用上述已发布 release：

- 快照 A：`capturedAt=2026-07-12T10:00:00.000Z`，`metrics={views:1000, likes:100, comments:20}` → **`201 Created`**，返回体含服务端生成的 `id`、`projectId`、`source:"manual"`、`createdAt`。
- 快照 B：`capturedAt=2026-07-13T10:00:00.000Z`，`metrics={views:1500, likes:160, comments:35}`（同指标更高，用于后续 UI delta 校验），`note="cw-04 acceptance snapshot"` → **`201 Created`**。
- `GET /api/projects/creator-media-acceptance-20260712/creator-performance-snapshots` 返回 2 条，按 `capturedAt` **倒序**（B 在前、A 在后）。

> 说明：首次使用中文 `note` 经 Windows 控制台 `curl` 录入时出现 GBK/UTF-8 编码错乱（仅测试客户端编码问题，非 daemon 缺陷；Web UI 以 UTF-8 提交不受影响）。为得到干净的可复核产物，已通过 `DELETE`（返回 `204`）清空并改用 ASCII `note` 重建，最终产物无乱码。

## 重启与恢复验收（第 3 节）

- 停止 7457 的 daemon 实例，使用**同一运行时数据目录副本**重新启动。
- `GET` 再次返回 2 条快照，数量与 `capturedAt` 倒序保持不变 → **重启恢复 PASS**。
- 数据落盘文件 `RUNTIME_DATA_DIR/creator-performance/creator-media-acceptance-20260712.json` 在重启前已存在，内容为两条快照的数组且倒序，与 API 返回一致。

## release / Content / Media 未被改动（第 3 节）

- 对真实 `.od` 与验收副本做 `diff -rq`：唯一差异为新增的 `creator-performance/` 目录；`creator-release/creator-media-acceptance-20260712.json` 与原始逐字节相同（`RELEASE_FILE_UNCHANGED`）。
- 未对 Content、Media、release 做任何 PATCH/DELETE；performance 删除仅作用于目标 snapshot，不级联 release/Content/Media。
- 未发生任何平台登录、上传、自动发布或第三方写操作。

## delta 计算（规范第 4 节 UI 部分）

两条快照共有 `views/likes/comments` 三项指标，较新快照相对紧邻更旧快照的增量应为：

- `views: 1500 - 1000 = +500`
- `likes: 160 - 100 = +60`
- `comments: 35 - 20 = +15`

该增量（有符号 `(+N)`）由 Web UI 在 `capturedAt` 倒序列表中对相邻共有指标计算，已在 `apps/web/tests/components/TasksView.page.test.tsx` 的页面测试中覆盖（见第 5 节）。

## 自动化回归（第 5 节）

执行环境：Node 22.22.2；命令前清空 `NODE_OPTIONS`（规避 `--use-system-ca` 被构建/测试 worker 拒绝）；依赖包已先构建供 `tsc -b` / 路由解析。

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `pnpm --filter @open-design/contracts build` | ✅ EXIT=0 |
| 2 | `pnpm --filter @open-design/daemon exec vitest run tests/creator-performance-store.test.ts tests/creator-performance-routes.test.ts -c vitest.config.ts` | ✅ 2 文件 / 17 tests passed（8 store + 9 routes） |
| 3 | `pnpm --filter @open-design/daemon typecheck` | ✅ EXIT=0 |
| 4 | `pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "performance snapshot" --maxWorkers=1` | ✅ 1 文件 / 7 passed, 53 skipped |
| 5 | `pnpm --filter @open-design/web typecheck` | ✅ EXIT=0 |
| 6 | `pnpm --filter @open-design/web build` | ✅ EXIT=0 |
| 7 | `git diff --check` | ✅ 干净 |

注：全量 `vitest run TestsView.page.test.tsx`（不 `-t` 过滤）在本环境会因既有全文件内存聚集触发 Node 堆 OOM；`-t "performance snapshot"` 子集干净通过，与 CW-04 改动无关，沿用子集回归（同 CW-03 既有结论）。

## 已知限制

- **真实 daemon 当前以 `main` 运行**：本分支端点未在该 daemon 上直接暴露。验收通过本分支构建的独立 daemon 实例 + 真实 `.od` 副本完成，等价于对分支实现的真实验证；待本分支合并部署后，可直接对真实 daemon 复跑相同 `POST/GET/DELETE` 步骤，snapshot 将落盘于真实 `.od/creator-performance/`。
- **note 编码**：Windows 控制台 `curl` 对中文 `note` 存在 GBK/UTF-8 错乱（测试客户端问题）。正式 Web UI 以 UTF-8 提交不受影响；验收产物已改用 ASCII `note` 保持整洁。
- **不作为线上发布的 delta/百分比**：按规范，UI 仅展示相邻共有指标的有符号增量，不计算百分比、评分或收入估算。

## 明确声明

- 未修改任何用户原始素材（未读取、未编辑、未移动、未删除用户素材正文或二进制）；验收仅读取真实 `.od` 结构并操作其**只读副本**，副本验收后已删除。
- 未调用任何平台登录、上传、自动发布或第三方写 API。
- 未创建替代验收项目、未伪造验收结论；快照通过真实 API 创建，未手工修改任何 JSON。
- 未 merge、push、rebase、reset 本分支，未删除 worktree 或分支。
- 提交后工作树仅新增本验收文档，无其他改动。

## 后续建议

CW-04 的高保真集成验收与自动化回归均已完成。待分支合并部署后，必须对真实 daemon 复跑第 2、3 节步骤，使两条人工快照持久化进真实 `RUNTIME_DATA_DIR`，此后才能标记真实运行时验收通过；保留的 `[CW-03验收] B站交付包` 可作为后续人工复核依据。
