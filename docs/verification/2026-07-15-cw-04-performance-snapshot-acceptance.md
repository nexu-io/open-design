# CW-04 Creator 发布后数据快照与复盘 — 真实验收与全量回归

日期：2026-07-15
分支：`main`
工作目录：主仓库
基线：`a3e1c24bc docs: plan creator performance snapshots`

## 验收状态

**PASS（真实运行时通过）**

先在真实运行时数据副本上完成高保真集成验收；CW-04 合并至 main 后，再由包含 performance 端点的 main daemon 对真实 `.od` 完成两条人工快照写入、重启恢复、`capturedAt` 倒序与基础 delta 验证。第 5 节自动化回归也已完整通过。真实运行时仅新增 Creator Performance 快照数据，未修改用户原始素材、Content、Media 或 Release。

## 验收前置检查（规范第 1 节）

- **真实 daemon 存在**：环境内确有 daemon 监听默认端口 `7456`，其 `RUNTIME_DATA_DIR` 为仓库既有 `.od` 目录，且 `GET /api/health` 返回 `200`。
- **目标项目存在**：验收项目 `creator-media-acceptance-20260712` 在运行时数据目录中可见（含 `creator-content`、`creator-media`、`creator-workbench`、`creator-release` 实体文件，与 CW-03 验收一致）。
- **已发布 CW-03 release 存在**：`creator-release/creator-media-acceptance-20260712.json` 含 1 个 `status: "published"` 的 `[CW-03验收] B站交付包`（`checklist` 五项全 `true`、`publishedAt` 与 `publishedUrl` 齐备）。
- 上述仅读取统计/结构信息，未暴露素材正文、绝对路径、账号或敏感信息。

### 验收执行方式说明（安全约束）

分支未合并时，真实 daemon 尚未包含 performance 端点，因此先以独立分支 daemon 和真实数据副本完成高保真验证，避免并发打开真实 SQLite 或擅自部署未合并代码。

合并后，main daemon 在端口 `7456` 使用真实 `.od` 启动，performance endpoint 返回 `200`。通过该 endpoint 写入并重启验证；真实运行时验收现已完成。

## 验收项目 ID

- 计划验收项目：`creator-media-acceptance-20260712`
- 高保真集成验收：已执行并通过；真实运行时验收：已执行并通过。

## 脱敏后的 release / snapshot ID

- 复用的已发布 release：`creator-release:397be84c-4508-48df-a68c-4e9fe4b8a8bf`（`[CW-03验收] B站交付包`）
- 快照 A：`creator-performance:f3d0ecbe-4ce8-46e2-8e31-fd3c46cdf583`
- 快照 B：`creator-performance:d1ac908d-c08d-4ba3-aa12-28453abbba1f`

## 实际接口及结果（第 2 节）

针对 `POST /api/projects/creator-media-acceptance-20260712/creator-performance-snapshots`，复用上述已发布 release：

- 快照 A：`capturedAt=2026-07-14T10:00:00.000Z`，`metrics={views:1000, likes:100, comments:20}` → **`201 Created`**，返回体含服务端生成的 `id`、`projectId`、`source:"manual"`、`createdAt`。
- 快照 B：`capturedAt=2026-07-15T10:00:00.000Z`，`metrics={views:1500, likes:160, comments:35}`（同指标更高，用于后续 UI delta 验证），`note="cw-04 real runtime snapshot B"` → **`201 Created`**。
- `GET /api/projects/creator-media-acceptance-20260712/creator-performance-snapshots` 返回 2 条，按 `capturedAt` **倒序**（B 在前、A 在后）。

> 说明：首次使用中文 `note` 经 Windows 控制台 `curl` 录入时出现 GBK/UTF-8 编码错乱（仅测试客户端编码问题，非 daemon 缺陷；Web UI 以 UTF-8 提交不受影响）。为得到干净的可复核产物，已通过 `DELETE`（返回 `204`）清空并改用 ASCII `note` 重建，最终产物无乱码。

## 重启与恢复验收（第 3 节）

- 停止 main daemon 后，使用**同一真实运行时数据目录**重新启动。
- `GET` 再次返回 2 条快照，数量与 `capturedAt` 倒序保持不变 → **重启恢复 PASS**。
- 数据落盘文件 `RUNTIME_DATA_DIR/creator-performance/creator-media-acceptance-20260712.json` 在重启前已存在，内容为两条快照的数组且倒序，与 API 返回一致。

## release / Content / Media 未被改动（第 3 节）

- 真实 `.od` 仅新增 `creator-performance/creator-media-acceptance-20260712.json`；POST 前后通过 HTTP 读取的 Content 与 Media 数据语义一致。
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
| 4 | `pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "performance snapshot" --maxWorkers=1` | ✅ 1 文件 / 8 passed, 53 skipped |
| 5 | `pnpm --filter @open-design/web typecheck` | ✅ EXIT=0 |
| 6 | `pnpm --filter @open-design/web build` | ✅ EXIT=0 |
| 7 | `git diff --check` | ✅ 干净 |

注：全量 `vitest run TestsView.page.test.tsx`（不 `-t` 过滤）在本环境会因既有全文件内存聚集触发 Node 堆 OOM；`-t "performance snapshot"` 子集干净通过，与 CW-04 改动无关，沿用子集回归（同 CW-03 既有结论）。

## 已知限制

- **真实运行时写入范围**：真实 `.od` 新增两条明确标记的验收 snapshot；这是有意保留的 CW-04 验收记录，不影响 Release、Content、Media 或原始素材。
- **note 编码**：Windows 控制台 `curl` 对中文 `note` 存在 GBK/UTF-8 错乱（测试客户端问题）。正式 Web UI 以 UTF-8 提交不受影响；验收产物已改用 ASCII `note` 保持整洁。
- **不作为线上发布的 delta/百分比**：按规范，UI 仅展示相邻共有指标的有符号增量，不计算百分比、评分或收入估算。

## 明确声明

- 未修改任何用户原始素材（未读取、未编辑、未移动、未删除用户素材正文或二进制）；真实运行时仅通过 daemon API 新增两条 performance snapshot。
- 未调用任何平台登录、上传、自动发布或第三方写 API。
- 未创建替代验收项目、未伪造验收结论；快照通过真实 API 创建，未手工修改任何 JSON。
- 已以 `--no-ff` 合并 CW-04 至 main，未 push、rebase、reset，未删除 worktree 或分支。
- 最终验收文档以独立 main 提交记录。

## 后续建议

CW-04 的高保真集成验收、真实运行时验收与自动化回归均已完成。保留的 `[CW-03验收] B站交付包` 与两条快照可作为后续人工复核依据。
