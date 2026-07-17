# CW-09 桌面安装、升级、离线与回滚发布门禁 — 验收文档（Task 4）

> 分支：`feat/cw-09-desktop-release-gates` · 工作树：`.worktrees/cw-09-desktop-release-gates` · 基线：`main @ fe7c8e040`
> 提交顺序：`docs: audit desktop release gates` → `test: cover desktop release isolation` → `docs: verify desktop release gates`
> **未合并 / 未推送 / 未删除** 任何分支或工作树（见末尾声明）。

---

## 0. 重要声明（无虚假真实 PASS）

- **真实安装 / 升级 / 离线启动 / 重启恢复**：因本机**不存在任何可安装发布资产**（无 `.exe/.dmg/.AppImage/.msi/.nupkg/.deb/.rpm/.pkg`，无 `latest.yml`/`.sig`/`.blockmap`），这些矩阵项 **BLOCKED**，仅以"自动化/模拟检查"（真实 `createDesktopUpdater` 代码 + `mkdtemp` 临时绝对路径）覆盖**逻辑门禁**（隔离与不污染契约）。**不声称**任何"真实安装/升级 PASS"。
- 所有"PASS"均为**自动化单元/行为测试**在临时目录下的结果，未触碰真实 `.od`、用户项目、用户资产或运行中的守护进程 / Web / Electron。

---

## 1. 调研来源（来源、star 数、采纳原则）

详见 `docs/plans/CW-09-desktop-release-gates-research.md`。要点：

| 项目 | Star（约，2026-06/07） | License | 采纳原则映射到本项目 |
| --- | --- | --- | --- |
| `electron/electron` | ~122k | MIT | 运行时底座；官方 autoUpdater 仅 macOS/Windows；Linux 不支持自动更新（本项目一致返回 `UNSUPPORTED`）。 |
| `electron-userland/electron-builder` | ~14.6k | MIT | 打包/分发标准；`electron-updater` 事件模型（`error`→离线降级）。本项目自建 `updater.ts` 但采用同样的"失败→ERROR、不污染数据"原则。 |
| `electron-updater`（子包） | ~15k | MIT | 下载完整性校验、断点续传、provider 模型。本项目在 `downloadUpdate`/`installUpdate` 两阶段重校 checksum。 |

采纳原则（铁律）：**用户数据与应用二进制/更新载荷严格分离**；回滚只影响载荷，不触数据；离线优雅降级；下载校验。

---

## 2. 资产盘点（存在 / 缺失 / BLOCKED）

详见 `docs/verification/2026-07-17-cw-09-desktop-release-gate-inventory.md`。结论：

- 可安装资产：**仅 `tools/pack/resources/win/7zip/7z.exe`（构建工具，非安装包）**。无平台发布产物 → 真实安装/升级/离线/重启矩阵 **BLOCKED**。
- 现有入口：`apps/packaged/src/paths.ts`、`apps/daemon/src/creator-backup/store.ts`、`apps/desktop/src/main/updater.ts`、`tools/pack/src/win/lifecycle.ts`、`tools/pack/src/update-cache-lifecycle-snapshot.ts`、`e2e/tests/packaged-launcher-update-loop.test.ts`。
- 测试缺口（已补）：缺发布隔离契约测试、缺离线/失败不污染数据的断言、缺 `.back` vs CW-08 备份分离证据。

---

## 3. Smoke 矩阵：PASS / FAIL / BLOCKED

