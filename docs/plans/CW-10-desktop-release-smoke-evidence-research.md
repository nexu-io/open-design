# CW-10 调研：桌面真实发布 smoke 证据闭环

- 仓库：`Creator-Workbench-Next`
- 基线：`main @ 0cd3bf139`
- 分支 / worktree：`feat/cw-10-release-smoke-evidence`（独立 worktree `.worktrees/cw-10-release-smoke-evidence`）
- 上游任务：CW-09「桌面真实发布 gates」，其 G1–G5 已 PASS，G6–G10 标记为 BLOCKED（缺可机器读取、可重复的 CI 验收证据）。
- 本轮目标：补齐 G6–G10 的**可重复 CI 验收证据**，必须复用既有自建 updater / tools-pack / `release-stable` / `release-preview` / e2e `release-smoke`，**禁止引入 electron-updater 或另一套发布机制**。

---

## 1. GitHub 官方实践调研

> 用 WebSearch / WebFetch 调研高 Star 官方仓库的发布/回滚/产物证据实践（环境无 "Agent Reach" 工具，以官方文档 + 仓库为主源）。

### 1.1 electron/electron（~122k★，OpenJS Foundation）
- 官方 Windows 走 Squirrel，macOS 走 Squirrel.Mac；`autoUpdater` 通过 `RELEASES`（Windows）/ `releases.json`（macOS）发现更新。
- 官方 `update.electronjs.org` 仅对**公开 GitHub 仓库**免费、且仅支持 mac/win。
- 结论：本项目**未采用** electron 官方 autoUpdater，而是自建 `apps/desktop/src/main/updater.ts` + `tools-pack`。调研仅用于对照"官方如何保证发布可验证"——核心做法是：**发布清单（RELEASES/releases.json）带版本与校验、更新失败回退旧版本、离线可启动**。本项目的自建路径已覆盖这些语义，CW-10 仅补"CI 侧可机器读取的证据"。

### 1.2 electron-builder（~14.6k★，MIT）
- 内置 `electron-updater`，多 provider（GitHub / S3 / Generic），`publish` 配置，`--publish always|onTag`。
- 结论：**禁止引入**。本项目工具链为自建 `tools-pack` + 自建 `updater`，引入 electron-builder 的 `electron-updater` 直接违反任务约束。CW-10 全程不触碰该路径。

### 1.3 actions/upload-artifact（本仓库使用 @v7）
官方要点（与证据闭环直接相关）：
- Artifacts **不可变**，默认保留 90 天；`retention-days` 1–90 可选。
- 矩阵任务上传应用 `name` 前缀/后缀避免冲突；CI 失败也要取证用 `if: always()`。
- **关键坑（本项目已踩）**：`Cleanup workflow artifacts` 步骤在 `success()` 下调用 `cleanup-artifacts.sh` 且**未设置 `ARTIFACT_NAME_REGEX`**，脚本在正则为空时会**删除该 run 的全部 artifacts**——即现有 `open-design-release-win-e2e-report` 在发布成功后会被清掉，违反"不依赖会被成功路径清理的中间 artifact 作为唯一证据"。
- 修复方向：把该清理步骤限定为 `ARTIFACT_NAME_REGEX: "-release-assets$"`，仅删中间发布产物，保留 smoke 报告/证据/截图/日志。

---

## 2. 既有能力盘点（CW-09 已建，本轮直接复用）

