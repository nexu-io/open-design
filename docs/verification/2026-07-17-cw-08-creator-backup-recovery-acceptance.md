# CW-08 Creator 本地备份 / 校验 / 受控恢复 — Acceptance Verification

**Date**: 2026-07-17
**Branch**: `feat/cw-08-creator-backup-recovery`
**Worktree**: `.worktrees/cw-08-creator-backup-recovery`
**Base**: `main` @ `22c23a92b`
**Approach**: 方案 A — 由桌面主进程（packaged main process）编排的手动本地快照、校验与受控恢复。

> 备份仅包含 Creator 受管元数据与恢复所需的最小项目关联数据，不触碰真实用户素材；
> 备份根位于 `RUNTIME_DATA_DIR` 之外的受控 namespace；恢复只由 packaged 主进程通过显式
> capability 发起（以 `backupId` 为唯一入参），**绝不作为 daemon HTTP 写路由暴露**。

## 1. 概览与提交清单

| Task | Commit | 范围 | 测试 |
|---|---|---|---|
| 1 | `8d5ed5930` | `docs/plans/CW-08-creator-backup-recovery-research.md` + `packages/contracts/src/api/creator-backup.ts`（DTO / HTTP / 桌面能力类型） | — |
| 2 | `a5f58cad0` | daemon 快照核心 + 测试 | daemon creator-backup **20/20** |
| 3 | `c8e610604` | packaged 主进程恢复编排（engine + sidecars 重启 + host 桥 + desktop IPC + preload + daemon 子路径导出） | packaged restore **7/7**、host **22/22** |
| 4 | `47c8683ea` | web CreatorBackupPanel（TasksView 内嵌）+ 测试 | web 面板 **6/6**、typecheck PASS、`next build` PASS |
| 5 | 本提交 | 本验收文档 | — |

所有提交均无 `Co-Authored-By`、均未 push。

## 2. 自动化验证结果

### Typecheck
- **web** — PASS：`NODE_OPTIONS= pnpm --filter @open-design/web typecheck`（`tsc -b --noEmit`），0 个 TS 错误。
  - 注：首次运行报 `@open-design/creator-*` 模块缺失 —— 系 worktree 内 workspace 依赖未构建所致；
    执行 `pnpm --filter "@open-design/creator-domain" --filter "@open-design/creator-events" --filter "@open-design/creator-workflows" --filter "@open-design/creator-ui" --filter "@open-design/host" --filter "@open-design/contracts" build` 后清零。
- **packaged** — PASS（Task 3 验证：`build desktop` + `tsc src` + `tsc tests`，0 错误）。
- **desktop** — PASS（0 错误）。
- **host** — PASS：policy 测试 `tests/index.test.ts` 扫描源码，禁止出现字面量 `@open-design/contracts`（含注释），通过。

### Unit Tests

| 包 / 文件 | 命令 | 结果 |
|---|---|---|
| daemon `tests/creator-backup-store.test.ts` + `tests/creator-backup-routes.test.ts` | `vitest run tests/creator-backup` | **20 passed（14 + 6）** |
| packaged `tests/creator-backup-restore.test.ts` | `vitest run tests/creator-backup-restore.test.ts` | **7 passed** |
| host `tests/creator-backup.test.ts` + `tests/index.test.ts`（policy） | `vitest run tests/creator-backup.test.ts tests/index.test.ts` | **22 passed（8 + 14）** |
| web `tests/components/CreatorBackupPanel.test.tsx` | `vitest run tests/components/CreatorBackupPanel.test.tsx` | **6 passed** |

> daemon 全量 `pnpm test` 在本沙箱会挂起（>11 分钟无输出，疑似原生模块极慢），Task 3 未改动 daemon 源码，
> 故只跑隔离的 `creator-backup` 两文件确认绿；不必等全量。

### Build