| # | 发布门禁 | 验证方式 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| G1 | 路径隔离契约：data/update/runtime/installation 互不污染 | `apps/packaged/tests/release-gate-isolation.test.ts` | **PASS（自动化）** | 4/4 用例通过 |
| G2 | `.back`（载荷回滚）与 CW-08 Creator 备份（`backups/creator`）物理隔离 | 同上（路径契约） | **PASS（自动化）** | 断言 `backupRoot` 不在 `updateRoot` 内，`.back` ≠ `backupRoot` |
| G3 | 升级后数据隔离 + Creator 备份可用（每命名空间独立） | 同上（OD_DATA_DIR 多命名空间） | **PASS（自动化）** | 两命名空间 `backupRoot` 不同且均不在各自 `updateRoot` |
| G4 | 离线启动降级为 ERROR 且不污染 data/backup | `apps/desktop/tests/main/release-gate-updater.test.ts`（注入 fetch 抛错） | **PASS（自动化）** | 状态 `ERROR/metadata-unreachable`；`data`、`backups/creator` 仅含预置 `.keep` |
| G5 | 失败安装（checksum 篡改）回滚不污染 Creator 数据 | 同上（fixture server 下载→篡改→installUpdate） | **PASS（自动化）** | 状态 `ERROR/checksum-mismatch`；`data`、`backups/creator` 未变；downloadPath 在 `updateRoot` 内 |
| G6 | 安装包冷启动（Win/mac/Linux） | 真实安装包 | **BLOCKED** | 无发布 artifact（资产盘点 §1） |
| G7 | 升级后数据 + Creator 备份真实可见 | 真实安装 + 升级流程 | **BLOCKED** | 同 G6（无 artifact） |
| G8 | 离线启动真实应用 | 真实安装 + 元数据不可达 | **BLOCKED** | 同 G6 |
| G9 | 重启恢复 / Windows 路径与符号链接 | 真实安装 + Windows 目标机 | **BLOCKED** | 同 G6 + 非 Windows 环境 |
| G10 | 代码签名 / 公证（macOS Notarization、Windows Authenticode） | 发布流水线 | **BLOCKED** | 仓库无证书/`.sig`；聚焦行为门禁 |

> 逻辑门禁（G1–G5）全部以自动化测试关闭；物理安装门禁（G6–G10）因资产/签名/平台缺位 BLOCKED，需 CI 产出安装包后重跑真实矩阵。

---

## 4. 验证命令 / 环境 / 临时目录策略

**环境**
- Node（托管）：`/c/Users/1/.workbuddy/binaries/node/versions/22.22.2`（v22.22.2）。
- pnpm 10.33.2（本机）。注：包内 `typecheck` 脚本含 `corepack pnpm ...`，本环境 `corepack` 不可用；改用等价直接调用（见下），未改动任何 `package.json`/`pnpm-lock.yaml`。
- 先 `pnpm install`（53.9s），再按依赖序构建 workspace 库：`contracts → sidecar-proto/launcher-proto → platform/diagnostics/download/host/sidecar/release → daemon → desktop`（`pnpm --filter @open-design/<pkg> build`，纯 `tsc`/esbuild，无 corepack）。

**临时目录策略（绝不触碰真实数据）**
- 所有测试用 `mkdtemp(join(tmpdir(), "od-cw09-*"))` 生成**绝对临时根**，独立临时命名空间（如 `cw09-smoke`）。
- packaged 路径契约测试：不设置 `OD_DATA_DIR` 或设置一个绝对临时基址；不读写任何真实 `.od`、用户资产、运行中的守护进程 / Web / Electron。
- desktop 行为测试：`downloadRoot` 指向临时 `updates` 目录；离线用例**注入 `fetch` 抛错**模拟元数据不可达；回滚用例用进程内 fixture HTTP server（`127.0.0.1:0`，动态端口）。`data`/`backups/creator` 预置 `.keep` 哨兵，断言其不被删除或新增。

**实际执行的验证命令与结果**

```
# 单元测试（新增 + 回归）
pnpm --filter @open-design/packaged test --pool=forks
  -> Test Files 17 passed (17); Tests 171 passed | 2 skipped
pnpm --filter @open-design/desktop test
  -> Test Files 16 passed (16); Tests 136 passed | 2 skipped
  （含 apps/desktop/tests/main/updater.test.ts 54 tests、apps/packaged/tests/creator-backup-restore.test.ts 15 tests、apps/packaged/tests/sidecars.test.ts 25 tests 等 CW-08 相关回归）

# 类型检查（直接 tsc，规避 corepack）
pnpm --filter @open-design/packaged exec tsc -p tsconfig.json --noEmit      -> 0
pnpm --filter @open-design/packaged exec tsc -p tsconfig.tests.json --noEmit -> 0
pnpm --filter @open-design/desktop  exec tsc -p tsconfig.json --noEmit      -> 0
pnpm --filter @open-design/desktop  exec tsc -p tsconfig.tests.json --noEmit -> 0

# 差异检查（提交后执行）
git diff --check main...HEAD   -> 无空白/换行问题
git status --short             -> 仅新增文档与测试文件（无源码/配置变更）
```