| 能力 | 位置 | CW-10 用途 |
| --- | --- | --- |
| 发布 smoke 编排 | `e2e/scripts/release-smoke.ts` | 计算 artifact SHA-256、写 `release-gates-evidence.json` |
| 报告原语 | `e2e/lib/vitest/report.ts`（`createReport` / `assertRelativeReportPath`） | 证据文件落盘，路径受逃逸保护 |
| 打包 smoke 报告 | `e2e/lib/vitest/packaged-report.ts`（`createPackagedSmokeReport` / `saveSummary`） | 扩展写 `release-gates-partial.json` |
| Windows 真机 smoke | `e2e/specs/win.spec.ts`（`describe.skip` 除非 `process.platform==='win32'`） | 采集 G6–G9 真实信号 |
| macOS 真机 smoke | `e2e/specs/mac.spec.ts`（`describe.skip` 除非 `process.platform==='darwin'`） | 同上（macOS 本轮 BLOCKED，能力缺失） |
| 自建 updater | `apps/desktop/src/main/updater.ts` | `BACK_DIR=".back"`、metadata-unreachable→离线降级、checksum-mismatch→回退 |
| 稳定发布流 | `.github/workflows/release-stable.yml` | 加证据 artifact 上传 + 收窄清理 |
| 预览发布流 | `.github/workflows/release-preview.yml` | 同上 |
| 工作流契约测试 | `tools/pack/tests/release-workflows.test.ts`（~200 断言） | 必须保持全绿 |
| e2e 工作流契约测试 | `e2e/tests/packaged-smoke-workflow.test.ts`（~2000 行） | 必须保持全绿 |

### 2.1 现有产物已写
`release-smoke.ts` 已写：`manifest.json`、`tools-pack.json`、`tools-pack.log`、`suite-result.json`、`vitest.log`、截图。**缺**：artifact SHA-256、G6–G10 显式证据字段、报告未声明 platform/profile 的可机读门禁结构。

---

## 3. G6–G10 → 既有组件精确映射

> 门禁状态词汇（与验收文档一致）：`PASS` / `FAIL` / `BLOCKED`（能力缺失或未在该 profile 触发）/ `不适用`。**绝不用 mock 声称 PASS**。

| 门禁 | 含义 | 证据来源（复用既有） | 真机可执行 |
| --- | --- | --- | --- |
| **G6** | 冷启动安装成功 | `win.spec.ts` `install.installerPath` + `start.pid`/`start.status` | Windows ✅ |
| **G7** | 升级前后 `dataRoot` 与 `backups/creator` 保持且内容一致 | `win.spec.ts` `payloadUpdate`（full profile 走 `tools-serve` 升级 fixture）+ 升级前后 health eval；证据记录 `dataRoot` 路径与前后内容指纹 | Windows（full profile）✅ |
| **G8** | 更新 payload 失败/校验失败→进程级回退旧版本且数据未动 | `updater.ts` checksum-mismatch/失败路径；由 `OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL` 指向坏 payload 触发；证据记录回退是否发生、数据根是否未变 | Windows（坏 payload 场景）⚠️ 需专用失败流 |
| **G9** | metadata 不可达→已安装应用仍离线启动 | `updater.ts` `metadata-unreachable` 降级；由 metadata 不可达场景触发；证据记录离线启动成功 | Windows（不可达场景）⚠️ 需专用失败流 |
| **G10** | smoke 报告写明 artifact SHA-256/版本/commit/平台/profile | `release-smoke.ts` 读 `OD_PACKAGED_E2E_BUILD_JSON_PATH`（`payloadPath`/`installerPath`/`portableZipPath`）算 SHA-256，写 `release-gates-evidence.json` | 所有平台 ✅（无真机构件时为 BLOCKED） |

