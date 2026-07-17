# CW-09 桌面安装、升级、离线与回滚发布门禁 — 调研文档

> 分支：`feat/cw-09-desktop-release-gates` · 工作树：`.worktrees/cw-09-desktop-release-gates` · 基线：`main @ fe7c8e040`
> 目标：补齐桌面发布门禁——(1) 安装包冷启动、(2) 升级后数据隔离 + Creator 备份可用、(3) 更新/启动失败时的载荷回滚不污染用户数据、(4) 离线启动降级、(5) 可重复 smoke 矩阵。本任务不新增 Creator 功能。

本调研为强制前置环节：通过公开仓库检索（GitHub / 文档）确认成熟方案、star 数与采纳原则，并映射到本项目自建 `apps/desktop/src/main/updater.ts` 的发布门禁设计。

---

## 1. 检索来源与采纳指标

| 项目 | 仓库 | Star（约） | License | 语言 | 与本任务相关性 |
| --- | --- | --- | --- | --- | --- |
| Electron | `electron/electron` | **~122k** (121.6k–122k，2026-06) | MIT | C++ | 运行时底座；官方 `autoUpdater` 封装 Squirrel，**仅 macOS/Windows**；Linux 官方不支持自动更新（建议走发行版包管理）。 |
| electron-builder | `electron-userland/electron-builder` | **~14.6k** (14.6k，2026-06) | MIT | TypeScript | 打包与分发事实标准；内置 `electron-updater`，支持 GitHub Releases / S3 / Generic 多 provider、Windows blockmap 差分更新、macOS 公证、Windows Authenticode 签名。 |
| electron-updater | `electron-userland/electron-builder`（子包 `packages/electron-updater`） | **~15k**（仓库主题页显示 14.6k–15k） | MIT | TypeScript | 跨平台更新客户端；`checkForUpdates()` → `update-available` / `update-not-available` / `update-downloaded` / `error` 事件模型；`error` 事件在元数据服务器不可达时触发（即离线降级入口）。 |
| Squirrel（概念参考） | `Squirrel/Squirrel.Windows` 等 | — | MIT | C#/各种 | 差分更新 + 静默安装 + 重启激活；回滚靠"保留上一版本安装包 / 重新托管旧版本 feed"。 |

检索日期：2026-07-17。Star 数为检索时 GitHub / Snyk / deps.dev 公开值，会自然波动，仅作成熟度参考。

---

## 2. 业界发布门禁采纳原则

以下原则来自上述仓库文档、electron-updater 事件模型，以及多篇 Electron 商用更新实践（版本回滚全解、electron-builder 自动更新实战、跨平台应用更新避坑指南等）：

1. **用户数据与应用二进制分离（最高优先级）**
   - 用户文档 / 设置 / 缓存必须存放在独立目录（如 `~/AppData/Roaming/<App>/data`），与应用安装目录、更新包目录严格隔离。
   - 回滚（即使是版本降级）也**绝不能**误删或覆盖用户数据。推荐：回滚前对配置目录做快照（如 `backup_v1.9.0_*`），并做 schema 兼容检查。

2. **更新载荷回滚范围必须受限**
   - 回滚只应影响"安装/更新载荷"（installer 或 in-place payload），**不**触及用户数据目录。
   - 服务端版本回滚：下架坏版本、重新托管上一稳定版 `latest.yml` / 版本历史目录；客户端可保留上一版本安装包副本作为兜底。

3. **下载完整性校验**
   - 下载后强制 SHA-512 / SHA-256 校验，与 `latest.yml` / 元数据中的摘要比对，拒绝被篡改的包（electron-updater 默认行为；本项目 `updater.ts` 在 `downloadUpdate` 与 `installUpdate` 两阶段均重校 checksum）。

4. **离线 / 元数据不可达的优雅降级**
   - 当元数据服务器不可达，`electron-updater` 触发 `error` 事件；应用应**保持当前版本继续运行**，不崩溃、不污染数据。
   - 本项目 `updater.ts`：`fetchJson` 抛错被 `checkForCandidate` 捕获，返回 `state = ERROR`、`error.code = "metadata-unreachable"`，且**写入仅发生在 update root 内**，从不触碰 `dataRoot` / Creator 备份。

5. **重试与退避**
   - 传输中断可断点续传（本项目 `updater.ts` 支持 `Range` 续传，重试耗尽后报 `download-failed`，且不暴露底层 transport 错误原文）。

6. **平台与签名约束**
   - macOS 需 Notarization；Windows 需 Authenticode 签名；Linux 无统一更新接口（AppImage + zsync 或走发行版）。本项目当前在 macOS/Windows 启用包启动器更新，其余平台返回 `UNSUPPORTED`。