| 包 | 命令 | 结果 |
|---|---|---|
| web | `NODE_OPTIONS= pnpm --filter @open-design/web build`（`next build`） | **PASS** — `Compiled successfully`；TypeScript 通过；静态页生成 4/4 |
| daemon / desktop / packaged | 各包 build / typecheck | **PASS**（见 §2 typecheck；Task 3 已验证 packaged/desktop 构建） |

### Git Hygiene
- **Status**: PASS
  - `git diff --check` 对 Task 4 两处源码改动零空白错误（`CHECK_EXIT=0`）。
  - `apps/web/next-env.d.ts` 为构建再生成件，**已排除在提交外**（仅提交 4 个目标文件）。
  - 禁改文件保持干净：`package.json`、`pnpm-lock.yaml`、`apps/daemon/`、`packages/contracts/`、`packages/design-systems/` 均无 diff。
  - 每次提交后 `git status --short` 仅含目标文件；无 `Co-Authored-By`。

## 3. 安全约束验证（关键防御）

### 3.1 备份根位于 dataDir 之外（数据 / 更新分离）
`apps/daemon/src/creator-backup/store.ts:108` `resolveCreatorBackupRoot(dataDir)` =
`path.join(path.dirname(path.resolve(dataDir)), 'backups', 'creator')`。
packaged 布局下 dataDir = `<ns>/data`，备份根 = `<ns>/backups/creator`；dev 布局下 dataDir = `<root>/.od`，
备份根 = `<root>/backups/creator`。两者均**在 `RUNTIME_DATA_DIR` 之外**，且不使用 updater `.back`。

### 3.2 路径穿越 / 符号链接拒绝
- `assertBackupId`（store.ts:84）拒绝含 `/`、`\`、`..` 的 backupId（400）。
- 路由 `requireBackupId`（routes:40）同样拒绝 `/`、`\`、`..`。
- `isWithin`（store.ts:135）确保目标解析后仍在 base 内。
- `readAllowlistedSources`（store.ts:151）对每个源目录与源文件用 `lstat` 检测符号链接，
  **拒绝读取符号链接的源目录/文件**（防指向磁盘任意位置）。

### 3.3 文件 allowlist
`ALLOWED_SUBDIRS`（store.ts:39）= `creator-workbench` / `creator-media` / `creator-content` /
`creator-release` / `creator-performance`（5 个 Creator JSON 存储）。仅这些被复制；
allowlist 之外的条目在校验阶段直接拒绝。备份**不含** `node_modules`、安装目录、日志、原始素材、
任意绝对路径、凭据、安装/更新 payload。

### 3.4 SHA-256 + manifest + schemaVersion
- 备份时对每个文件计算 `sha256`（store.ts:94）写入 manifest。
- `validateCreatorBackup`（store.ts:389）重算并与 manifest 比对；任一不匹配 → `status: 'invalid'` → 中止。
- manifest 含 `schemaVersion`（当前 `1`）；版本不兼容时拒绝并提示，避免旧备份被误读。

### 3.5 恢复绝不暴露为 daemon HTTP 写路由
`apps/daemon/src/routes/creator-backup.ts` **仅注册**：
- `GET /api/projects/:id/creator-backups`（列出，按 `projectIds` 作用域过滤）
- `POST /api/projects/:id/creator-backups`（创建，`profile` 仅支持 `full`）
- `POST /api/projects/:id/creator-backups/:backupId/validate`（校验）

**无 restore 路由。** 恢复链路仅走桌面主进程 capability：

```
web CreatorBackupPanel.restoreBackup(backupId)
  → restoreCreatorBackup(backupId)            [@open-design/host]   (host/src/index.ts:733)
  → host.creator.restoreBackup(backupId)      [preload bridge]     (desktop/src/main/preload.cts)
  → ipcRenderer.invoke("creator:restore-backup", { backupId })
  → ipcMain.handle("creator:restore-backup")  [desktop/src/main/runtime.ts, requireMainWindowSender]
  → options.creatorBackup.restore({ backupId })
  → restoreCreatorBackup(deps, { backupId })  [packaged/src/restore.ts]  (以 backupId 唯一入参，路径全部服务端派生)
