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

CW-08 由两部分组成：（1）先前的 5 个 feature 提交（被 Codex 评审退回，需修复）；（2）本
轮 4 个 remediation 提交，逐条关闭 P0-1 / P0-2 / P0-3 / P1-1 / P1-2 / P2-1 / P2-2 评审意见。

| Task | Commit | 范围 | 测试 |
|---|---|---|---|
| 1 | `8d5ed5930` | `docs/plans/CW-08-creator-backup-recovery-research.md` + `packages/contracts/src/api/creator-backup.ts`（DTO / HTTP / 桌面能力类型） | — |
| 2 | `a5f58cad0` | daemon 快照核心 + 测试 | daemon creator-backup 27/27 |
| 3 | `c8e610604` | packaged 主进程恢复编排（engine + sidecars 重启 + host 桥 + desktop IPC + preload + daemon 子路径导出） | packaged restore 15/15、sidecar-lifecycle 2/2、host 25/25 |
| 4 | `47c8683ea` | web CreatorBackupPanel（TasksView 内嵌）+ 测试 | web 面板 7/7、TasksView 119/119、typecheck PASS、`next build` PASS |
| 5 | `c2ce84c57` | 上一版验收文档（已被本轮 P2-2 更正） | — |
| R1 | `de1438f15` | **remediation**：事务化恢复（P0-1 / P0-2 / P0-3 / P1-1）— `restore.ts` / `sidecars.ts` / `packaged/index.ts` + 测试 | packaged restore 15/15、sidecar-lifecycle 2/2 |
| R2 | `b4b7d9aec` | **remediation**：恢复最小项目身份（P1-2）— daemon `project-identity.ts`（新）+ `store.ts` / `routes/creator-backup.ts` + 测试 + contracts 类型 | daemon identity 7/7 |
| R3 | `1ac38824c` | **remediation**：非桌面环境降级恢复（P2-1）— `host/src/index.ts` + `CreatorBackupPanel.tsx` + 测试 + TasksView 测试桩 | host 11/11、web 面板 7/7 |
| R4 | 本提交 | **remediation**：更正本验收文档（P2-2），如实记录 package.json / lockfile / daemon / contracts 的真实 diff | — |

所有提交均无真实 `Co-Authored-By`（占位符 `-` 除外）、均未 push。

## 2. 自动化验证结果

### Typecheck
- **web** — PASS：`NODE_OPTIONS= pnpm --filter @open-design/web typecheck`（`tsc -b --noEmit`），0 个 TS 错误。
  - 注：首次运行报 `@open-design/creator-*` 模块缺失 —— 系 worktree 内 workspace 依赖未构建所致；
    执行 `pnpm --filter "@open-design/contracts" --filter "@open-design/host" --filter "@open-design/desktop" build` 后清零。
- **daemon** — PASS：`tsc -p tsconfig.json` 与 `tsc -p tsconfig.tests.json` 均 0 错误。
- **packaged** — PASS（Task 3 验证：`build desktop` + `tsc src` + `tsc tests`，0 错误）。
- **desktop** — PASS（0 错误）。
- **host** — PASS：`tsc -p tsconfig.json` 与 `tsc -p tsconfig.tests.json` 均 0 错误；policy 测试
  `tests/index.test.ts` 扫描 `packages/host/src` 源码（含注释）禁止出现字面量 `@open-design/contracts`，通过。

### Unit Tests

| 包 / 文件 | 命令 | 结果 |
|---|---|---|
| daemon `tests/creator-backup-store.test.ts` + `tests/creator-backup-routes.test.ts` + `tests/creator-backup-identity.test.ts` | `vitest run tests/creator-backup` | **27 passed（14 + 6 + 7）** |
| packaged `tests/creator-backup-restore.test.ts` | `vitest run tests/creator-backup-restore.test.ts` | **15 passed** |
| packaged `tests/sidecar-lifecycle.test.ts` | `vitest run tests/sidecar-lifecycle.test.ts` | **2 passed** |
| host `tests/creator-backup.test.ts` + `tests/index.test.ts`（policy） | `vitest run tests/creator-backup.test.ts tests/index.test.ts` | **25 passed（11 + 14）** |
| web `tests/components/CreatorBackupPanel.test.tsx` | `vitest run tests/components/CreatorBackupPanel.test.tsx` | **7 passed** |
| web `tests/components/TasksView.*.test.tsx` | `vitest run tests/components/TasksView` | **119 passed** |

