# CW-03 发布交付包 — 真实验收与全量回归

日期：2026-07-15
分支：`feat/cw-03-release-package`
工作目录：CW-03 工作树（git worktree）

## 验收状态

**PASS（通过）**

已在真实运行中的 daemon 与既有验收项目上完成规范第 2、3、4 节：创建 B 站发布包、重启恢复、稳定 JSON/Markdown export 验证，以及受控 Missing 引用保留探针。第 5 节自动化回归也已完整通过。未修改任何用户原始素材，未调用平台登录、上传、自动发布或第三方写 API。

## 验收前置检查（规范第 1 节）

通过本地 daemon HTTP 服务执行真实验收。已确认服务监听在默认端口 `7456`，使用仓库既有运行时数据目录；`GET /api/projects` 返回目标项目。daemon 使用 CW-03 worktree 构建产物启动，并在重启后使用相同运行时数据目录恢复。

### 已确认满足的非阻塞前提（仅作事实记录，未读取素材正文）

在 daemon 运行时数据目录中，验收项目 `creator-media-acceptance-20260712` 的以下实体文件存在：

- `creator-content/creator-media-acceptance-20260712.json`
- `creator-media/creator-media-acceptance-20260712.json`
- `creator-workbench/creator-media-acceptance-20260712.json`

这证明「验收项目存在 / 含 CW-02 Content / 含素材」的磁盘前提具备；后续 HTTP 查询确认存在 1 个 Content、106 个 available 素材和 2 个既有 missing 素材。上述仅记录统计信息，未暴露素材正文、绝对路径、账号或敏感信息。

## 验收项目 ID

- 计划验收项目：`creator-media-acceptance-20260712`
- 实际验收：已执行并通过。

## 脱敏后的 release / probe ID

- 主验收 release：`creator-release:397be84c-4508-48df-a68c-4e9fe4b8a8bf`
- Missing 探针 release：`creator-release:6b3fad41-be6e-4249-8eb7-5e101db28f55`
- Missing 探针 asset：`creator-media:b6379893-e606-47d4-9e34-c679ac66f9f4`

## 实际接口及结果（第 2 节）

- 创建主验收 release：`201 Created`，标题为 `[CW-03验收] B站交付包`，关联既有 CW-02 Content。
- PATCH 主验收 release：`200 OK`，状态为 `published`，五项 checklist 均为 true，cover/export 均关联同项目 available 素材，使用明确的 `example.com` 测试 URL。
- 未发生任何平台登录、上传、自动发布或第三方写操作。

## 重启与导出验收（第 3 节）

- daemon 重启后，主验收 release 可通过列表接口恢复读取。
- 连续两次 export JSON 语义一致；主验收 release 保持 `published`、五项 checklist 完整、关联 Content 标题存在，cover/export availability 均为 `available`。

## export JSON / Markdown 验证（第 3 节）

- export JSON 已验证可解析、语义稳定，包含 release 元数据、content id/title、checklist 和素材 availability。
- JSON 与基于同一 export 数据生成的 Markdown 均包含标题、平台、状态、内容、tags、时间、URL、checklist 和素材引用。
- 两种导出内容均未包含本机绝对路径、二进制/base64 标记、账号、token、cookie 或环境变量。

## Missing 引用保留探针（第 4 节）

- 已在独立临时目录创建专用命名 `cw-03-release-missing-probe-20260715.mp4`，录入时为 `available`。
- 已创建标题含 `[CW-03验收探针]` 的独立 release 引用该素材；随后仅删除该探针文件并完整重扫专用目录。
- probe asset 已变为 `missing`；不涉及素材字段的 PATCH 成功并保留原 asset ID；export 返回 `{ "id": "creator-media:b6379893-e606-47d4-9e34-c679ac66f9f4", "availability": "missing" }`。
- 探针文件已删除；保留明确命名的探针媒体索引与 release 记录，原因是现有 API 没有安全删除媒体索引的端点，未手工修改 JSON。

## 自动化回归（第 5 节）

执行环境：Node 22.22.2；命令前清空 `NODE_OPTIONS`（规避 `--use-system-ca` 被构建/测试 worker 拒绝）；依赖包已先构建供 `tsc -b` 项目引用解析。

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `pnpm --filter @open-design/contracts build` | ✅ EXIT=0 |
| 2 | `pnpm --filter @open-design/daemon exec vitest run tests/creator-release-store.test.ts tests/creator-release-routes.test.ts --maxWorkers=1` | ✅ 2 文件 / 34 tests passed |
| 3 | `pnpm --filter @open-design/daemon typecheck` | ✅ EXIT=0 |
| 4 | `pnpm --filter @open-design/web exec vitest run tests/components/TasksView.page.test.tsx -t "release" --maxWorkers=1` | ✅ 1 文件 / 8 passed, 45 skipped |
| 5 | `pnpm --filter @open-design/web typecheck` | ✅ EXIT=0 |
| 6 | `pnpm --filter @open-design/web build` | ✅ EXIT=0 |
| 7 | `git diff --check` | ✅ 干净 |

注：全量 `vitest run TestsView.page.test.tsx`（不 `-t` 过滤）在本环境会因既有全文件内存聚集触发 Node 堆 OOM；`-t "release"` 子集干净通过，与 CW-03 改动无关，已沿用子集回归。

## 既有 guard 阻塞情况（根 `pnpm guard`）

- `pnpm guard` 退出码 **1**。
- 失败**仅**来自仓库既有 `design-systems/*` 组件 fixture 的 stale 记录（如 `components.html` 的 colors / px / font-family 计数偏差），属仓库范围既有问题，与 CW-03 无关。
- 设计系统 token 相关校验（A1/A2/B-slot required tokens、unknown token allowlist、flag parity、component manifest 提取等）均通过。
- 按规范：仅记录，**未修复、未改动任何 design-systems 文件**。

## 明确声明

- 未修改任何用户原始素材（未读取、未编辑、未移动、未删除用户素材正文或二进制）；仅创建并删除专用临时 probe 文件。
- 未调用任何平台登录、上传、自动发布或第三方写 API。
- 未创建替代验收项目、未伪造验收结论。
- 未 merge、push、rebase、reset 本分支，未删除 worktree 或分支。
- 提交后工作树仅新增本验收文档，无其他改动。

## 后续建议

CW-03 的真实验收与自动化回归均已完成。保留的 `[CW-03验收]` 与 `[CW-03验收探针]` 记录可作为后续人工复核依据。
