# CW-03 发布交付包 — 真实验收与全量回归

日期：2026-07-15
分支：`feat/cw-03-release-package`
工作目录：CW-03 工作树（git worktree）

## 验收状态

**BLOCKED（阻塞）**

真实验收（规范第 2、3、4 节）未执行。根因见下文「验收前置检查」。本任务严格遵守规范边界：未创建替代项目、未伪造结论、未启动/替代 daemon、未修改任何用户原始素材、未调用任何平台发布或第三方写操作。第 5 节自动化回归已完整执行并通过。

## 验收前置检查（规范第 1 节）

通过「现有的 daemon HTTP 服务」执行真实验收，前置条件之一是确认 daemon 正在运行并能确认其真实运行时数据目录。本环境检查结果：

- 默认 daemon 端口（7456）无响应，`HTTP 000`。
- 系统中无正在运行的 Node/daemon 进程（已排查监听端口对应的进程，均为无关第三方桌面应用，非 Open Design daemon）。
- 未设置 `OD_DAEMON_URL`、`OD_SIDECAR_IPC_PATH` 等可发现 daemon 的环境变量。
- 因此无法确认任何「正在运行的 daemon HTTP 服务」，也无法确认其真实 `RUNTIME_DATA_DIR`。

依据规范第 1 节「若 daemon 未运行……停止真实验收；不创建替代项目；不伪造结论；在验收文档和回传中标记 BLOCKED，精确说明阻塞原因；仍执行第 5 节自动化回归」，本回传标记 **BLOCKED**。

### 已确认满足的非阻塞前提（仅作事实记录，未读取素材正文）

在 daemon 运行时数据目录中，验收项目 `creator-media-acceptance-20260712` 的以下实体文件存在：

- `creator-content/creator-media-acceptance-20260712.json`
- `creator-media/creator-media-acceptance-20260712.json`
- `creator-workbench/creator-media-acceptance-20260712.json`

这证明「验收项目存在 / 含 CW-02 Content / 含素材」的磁盘前提已具备。一旦 daemon 在同样的数据目录下运行，规范第 2、3、4 节的真实验收即可开展。上述仅记录文件标识，未暴露任何素材正文、绝对路径、账号或敏感信息。

## 验收项目 ID

- 计划验收项目：`creator-media-acceptance-20260712`
- 实际验收：未执行（BLOCKED）。

## 脱敏后的 release / probe ID

- 未创建任何 release 或探针（probe）实体。无 ID 可报告。

## 实际接口及结果（第 2 节）

- 未执行 `POST /api/projects/creator-media-acceptance-20260712/creator-release-packages`。
- 未执行 `PATCH .../creator-release-packages/:releaseId`。
- 原因：无可达的 daemon HTTP 服务。

## 重启与导出验收（第 3 节）

- 不适用。未执行 daemon 重启、列表复核或 `export` 接口调用。
- 明确声明：本次未对 daemon 运行时数据做任何写入、未触发任何重启导致的状态变更。

## export JSON / Markdown 验证（第 3 节）

- 不适用。未生成 export JSON / Markdown。
- 未做「两次 export 语义一致 / 不含本机绝对路径、素材二进制、账号、token、cookie、环境变量」的核验（因无 export 数据）。

## Missing 引用保留探针（第 4 节）

- 未执行。未创建探针临时目录、未创建探针素材、未创建引用探针的 release、未做 missing 转换与保留核验。
- 原因：同上，无可达 daemon HTTP 服务；且本任务边界禁止手工编辑 daemon JSON 绕过 API。
- 若后续在运行中 daemon 上补做：将使用独立临时目录（不位于用户素材目录）、专用命名 `cw-03-release-missing-probe-20260715.mp4`、release 标题含 `[CW-03验收探针]`，并仅删除刚创建的探针文件后重新扫描使其 `missing`，验证列表/编辑器/导出均保留该素材 ID 且导出为 `{ "id": "<probe-asset-id>", "availability": "missing" }`。

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

- 未修改任何用户原始素材（未读取、未编辑、未移动、未删除用户素材正文或二进制）。
- 未调用任何平台登录、上传、自动发布或第三方写 API。
- 未创建替代验收项目、未伪造验收结论。
- 未 merge、push、rebase、reset 本分支，未删除 worktree 或分支。
- 提交后工作树仅新增本验收文档，无其他改动。

## 后续建议

在 daemon 实际运行的桌面/服务环境中，于同样的数据目录下重跑本验收（第 2、3、4 节）即可解除 BLOCKED；第 5 节自动化回归已通过，可独立作为合并前门禁。