> daemon 全量 `pnpm test` 在本沙箱会挂起（>11 分钟无输出，疑似原生模块极慢），Task 3 未改动 daemon 源码，
> 故只跑隔离的 `creator-backup` 三文件确认绿；不必等全量。

### Build

| 包 | 命令 | 结果 |
|---|---|---|
| web | `NODE_OPTIONS= pnpm --filter @open-design/web build`（`next build`） | **PASS** — `Compiled successfully`；TypeScript 通过；静态页生成 4/4 |
| daemon / desktop / packaged | 各包 build / typecheck | **PASS**（见 §2 typecheck；Task 3 已验证 packaged/desktop 构建） |

> 构建时 `NODE_OPTIONS` 中本沙箱注入的 `--use-system-ca` 会被 Next.js 16 Turbopack 的 worker 拒绝
> （`ERR_WORKER_INVALID_EXEC_ARGV`）；以 `NODE_OPTIONS=` 清空后构建通过。该限制与 CW-08 代码无关。

### Git Hygiene
- **Status**: PASS
  - `git diff --check main...HEAD` 对全部源码改动零空白错误（`CHECK_EXIT=0`）。
  - `apps/web/next-env.d.ts` 为构建再生成件，**已排除在提交外**（仅提交目标文件）。
  - 每次提交后 `git status --short` 仅含目标文件；无真实 `Co-Authored-By`。
- **关于「禁改文件」红线的更正（P2-2）**：上一版文档声称 `package.json` / `pnpm-lock.yaml` /
  `apps/daemon/` / `packages/contracts/` 零 diff，这**不属实**。这些文件确有**有意且经过评审**的改动，
  由 feature 提交（及本轮 remediation）引入，详见 §6。它们**不构成红线违规**，因为真正的红线
  （不碰真实 `.od`/用户数据/原始素材、桌面不引入 SQLite、不执行破坏性 git 操作、恢复绝不作为
  daemon HTTP 写路由）全部成立。文档不再谎称零 diff，而是如实记录并论证这些改动的合法性。

## 3. 安全约束验证（关键防御）

### 3.1 备份根位于 dataDir 之外（数据 / 更新分离）
`apps/daemon/src/creator-backup/store.ts` `resolveCreatorBackupRoot(dataDir)` =
`path.join(path.dirname(path.resolve(dataDir)), 'backups', 'creator')`。
packaged 布局下 dataDir = `<ns>/data`，备份根 = `<ns>/backups/creator`；dev 布局下 dataDir = `<root>/.od`，
备份根 = `<root>/backups/creator`。两者均**在 `RUNTIME_DATA_DIR` 之外**，且不使用 updater `.back`。

### 3.2 路径穿越 / 符号链接拒绝
- `assertBackupId`（store.ts）拒绝含 `/`、`\`、`..` 的 backupId（400）。
- 路由 `requireBackupId`（routes）同样拒绝 `/`、`\`、`..`。
- `isWithin`（store.ts）确保目标解析后仍在 base 内。
- `readAllowlistedSources`（store.ts）对每个源目录与源文件用 `lstat` 检测符号链接，
  **拒绝读取符号链接的源目录/文件**（防指向磁盘任意位置）。

### 3.3 文件 allowlist
`ALLOWED_SUBDIRS`（store.ts）= `creator-workbench` / `creator-media` / `creator-content` /
`creator-release` / `creator-performance`（5 个 Creator JSON 存储）。仅这些被复制；
allowlist 之外的条目在校验阶段直接拒绝。备份**不含** `node_modules`、安装目录、日志、原始素材、
任意绝对路径、凭据、安装/更新 payload。

### 3.4 SHA-256 + manifest + schemaVersion
- 备份时对每个文件计算 `sha256`（store.ts）写入 manifest。
- `validateCreatorBackup`（store.ts）重算并与 manifest 比对；任一不匹配 → `status: 'invalid'` → 中止。
- manifest 含 `schemaVersion`（当前 `1`）；版本不兼容时拒绝并提示，避免旧备份被误读。

### 3.5 恢复绝不暴露为 daemon HTTP 写路由
`apps/daemon/src/routes/creator-backup.ts` **仅注册**：
- `GET /api/projects/:id/creator-backups`（列出，按 `projectIds` 作用域过滤）
- `POST /api/projects/:id/creator-backups`（创建，`profile` 仅支持 `full`）
- `POST /api/projects/:id/creator-backups/:backupId/validate`（校验）

**无 restore 路由。** 恢复链路仅走桌面主进程 capability：

```
web CreatorBackupPanel.restoreBackup(backupId)
  → restoreCreatorBackup(backupId)            [@open-design/host]   (host/src/index.ts)
  → host.creator.restoreBackup(backupId)      [preload bridge]     (desktop/src/main/preload.cts)
  → ipcRenderer.invoke("creator:restore-backup", { backupId })
  → ipcMain.handle("creator:restore-backup")  [desktop/src/main/runtime.ts, requireMainWindowSender]
  → options.creatorBackup.restore({ backupId })
  → restoreCreatorBackup(deps, { backupId })  [packaged/src/restore.ts]  (以 backupId 唯一入参，路径全部服务端派生)