---

## 3. 本项目自建 Updater 的映射与偏差

本项目**未直接采用 electron-updater**，而是自建 `apps/desktop/src/main/updater.ts`（`createDesktopUpdater`，可依赖注入 `fetch` / `logger` / `now` / `spawnDetached` 等）。理由与设计对应：

| 业界原则 | 本项目实现 | 位置 |
| --- | --- | --- |
| 用户数据 / 载荷分离 | 路径模型：`namespaceRoot/{data, updates, runtime, backups/creator}` 互为兄弟；`dataRoot` 与 `updates`（含 `.back`）永不互相包含。 | `apps/packaged/src/paths.ts` |
| Creator 备份不与更新回滚混淆 | `resolveCreatorBackupRoot(dataDir) = dirname(dataDir)/backups/creator`，是 `namespaceRoot` 下与 `updates` 并列的兄弟目录；更新回滚的 `.back` 位于 `updateRoot/.back`，**二者物理隔离**。 | `apps/daemon/src/creator-backup/store.ts` + `apps/desktop/src/main/updater.ts`（`BACK_DIR = ".back"`） |
| 载荷回滚不污染数据 | 所有写操作经 `ensureOwnedUpdateRoot` 收敛到 `downloadRoot`（即 `updateRoot`）；含 `RELEASES_DIR / STAGING_DIR / DOWNLOADS_DIR / BACK_DIR / HELPERS_DIR / STATE_DIR` 的所有权哨兵（ownership sentinel）保护；任何路径逃逸都会被 `containsPath` 拒绝。 | `apps/desktop/src/main/updater.ts` `ensureOwnedUpdateRoot` / `downloadUpdate` / `installUpdate` |
| 离线优雅降级 | `metadata-unreachable` → `ERROR`，仅在该 root 内落盘，不触 data/backup。 | `checkForCandidate` catch 分支 |
| 完整性校验 | `downloadUpdate` 写 staging → rename → checksum 校验；`installUpdate` 二次校验，失败回 `ERROR / checksum-mismatch`，不激活、不启动。 | `downloadUpdate` / `installUpdate` |
| 重试 / 续传 | `Range` 续传 + 退避调度器 `createDesktopUpdaterScheduler`。 | `updater.ts` + `updater-scheduler` |

### 与业界方案的偏差与风险评估
- **未接入 electron-updater 的 `latest.yml` provider 模型**：本项目采用自建元数据（`metadata.json`）与 owned update store。风险：需自行保证元数据版本兼容与回滚发布流程；缓解：复用既有 `e2e` 与单元 fixtures（`createUpdaterFixture`）覆盖。
- **Linux 自动更新不支持**：与 electron 官方一致，返回 `UNSUPPORTED`。本任务 smoke 矩阵仅覆盖 mac/win 行为路径。
- **真实安装/升级需平台构建产物**：本机无 `.exe/.dmg/.AppImage` 发布资产（见资产盘点文档），故"真实安装/升级/离线/重启恢复"矩阵项 **BLOCKED**，仅以自动化/模拟检查（真实 `createDesktopUpdater` 代码 + `mkdtemp` 临时 root）覆盖隔离与不污染契约。

---

## 4. 结论与门禁清单

发布门禁以"不污染用户数据"为第一铁律，逐条映射到自动化契约：

1. **安装包冷启动**：需平台产物（BLOCKED，本机无 artifact）；可用 `tools/pack` + `lifecycle.ts` 的启动/停止逻辑做离线模拟。
2. **升级数据隔离 + Creator 备份可用**：路径契约断言 `dataRoot` / `updateRoot` / `runtimeRoot` / `backupRoot` 互相隔离，且 `backupRoot` 不在 `updateRoot`（含 `.back`）内。
3. **失败载荷回滚不污染 Creator 数据**：行为断言 `createDesktopUpdater` 在离线与失败安装时只写 `updateRoot`，不触碰 `dataRoot` / `backupRoot`。
4. **离线启动降级**：行为断言 `metadata-unreachable` → `ERROR`，应用保持当前版本、数据零写入。
5. **可重复 smoke 矩阵**：新增两个测试文件（packaged 路径契约 + desktop 行为），全部基于 `mkdtemp` 临时绝对路径，隔离命名空间，绝不读写真实 `.od` / 用户资产 / 运行中的守护进程。

> 本调研仅用于论证采纳原则与偏差，不构成任何"真实安装/升级 PASS"声明。真实安装验证因缺少发布资产而 BLOCKED（见资产盘点与验收文档）。