---

## 5. 隔离证据

- **路径模型**（`resolvePackagedNamespacePaths`）：
  - `namespaceRoot = <namespaceBaseRoot>/<ns>`
  - `dataRoot     = <namespaceRoot>/data`
  - `updateRoot   = <namespaceRoot>/updates`
  - `runtimeRoot  = <namespaceRoot>/runtime`
  - `installationRoot = <namespaceBaseRoot>/..`
  - 断言：四者互不为包含关系，且共享同一父目录 `namespaceRoot`。
- **Creator 备份根**（`resolveCreatorBackupRoot(dataDir)` = `dirname(dataDir)/backups/creator`）：
  - `backupRoot = <namespaceRoot>/backups/creator`
  - 断言：`backupRoot` ∉ `updateRoot`；`backupRoot` ∉ `dataRoot`；且 `.back`（`= <updateRoot>/.back`，更新载荷回滚目录）≠ `backupRoot`，二者互不包含。
- **不污染证据**（行为测试）：
  - 离线（G4）：`metadata-unreachable` → `ERROR`；`data` 与 `backups/creator` 仅保留预置 `.keep`，无新增/删除。
  - 回滚（G5）：`checksum-mismatch` → `ERROR`；`data` 与 `backups/creator` 不变；`downloadPath` 经 `containsPath` 约束在 `updateRoot` 内。

---

## 6. `.back`（更新载荷回滚）vs CW-08 Creator 备份 分离证据

- `@open-design/desktop` 自建更新器：`BACK_DIR = ".back"`，位于 `updateRoot`（即 `downloadRoot`）内（`ensureOwnedUpdateRoot` 校验 `RELEASES/STAGING/DOWNLOADS/.back/HELPERS/STATE` 无逃逸）。
- CW-08 Creator 备份：`resolveCreatorBackupRoot` 解析到 `namespaceRoot/backups/creator`，是 `data` 与 `updates` 的**兄弟目录**，位于 `updateRoot` **之外**。
- 因此：一次失败的安装/更新回滚只会触及 `updateRoot`（含 `.back`），**永远不会**触达 `namespaceRoot/backups/creator` 中的 CW-08 用户备份，也不会触达 `data`（用户运行数据）。该契约由 G1/G2/G4/G5 固化。

---

## 7. 未执行项与阻塞原因

| 项 | 阻塞原因 | 解除前置 |
| --- | --- | --- |
| G6–G9 真实安装/升级/离线/重启恢复 | 无平台发布 artifact（`.exe/.dmg/.AppImage/...`） | CI/本地用 `tools/pack` 产出安装包 |
| G10 代码签名/公证 | 仓库无证书/`.sig` | 注入 macOS/Windows 签名证书与公证流水线 |
| 真实更新 feed 回滚发布 | 无托管 `metadata.json`/`latest.yml` 端点 | 更新元数据托管 + "重托管上一稳定版"流程 |

---

## 8. 提交清单（无 Co-Authored-By 尾注）

1. `docs: audit desktop release gates` — 新增 `docs/plans/CW-09-desktop-release-gates-research.md`、`docs/verification/2026-07-17-cw-09-desktop-release-gate-inventory.md`。
2. `test: cover desktop release isolation` — 新增 `apps/packaged/tests/release-gate-isolation.test.ts`、`apps/desktop/tests/main/release-gate-updater.test.ts`。
3. `docs: verify desktop release gates` — 本验收文档。

> 无 `fix:` 提交：CW-09 为门禁验证，未发现需修复的真实缺陷（现有 `updater.ts`/`paths.ts`/`store.ts` 已满足隔离与不污染契约）。

---

## 9. 分支 / 工作树状态声明

- 分支 `feat/cw-09-desktop-release-gates` 基于 `main @ fe7c8e040`，位于工作树 `.worktrees/cw-09-desktop-release-gates`。
- **未合并**到 `main`，**未推送**到远程，**未 rebase / reset / force**，**未删除**任何既有分支或工作树。
- 仅新增文档与测试文件；未改动 `package.json` / `pnpm-lock.yaml` / 依赖版本 / 现有源码逻辑 / 设计系统。
- 构建产物（`apps/*/dist`、`packages/*/dist`、`node_modules`）为 gitignored，未纳入提交。
