# CW-09 桌面发布门禁 — 资产盘点与现有能力审计（Task 1）

> 分支：`feat/cw-09-desktop-release-gates` · 工作树：`.worktrees/cw-09-desktop-release-gates` · 基线：`main @ fe7c8e040`
> 性质：**只读审计**。未修改任何源码、配置或资产；未触碰真实 `.od`、用户项目、用户资产或运行中的守护进程。

---

## 1. 可安装发布资产（Win / macOS / Linux）是否存在？

**结论：本机不存在任何可安装的发布资产。 → 真实安装/升级验证 BLOCKED。**

只读检索结果（排除 `node_modules/`、`.git/`）：

| 资产类型 | 期望平台 | 命中 |
| --- | --- | --- |
| `*.exe`（NSIS 安装包） | Windows | 仅 `tools/pack/resources/win/7zip/7z.exe`（**构建期 7z 工具，非应用安装包**） |
| `*.dmg` / `*.zip`（mac 包） | macOS | 无 |
| `*.AppImage` / `*.deb` / `*.rpm` | Linux | 无 |
| `*.msi` / `*.nupkg` | Windows | 无 |
| `*.pkg` | macOS | 无 |
| `latest.yml` / 更新 feed | 全平台 | 无 |
| `*.sig` / `*.blockmap`（签名/差分） | 全平台 | 无 |

- 检索命令：`find . -type f ( -iname '*.exe' -o -iname '*.dmg' -o -iname '*.AppImage' -o -iname '*.msi' -o -iname '*.nupkg' -o -iname '*.deb' -o -iname '*.rpm' -o -iname '*.pkg' ) -not -path '*/node_modules/*' -not -path '*/.git/*'`
- 命中数：**1**（即 7z.exe 构建工具）。
- **含义**：CW-09 五项门禁中的"安装包冷启动 / 升级后数据可见 / 离线启动 / 重启恢复 / Windows 路径与符号链接"等需要真实平台产物的矩阵项，均因缺少 artifact 而 **BLOCKED**，只能以"自动化/模拟检查"（真实 `createDesktopUpdater` 代码 + `mkdtemp` 临时绝对路径）覆盖隔离与不污染契约（见 Task 2 / 验收文档）。

> 注：`tools/pack/resources/{win,mac,linux}` 下仅有图标、`7zip`、打包后处理脚本（`web-standalone-after-pack.cjs`）等**构建期资源**，不是最终可分发安装包。

---

## 2. 现有 安装 / 升级 / 回滚 / 离线 入口

| 能力 | 入口（文件） | 关键符号 / 行为 |
| --- | --- | --- |
| 命名空间路径契约（数据/更新/运行时/安装根隔离） | `apps/packaged/src/paths.ts` | `resolvePackagedNamespacePaths(config, namespace, env)`、`isPackagedDataDirAbsolute(value, platform)`、`OD_DATA_DIR` 绝对路径约束（含作用域 namespace 校验）。 |
| Creator 备份根解析（CW-08） | `apps/daemon/src/creator-backup/store.ts` | `resolveCreatorBackupRoot(dataDir) = dirname(dataDir)/backups/creator`；导出子路径 `@open-design/daemon/creator-backup`。只快照 5 个白名单 Creator JSON，绝不读用户资产。 |
| 桌面更新器（自建，可注入依赖） | `apps/desktop/src/main/updater.ts` | `createDesktopUpdater(configInput, deps?)`；状态机 `IDLE→CHECKING→AVAILABLE→DOWNLOADING→DOWNLOADED→INSTALLING`；错误态 `ERROR/UNSUPPORTED/NOT_AVAILABLE`。 |
| 更新 root 所有权保护 | `apps/desktop/src/main/updater.ts` | `ensureOwnedUpdateRoot`：空目录写 ownership sentinel；校验 `RELEASES/STAGING/DOWNLOADS/.back/HELPERS/STATE` 目录无逃逸（`.back = BACK_DIR`）。 |
| 下载 / 安装（含两阶段 checksum） | `apps/desktop/src/main/updater.ts` | `downloadUpdate`（staging→rename→校验，失败清 staging 置 ERROR）、`installUpdate`（二次校验；失败 `checksum-mismatch` 不激活不启动）。 |
| 离线降级 | `apps/desktop/src/main/updater.ts` | `checkForCandidate` 捕获 `fetchJson` 抛错 → `setState(ERROR, { code: "metadata-unreachable" })`；写入仅发生在 update root。 |
| Windows 安装/启动/停止/更新缓存生命周期 | `tools/pack/src/win/lifecycle.ts`、`tools/pack/src/update-cache-lifecycle-snapshot.ts` | `startPackedWinApp` / `stopPackedWinApp`（SHUTDOWN IPC + 强停）；更新缓存位于 `namespaceRoot/updates/{state/cleanup.json, releases/}`。 |
| 既有 e2e 驱动模式（可复用） | `e2e/tests/packaged-launcher-update-loop.test.ts` | 用 fixture HTTP server + `createDesktopUpdater` + `resolvePackagedNamespacePaths` 直接驱动，可作为 smoke harness 范本。 |

**关键架构事实（用于 Task 2 断言）：**
- `dataRoot = namespaceRoot/data`，`updateRoot = namespaceRoot/updates`，`runtimeRoot = namespaceRoot/runtime`，`installationRoot = namespaceBaseRoot/..`，`namespaceRoot = namespaceBaseRoot/<ns>`。四者（及 `backups/creator`）均为 `namespaceRoot` 下的**兄弟目录**，互不包含。
- 更新回滚 `.back` 位于 `updateRoot/.back = namespaceRoot/updates/.back`，**与** CW-08 Creator 备份根 `namespaceRoot/backups/creator` **物理隔离**。
- `@open-design/desktop` **不依赖** `@open-design/packaged` / `@open-design/daemon`；`@open-design/packaged` **依赖** `@open-design/daemon`（故 packaged 测试可经相对源码导入 `resolveCreatorBackupRoot`，无需改动 package.json）。