### 3.1 证据文件结构（`release-gates-evidence.json`）
```jsonc
{
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO8601",
  "platform": "win" | "mac",
  "channel": "stable" | "beta" | "nightly" | null,
  "releaseVersion": "x.y.z" | null,
  "commit": "<GITHUB_SHA>" | null,
  "githubRunId": "..." | null,
  "githubRunAttempt": "..." | null,
  "namespace": "...",
  "profile": "core" | "full" | null,
  "reportPath": "<abs>",
  "artifacts": [ { "name": "payload"|"installer"|"portableZip", "path": "...", "sha256": "..." } ],
  "gates": {
    "G6":  { "id": "G6",  "title": "...", "status": "PASS"|"FAIL"|"BLOCKED", "reason"?: "...", "evidence"?: {...} },
    "G7":  { ... }, "G8": { ... }, "G9": { ... }, "G10": { ... }
  }
}
```
- `release-smoke.ts` 负责：metadata + `artifacts[]`（SHA-256）→ 填 **G10**；并合并 spec 写的 `release-gates-partial.json` 得到 G6–G9。
- spec 未执行（非对应平台）时：`release-smoke.ts` 将 G6–G9 标 `BLOCKED`，reason 明示"platform smoke skipped"。

---

## 4. 缺口与修复（对照 CW-09 的 BLOCKED 原因）

1. **缺 artifact SHA-256 + 门禁结构** → 新增 `e2e/lib/vitest/release-gates-evidence.ts`（计算 SHA-256、门禁映射、合并），`release-smoke.ts` 写 `release-gates-evidence.json`。
2. **证据被成功路径清理** → `release-stable.yml` / `release-preview.yml` 的 `Cleanup workflow artifacts` 步骤加 `ARTIFACT_NAME_REGEX: "-release-assets$"`，并新增 `Upload ... release-gates evidence`（`if: always()`，命名**不以 `-release-assets$` 结尾**，确保留存）。
3. **失败路径无证据** → spec 在 full profile 已走升级；G8/G9 的失败场景由既有输入 `win_x64_update_metadata_url` 等触发，本轮在证据结构上预留并诚实标记 BLOCKED（未触发时），不 mock PASS。
4. **缺聚焦测试** → 新增 `e2e/tests/release-gates-evidence.test.ts`，在 sandbox（Linux）跑绿，覆盖：SHA-256 计算、结构形态、BLOCKED-当跳过、PASS/FAIL 映射、合并逻辑、失败路径输入处理。

---

## 5. 实施计划（Commit 拆分）

- **Commit 1（docs）**：`docs: design desktop release smoke evidence` → 本文档。
- **Commit 2（test/feat）**：
  1. 新增 `e2e/lib/vitest/release-gates-evidence.ts`。
  2. 增强 `e2e/scripts/release-smoke.ts`：计算 artifact SHA-256、合并 partial、写 `release-gates-evidence.json`。
  3. `e2e/specs/win.spec.ts` / `e2e/specs/mac.spec.ts`：`saveSummary` 后写 `release-gates-partial.json`。
  4. `release-stable.yml` / `release-preview.yml`：收窄清理正则 + 新增证据 artifact 上传。
  5. 新增 `e2e/tests/release-gates-evidence.test.ts` 聚焦测试。
  6. 保持 `release-workflows.test.ts` 与 `packaged-smoke-workflow.test.ts` 全绿。
- **Commit 3（docs）**：`docs: verify desktop release smoke evidence` → 验收文档逐条写 G6–G10（PASS/BLOCKED/不适用）+ 命令 + 证据路径。

---

## 6. 约束自检（合规）

- 复用既有自建 updater / tools-pack / release-stable / release-preview / e2e release-smoke：✅
- 未引入 electron-updater / electron-builder：✅
- 验证只用 CI runner 临时目录与 fixture，不读写真实 `.od`/用户素材/运行时：✅（spec 受 `describe.skip` + 临时 namespace 保护；新增测试仅用 temp）
- macOS/Linux 缺能力标 BLOCKED，不用 mock 声称 PASS：✅
- 工作流上传 smoke 报告 + 截图/日志，不依赖会被成功路径清理的中间 artifact：✅（收窄清理 + 显式证据 artifact）
- 不修改 package.json / pnpm-lock.yaml / design-systems、不改真实数据：✅
- 禁止 push/merge/rebase/reset/force/删除分支 worktree：✅（仅本地 3 次提交）
- 提交不含 Co-Authored-By：✅