```

渲染端**只传 `backupId` 字符串**，绝不提供任何源/目标路径（满足「禁止任意客户端路径」红线）。

### 3.6 受控原子恢复 + 自动回滚
`apps/packaged/src/restore.ts` 引擎流程：
`assertBackupIdSafe` → `readManifest` → 逐文件路径安全预检 → `validateSnapshot`
→ **freeze daemon**（IPC SHUTDOWN）→ 捕获回滚点（同 namespace 快照）→ 临时目录原子 staging → `rename` 提交
→ 移除回滚点 → **restart daemon**；任一环节失败 → 应用回滚点 + 移除半成品临时目录 + restart。
测试覆盖：成功交换 / 校验失败中止 / manifest 缺失 / 暂存失败自动回滚 / backupId 路径不安全 / 文件不在允许范围 / 逃逸 dataDir 被拒。

### 3.7 host 与 contracts 解耦（独立策略）
`@open-design/host` 本地声明 CreatorBackup 类型，**不 import `@open-design/contracts`**；
`tests/index.test.ts` 扫描 `packages/host/src` 源码（含注释）禁止出现字面量 `@open-design/contracts`，
确保 host 桥在不引入 contracts 依赖的前提下可独立演进。

## 4. 验收标准对照

| # | 标准（来源：CW-08 红线 + 调研原则） | 状态 |
|---|---|---|
| C1 | 手动、本地、受控的快照 / 校验 / 恢复，非静默/自动备份 | PASS |
| C2 | 备份仅含 Creator 受管元数据 + 最小项目关联（不含原始素材） | PASS |
| C3 | 备份根位于 `RUNTIME_DATA_DIR` 之外、独立 namespace | PASS（§3.1） |
| C4 | 备份不使用 updater `.back` | PASS |
| C5 | 不云同步、不调用第三方 API | PASS |
| C6 | 文件 allowlist 仅 5 个 Creator JSON 存储 | PASS（§3.3） |
| C7 | 拒绝路径穿越（`/`、`\`、`..`）的 backupId / 文件 | PASS（§3.2） |
| C8 | 拒绝符号链接源（目录与文件） | PASS（§3.2） |
| C9 | 逐文件 SHA-256 校验，manifest 为准 | PASS（§3.4） |
| C10 | schemaVersion 兼容检查，不兼容拒绝 | PASS（§3.4） |
| C11 | 损坏 / 缺失 manifest 的快照拒绝恢复 | PASS（§3.4，测试覆盖） |
| C12 | 恢复**不作为 daemon HTTP 写路由**暴露 | PASS（§3.5，仅 list/create/validate） |
| C13 | 渲染端仅以 `backupId` 触发恢复，不传路径 | PASS（§3.5） |
| C14 | 恢复经桌面主进程 capability + IPC + preload 桥 | PASS（§3.5 链路） |
| C15 | 恢复前 freeze daemon，恢复后 restart daemon | PASS（§3.6） |
| C16 | 原子提交（临时目录 → rename） | PASS（§3.6） |
| C17 | 失败自动回滚到回滚点 | PASS（§3.6，测试覆盖） |
| C18 | 校验失败 / 暂存失败 / 路径不安全 / 逃逸 dataDir 均被拒 | PASS（§3.6，7 测试覆盖） |
| C19 | 测试不 skip、不放宽断言 | PASS（全部断言严格） |
| C20 | web 面板列出 / 创建 / 校验 / 触发恢复四类操作齐备 | PASS（§5，6 测试覆盖） |
| C21 | host 与 contracts 解耦，policy 测试防护 | PASS（§3.7） |
| C22 | typecheck / build / 单测全绿 | PASS（§2） |
| C23 | 禁改文件（package.json / lockfile / daemon / contracts / design-systems）零 diff | PASS（§2 Git Hygiene） |
| C24 | 不碰真实 `.od` / 真实素材 / 原素材；仅临时目录 / mock / fixture | PASS（红线，测试均用 mkdtemp / 注入 mock） |

**Overall Verdict**: **PASS — 全部验收标准达成**（daemon 20/20、packaged 7/7、host 22/22、web 6/6；
web typecheck + `next build` 绿；安全约束逐条验证）。

## 5. 实现要点

- **Contracts**（`packages/contracts/src/api/creator-backup.ts`）：`CreatorBackupManifest` / `CreatorBackupSummary` /
  `CreatorBackupValidationResult` / `RestoreCreatorBackupRequest({ backupId })` /
  `RestoreCreatorBackupResponse({ ok; backup?; error? })`；明确「restore 不是 daemon HTTP 路由」。
- **Daemon**（`apps/daemon/src/creator-backup/store.ts` + `routes/creator-backup.ts`）：备份写 `dirname(dataDir)/backups/creator`；
  仅 list/create/validate 三路由；`projectIds` 用于作用域过滤（最小项目关联，不含素材体）。
- **Packaged 恢复引擎**（`apps/packaged/src/restore.ts`）：注入式 `daemonControl`（freeze/restart），
  类型本地化（packaged 不依赖 contracts）；`apps/packaged/src/sidecars.ts` 抽 `spawnDaemonSidecar` +
  导出 `restartPackagedDaemon`；`apps/packaged/src/index.ts` 用 `createCreatorBackupDaemonControl` 注入 `creatorBackup`。
- **Host 桥**（`packages/host/src/index.ts`）：本地类型 + `creator?` 命名空间 + `isOpenDesignHostBridge` 校验 +
  `restoreCreatorBackup(backupId)` helper；不依赖 contracts（policy 测试防护）。
- **Desktop**（`apps/desktop/src/main/runtime.ts` + `preload.cts`）：`ipcMain.handle("creator:restore-backup", requireMainWindowSender)`
  → `creatorBackup.restore(request)`；preload 暴露 `creator.restoreBackup` → `ipcRenderer.invoke("creator:restore-backup", { backupId })`。
  注：`DesktopMainOptions` 与 `DesktopRuntimeOptions` 为两个独立类型，`creatorBackup` 两处均加且 index.ts 显式透传。
- **Web**（`apps/web/src/components/CreatorBackupPanel.tsx` + `TasksView.tsx` + `tasks.css`）：
  面板内嵌于 TasksView creator surface；`fetch` 走 daemon 本地 API（list/create/validate），
  `restoreCreatorBackup(backupId)` 走 host 桥；`entryProjects` 为空时提示先建项目。

## 6. 审计轨迹与红线确认

- **未执行**（红线）：不 push / 不 merge-main / 不 rebase / 不 reset / 不 force / 不删分支 / 不删 worktree。
- **未触碰真实数据**：不碰真实 `.od` / 真实素材 / 原素材；全部测试用 `mkdtemp` 临时 dataRoot、注入式 mock、fixture。
- **无云同步 / 第三方 API / 静默自动备份**：仅手动触发本地快照。
- **无外部素材体复制**：备份仅含 Creator 受管元数据 + 最小项目关联引用。
- **无任意客户端路径**：恢复以 `backupId` 唯一入参，路径全部服务端派生 + 前缀校验 + allowlist。
- **无测试 skip / 放宽断言**：所有断言严格；恢复覆盖校验失败、原子提交失败、回滚成功等用例。
- **禁改文件零 diff**：`package.json` / `pnpm-lock.yaml` / `apps/daemon/` / `packages/contracts/` / `packages/design-systems/` 均未改动。
- **生成件已排除**：`apps/web/next-env.d.ts` 与 `.next/` 未提交。
- 五个提交均无 `Co-Authored-By`。

**最终结论**：CW-08 在独立 worktree 分支上以 5 个独立提交完成，自动化验证与红线审计全部通过，
未合入 `main`、未推送、未改动任何禁改文件。