---

## 3. 现有测试覆盖缺口

| 缺口 | 现状 | 本任务补强 |
| --- | --- | --- |
| 发布隔离契约无专门测试 | `apps/packaged/tests/paths.test.ts` 仅覆盖 `dataRoot/updateRoot` 与 `OD_DATA_DIR`，**未断言** `runtimeRoot` 隔离、未断言 `backupRoot`（CW-08）与 `updateRoot`（含 `.back`）分离。 | 新增 `apps/packaged/tests/release-gate-isolation.test.ts`。 |
| 离线不污染数据无断言 | `apps/desktop/tests/main/updater.test.ts` 覆盖下载/校验/回滚，但**未断言**离线/失败时不触碰 `dataRoot` / `backupRoot`。 | 新增 `apps/desktop/tests/main/release-gate-updater.test.ts`。 |
| `.back` vs CW-08 备份分离无端到端证据 | 仅存在于源码布局，无测试固化。 | 路径契约测试显式断言二者互不包含。 |
| 真实安装/升级/离线/重启恢复 | 无（缺 artifact + 签名 + 平台构建）。 | **BLOCKED**，转为自动化/模拟检查 + 文档记录阻塞原因。 |

---

## 4. 不触碰真实数据前提下的"真实验证"可行性

| 验证项 | 是否可在不触碰真实 `.od`/用户资产/守护进程下执行 | 方式 |
| --- | --- | --- |
| 路径隔离契约（`data/update/runtime/backup` 互不污染、`.back` 与 CW-08 分离） | ✅ 可行 | 纯函数 `resolvePackagedNamespacePaths` + `resolveCreatorBackupRoot`，配合 `mkdtemp` 临时绝对 `namespaceBaseRoot` 与临时 namespace；不读写任何真实目录。 |
| 离线降级且不污染数据 | ✅ 可行 | 真实 `createDesktopUpdater`，`downloadRoot` 指向临时 `updates` 目录，`metadataUrl` 指向不可达端口（连接拒绝 → `metadata-unreachable`）；断言 `data` / `backups/creator` 零写入。 |
| 失败安装回滚不污染 Creator 数据 | ✅ 可行 | 真实 fixture server 完成下载 → 篡改 downloadPath → `installUpdate` → `ERROR/checksum-mismatch`；断言 `data` / `backups/creator` 未变、下载产物仅落 `updateRoot`。 |
| 冷启动真实安装包 | ❌ BLOCKED | 需平台构建产物（无 artifact）。 |
| 升级后数据 + Creator 备份真实可见 | ❌ BLOCKED | 需先有真实安装 + 升级流程（无 artifact）。 |
| 离线启动真实应用 | ❌ BLOCKED | 需真实安装包 + 真实 metadata 服务器不可达场景（无 artifact）。 |
| 重启恢复 / Windows 路径与符号链接 | ❌ BLOCKED | 需真实安装包与 Windows 平台（本机非目标安装环境）。 |

**结论**：所有"可编程/可模拟"的隔离与不污染契约均可由新增测试覆盖；所有"需要真实安装产物"的矩阵项因资产缺位而 BLOCKED，将在验收文档中如实标记，绝不伪称"真实安装/升级 PASS"。

---

## 5. 缺失项与 BLOCKED 标记汇总

| 项 | 状态 | 阻塞原因 |
| --- | --- | --- |
| Windows NSIS 安装包（`*.exe`） | **BLOCKED** | 仓库无发布 artifact；需 CI/本地打包产出。 |
| macOS 安装包（`*.dmg`/`*.zip`） | **BLOCKED** | 同上。 |
| Linux 安装包（`*.AppImage`/`*.deb`/`*.rpm`） | **BLOCKED** | 同上。 |
| 代码签名 / 公证（macOS Notarization、Windows Authenticode） | **BLOCKED** | 仓库无证书/`.sig`/签名配置；且本任务聚焦行为门禁，签名属发布流水线。 |
| 更新 feed（`latest.yml`/metadata 托管） | **BLOCKED（真实）** | 无托管端点；离线行为以"不可达端口"模拟。 |
| 真实安装/升级/离线/重启恢复矩阵 | **BLOCKED** | 综合上述缺 artifact + 签名 + 平台构建。 |
| 路径隔离契约测试 | **可自动化（已补）** | 新增 `release-gate-isolation.test.ts`。 |
| 离线/失败不污染数据测试 | **可自动化（已补）** | 新增 `release-gate-updater.test.ts`。 |

---

## 6. 后续真实验收所需前置（Next-Env Needs）

1. 平台构建产物：在 CI 或本地用 `tools/pack` 产出 Win/mac/Linux 安装包（需签名证书注入）。
2. 更新元数据托管：`metadata.json` + `latest.yml` 等价端点，支持"重新托管上一稳定版"的回滚发布流程。
3. 签名流水线：macOS 公证、Windows Authenticode；产出 `.sig` / `.blockmap`。
4. 真实环境：Windows 目标机用于验证路径/命名空间/符号链接；macOS 目标机用于公证后冷启动。

> 以上前置未就绪前，CW-09 仅以自动化/模拟检查关闭"逻辑门禁"；"物理安装门禁"在资产齐备后需重跑真实矩阵。