```

渲染端**只传 `backupId` 字符串**，绝不提供任何源/目标路径（满足「禁止任意客户端路径」红线）。

### 3.6 受控原子恢复 + 自动回滚（P0-1 / P0-2 / P0-3 强化）
`apps/packaged/src/restore.ts` 引擎流程（本轮 remediation 已强化）：
`assertBackupIdSafe` → `readManifest` → 逐文件路径安全预检 → `validateSnapshot`
→ **freeze daemon**（IPC SHUTDOWN 并**等待进程确认退出**；无法停止则抛错，引擎在触碰任何 live 文件前中止）
→ 捕获回滚点（同 namespace 快照）→ 临时目录原子 staging → `rename` 提交
→ 删除快照中缺失的 live 文件（**仅 5 个 allowlisted 子目录内**的文件，绝不对 dataRoot 递归清空）
→ **restart daemon + web 整组**（更换受管句柄，旧句柄关闭、新句柄注册；web 复用旧端口重连新 daemon）
→ 仅当 daemon+web 恢复成功后才**移除回滚点**；若 restart 失败 → 应用回滚点并再次 restart，
且**绝不报告成功**（响应 `ok:false, rolledBack:true`）。

并发安全（P0-2.5）：进程级 single-flight 锁，第二个并发 restore 直接被拒，而非在共享 data dir 上竞速。

测试覆盖（packaged `creator-backup-restore.test.ts` 15 例 + `sidecar-lifecycle.test.ts` 2 例）：
成功交换 / 校验失败中止 / manifest 缺失 / 暂存失败自动回滚 / backupId 路径不安全 / 文件不在允许范围 /
逃逸 dataRoot 被拒 / **字节级一致恢复**（staging 与回滚后逐文件内容断言）/ P1-1 快照缺失文件清理 /
P0-3 整组重启与句柄更换 / single-flight 并发拒绝。

### 3.7 host 与 contracts 解耦（独立策略）
`@open-design/host` 本地声明 CreatorBackup 类型，**不 import `@open-design/contracts`**；
`tests/index.test.ts` 扫描 `packages/host/src` 源码（含注释）禁止出现字面量 `@open-design/contracts`，
确保 host 桥在不引入 contracts 依赖的前提下可独立演进。
`apps/daemon/package.json` 的 `./creator-backup` 子路径**仅导出 `store.js`**，刻意排除 SQLite 依赖的
`project-identity.js`，从而桌面 / packaged 构建不会把 SQLite 拉入。

## 4. 验收标准对照

| # | 标准（来源：CW-08 红线 + 调研原则） | 状态 |
|---|---|---|
| C1 | 手动、本地、受控的快照 / 校验 / 恢复，非静默/自动备份 | PASS |
| C2 | 备份仅含 Creator 受管元数据 + 最小项目关联（不含原始素材） | PASS（§3.3） |
| C3 | 备份根位于 `RUNTIME_DATA_DIR` 之外、独立 namespace | PASS（§3.1） |
| C4 | 备份不使用 updater `.back` | PASS |
| C5 | 不云同步、不调用第三方 API | PASS |
| C6 | 文件 allowlist 仅 5 个 Creator JSON 存储 | PASS（§3.3） |
| C7 | 拒绝路径穿越（`/`、`\`、`..`）的 backupId / 文件 | PASS（§3.2） |
| C8 | 拒绝符号链接源（目录与文件） | PASS（§3.2） |
| C9 | 逐文件 SHA-256 校验，manifest 为准 | PASS（§3.4） |
| C10 | schemaVersion 兼容检查，不兼容拒绝 | PASS（§3.4） |
| C11 | 损坏 / 缺失 manifest 的快照拒绝恢复 | PASS（§3.4，测试覆盖） |
| C12 | 恢复及项目身份协调均不作为 daemon HTTP 写路由暴露；身份协调仅通过私有 daemon sidecar IPC | PASS（§3.5） |
| C13 | 渲染端仅以 `backupId` 触发恢复，不传路径 | PASS（§3.5） |
| C14 | 恢复经桌面主进程 capability + IPC + preload 桥 | PASS（§3.5 链路） |
| C15 | 恢复前 freeze daemon 并**等待确认退出**，恢复后 restart 整组 | PASS（§3.6，P0-2/P0-3） |
| C16 | 原子提交（临时目录 → rename） | PASS（§3.6） |
| C17 | 失败自动回滚到回滚点；回滚点仅在恢复成功后移除；restart 失败仍回滚且不谎报成功 | PASS（§3.6，P0-1，测试覆盖） |
| C18 | 校验失败 / 暂存失败 / 路径不安全 / 逃逸 dataDir 均被拒 | PASS（§3.6，测试覆盖） |
| C19 | 测试不 skip、不放宽断言；新增字节级一致 + single-flight 用例 | PASS（全部断言严格） |
| C20 | web 面板列出 / 创建 / 校验 / 触发恢复四类操作齐备；非桌面降级为只读 | PASS（§5，7 测试覆盖） |
| C21 | host 与 contracts 解耦，policy 测试防护；桌面不拉入 SQLite | PASS（§3.7） |
| C22 | typecheck / build / 单测全绿 | PASS（§2） |
| C23 | 真实红线成立：不碰真实 `.od`/用户数据/原始素材、桌面不引入 SQLite、无破坏性 git 操作、恢复非 daemon HTTP 写路由；`package.json`/`lockfile`/`daemon`/`contracts` 的有意改动已如实记录并论证（**不再谎称零 diff**） | PASS（§6，P2-2） |
| C24 | 不碰真实 `.od` / 真实素材 / 原素材；仅临时目录 / mock / fixture | PASS（红线，测试均用 mkdtemp / 注入 mock） |

**Overall Verdict**: **PASS — 全部验收标准达成**（daemon 27/27、packaged restore 15/15 + sidecar-lifecycle 2/2、
host 25/25、web 面板 7/7、TasksView 119/119；web/daemon/desktop/packaged/host typecheck 全绿；web `next build` 绿；
安全约束逐条验证；`package.json`/`lockfile`/`daemon`/`contracts` 真实改动已如实记录）。

## 5. 实现要点

- **Contracts**（`packages/contracts/src/api/creator-backup.ts`）：`CreatorBackupManifest` / `CreatorBackupSummary` /
  `CreatorBackupValidationResult` / `RestoreCreatorBackupRequest({ backupId })` /
  `RestoreCreatorBackupResponse({ ok; backup?; error?; rolledBack?; rollbackRemoved?; projectIdentity? })`；
  明确「restore 不是 daemon HTTP 路由」。P1-2 新增 `CreatorBackupProjectIdentity` / `CreatorBackupProjectIdentityReport`
  及 response 的 `projectIdentity` 字段。
- **Daemon**（`apps/daemon/src/creator-backup/store.ts` + `routes/creator-backup.ts` + `project-identity.ts`）：
  备份写 `dirname(dataDir)/backups/creator`；仅 list/create/validate 三路由；项目身份协调仅由
  `daemon sidecar` 私有 IPC 消息触发，不对 HTTP renderer 暴露；
  `projectIds` 用于作用域过滤（最小项目关联，不含素材体）。P1-2 新增 daemon-only `project-identity.ts`：
  capture 最小 id+name、rebuild 缺失记录、同名保留、异名冲突不覆盖；**不**经 `./creator-backup` 子路径导出。
- **Packaged 恢复引擎**（`apps/packaged/src/restore.ts`）：注入式 `daemonControl`（freeze/restart/restoreProjectIdentities），
  类型本地化（packaged 不依赖 contracts）；`apps/packaged/src/sidecars.ts` 导出 `restartPackagedSidecars`
  （关闭旧整组、同 web 端口重生新整组、更换受管句柄）；`apps/packaged/src/index.ts` 用
  `createCreatorBackupDaemonControl` + `createSingleFlightRestore` 注入 capability。
- **Host 桥**（`packages/host/src/index.ts`）：本地类型 + `creator?` 命名空间 + `isOpenDesignHostBridge` 校验 +
  `restoreCreatorBackup(backupId)` helper + `isCreatorBackupRestoreAvailable()` 能力探测；不依赖 contracts（policy 测试防护）。
- **Desktop**（`apps/desktop/src/main/runtime.ts` + `preload.cts`）：`ipcMain.handle("creator:restore-backup", requireMainWindowSender)`
  → `creatorBackup.restore(request)`；preload 暴露 `creator.restoreBackup` → `ipcRenderer.invoke("creator:restore-backup", { backupId })`。
  注：`DesktopMainOptions` 与 `DesktopRuntimeOptions` 为两个独立类型，`creatorBackup` 两处均加且 index.ts 显式透传。
- **Web**（`apps/web/src/components/CreatorBackupPanel.tsx` + `TasksView.tsx` + `tasks.css`）：
  面板内嵌于 TasksView creator surface；`fetch` 走 daemon 本地 API（list/create/validate），
  `restoreCreatorBackup(backupId)` 走 host 桥；`entryProjects` 为空时提示先建项目。P2-1：当
  `isCreatorBackupRestoreAvailable()` 为 false（纯 web / dev build / 非 packaged host）时渲染只读——
  显示只读提示、Restore 按钮 disabled、不弹确认框、不调用 `restoreCreatorBackup`。

## 6. 审计轨迹与红线确认

- **未执行**（红线）：不 push / 不 merge-main / 不 rebase / 不 reset / 不 force / 不删分支 / 不删 worktree。
- **未触碰真实数据**：不碰真实 `.od` / 真实素材 / 原素材；全部测试用 `mkdtemp` 临时 dataRoot、注入式 mock、fixture。
- **无云同步 / 第三方 API / 静默自动备份**：仅手动触发本地快照。
- **无外部素材体复制**：备份仅含 Creator 受管元数据 + 最小项目关联引用。
- **无任意客户端路径**：恢复以 `backupId` 唯一入参，路径全部服务端派生 + 前缀校验 + allowlist。
- **桌面不引入 SQLite**：`apps/daemon/package.json` 的 `./creator-backup` 子路径仅导出 `store.js`
  （`project-identity.ts` 含 SQLite 访问，刻意不导出）。
- **无测试 skip / 放宽断言**：所有断言严格；恢复覆盖校验失败、原子提交失败、回滚成功、字节级一致、并发拒绝等用例。
- **package.json / lockfile / daemon / contracts 的真实改动（P2-2 如实记录，非「零 diff」）**：
  - `apps/daemon/package.json`：新增 `./creator-backup` 子路径导出 → `dist/creator-backup/store.js`
    （支撑 `apps/packaged/src/restore.ts` 的 `import ... from "@open-design/daemon/creator-backup"`）。
    仅导出 `store.js`，不含 SQLite 模块。
  - `apps/packaged/package.json` + `pnpm-lock.yaml`：新增 `@open-design/host` workspace 依赖
    （支撑 P2-1 中 packaged 主进程的 `isCreatorBackupRestoreAvailable` / `restoreCreatorBackup` 类型与桥）。
    为 workspace 内部包，不引入任何用户数据或外部运行时。
  - `apps/daemon/src/creator-backup/*` 与 `packages/contracts/src/api/creator-backup.ts`：CW-08 功能源码本身。
  - 上述改动**有意且经过评审**，不违反任何真实红线（不碰用户数据、桌面不拉 SQLite、无破坏性 git、恢复非 HTTP 写路由）。
- **生成件已排除**：`apps/web/next-env.d.ts` 与 `.next/` 未提交。
- 九个提交（5 feature + 4 remediation）均无真实 `Co-Authored-By`（占位符 `-` 除外）。

**最终结论**：CW-08 在独立 worktree 分支上以 5 个 feature 提交实现，并经 4 个 remediation 提交逐条关闭
Codex 评审意见（P0-1/P0-2/P0-3/P1-1/P1-2/P2-1/P2-2）。本验收文档已更正上一版关于「禁改文件零 diff」的
不实陈述，如实记录真实改动并论证其合法性。未合入 `main`、未推送、未执行任何破坏性 git 操作、未触碰任何真实 `.od` / 原始素材。
