# CW-07A — Creator 发布就绪与数据隔离审计 · 调研文档

> 性质：**只读审计与发布门禁设计**。本文档不开发任何产品功能，不修改任何 `source / test / config`，不合并、不 push。
> 仓库：`Creator-Workbench-Next`
> 分支：`feat/cw-07a-release-readiness-audit`（worktree `b9943b18c` 之上）
> 工作目录：`apps/packaged/`、`apps/desktop/`、`apps/daemon/`、`apps/web/`

---

## 0. 范围与约束（已执行，非口头承诺）

- 本任务**仅新增两份文档**（本文 + 验收文档），不改动任何既有文件。
- 已读取：`AGENTS.md`（根目录）、`apps/packaged/AGENTS.md`、`apps/daemon/AGENTS.md`，以及 `apps/packaged/src/{config,paths,launch}.ts`、`apps/desktop/src/main/updater.ts`、`apps/daemon/src/{server,daemon-paths}.ts` 及相关测试。
- 未启动 / 停止 / 删除任何用户现有 daemon、web dev server、Electron 进程。
- 未调用任何会修改真实 runtime 的 HTTP API；未创建任何 `cw07*` 种子数据。
- 临时日志仅落在系统临时目录 `C:/tmp/cw-07a-*`，任务结束即清理。
- 所有验证命令的退出码与摘要已在验收文档附录中如实记录。

---

## 1. 调研目标与方法

为回答"Creator 是否可对外稳定交付"以及"升级/回滚是否会破坏用户数据隔离"，我们调研三个高 Star 桌面应用框架/产品，关注以下维度：

1. **打包与安装目录隔离**（Windows 优先）
2. **用户数据目录契约**（单一真相源 / 命名空间隔离）
3. **升级与回滚时对用户数据的保护**
4. **备份 / 恢复能力（真实用户数据）**
5. **离线启动健壮性**
6. **发布 smoke test 矩阵设计**

调研方式：Agent Reach 子代理分别抓取电子仓库 README、docs、release notes、issue，按 Star、许可证、架构、升级/备份机制归类。

---

## 2. 参考项目调研结论

### 2.1 Electron — `electron/electron`

| 项 | 结论 |
|---|---|
| Star | ≈ 121k–123k（持续高位） |
| 许可证 | MIT |
| 用户数据目录 | `app.getPath('userData')` → `%APPDATA%/<product>/`；`setPath('userData'\|'sessionData'\|'logs', ...)` 可重定向 |
| 升级 | 经典方案 Squirrel.Windows；备份**仅覆盖应用二进制 / launcher 版本** |
| 用户数据保护 | 升级过程不触碰 `userData` 内的用户文件；但**无内建"备份用户数据"能力** |
| 隔离 | 靠 `userData` 路径本身实现；多实例/多命名空间需自行重定向 `setPath` |

**采用结论**：本仓库 `apps/packaged` 已采用 Electron，且 `launch.ts` 已通过 `applyPackagedElectronPathOverrides` 调用 `app.setPath` 做命名空间隔离——这与 Electron 官方推荐做法一致，无需替换框架。

**不采用结论**：Electron 自带的升级器（Squirrel）不备份用户数据这一事实，印证了"升级 ≠ 用户数据备份"。因此不能依赖 updater 保护 Creator 用户数据，需单独论证（见 §4）。

### 2.2 Tauri — `tauri-apps/tauri`

| 项 | 结论 |
|---|---|
| Star | ≈ 106k–108k |
| 许可证 | MIT / Apache-2.0 |
| 架构 | Rust 核心 + 系统 WebView（非内置 Chromium），体积小、内存占用低 |
| 升级 | `tauri-plugin-updater`，签名校验；备份同样**仅覆盖应用二进制** |
| 用户数据保护 | 用户数据落在 OS 标准目录；updater **不备份用户数据** |
| 备份 | 无内建用户数据备份 |

**采用结论**：Tauri 在体积/内存上有优势，但本仓库已深度绑定 Electron 桌面外壳、`updater.ts` 与 `packaged` 命名空间隔离逻辑，**迁移成本极高且与本审计目标（发布门禁）无关**。

**明确不采用**：**不迁移 Tauri**。本次审计结论是增量加固现有 Electron 路径的隔离与发布验证，而非重写桌面栈。

### 2.3 AppFlowy — `AppFlowy-IO/AppFlowy`

| 项 | 结论 |
|---|---|
| Star | ≈ 68k |
| 许可证 | AGPL-3.0（强 Copyleft，**商业分发需注意合规**） |
| 架构 | Rust 核心 + Flutter UI，本地优先（local-first） |
| 备份/恢复 | 提供 **workspace ZIP 导出/导入** 作为用户可触发的备份手段；**非升级时自动触发** |
| 升级风险 | 公开 release notes 记载 0.5.5 → 0.7.3 跨版本升级出现**数据损坏/结构不兼容警告**，需手动导出再升级 |
| 用户数据保护 | 依赖用户主动导出；无"升级自动备份"安全网 |

**采用结论**：AppFlowy 的"workspace ZIP 导出"是**唯一被调研项目提供的真实用户数据备份能力**，但其触发点是用户手动操作，而非升级流水线。这给了我们设计参考：若未来要做 Creator 用户数据备份，应走**显式、用户授权、可验证**的导出/恢复路径，而非依赖 updater。

**明确不采用**：**不做云同步**。AppFlowy 为本地优先且 AGPL 合规负担重；本仓库采用本地 `.od` 数据契约，不引入云端用户数据同步，避免合规与隐私风险。

---

## 3. 跨项目核心教训（已被本仓库印证）

1. **升级 ≠ 用户数据备份**（Electron / Tauri / AppFlowy 三者一致）：所有框架的 updater 只保护"应用自身"，从不保护用户数据。
2. **跨大版本升级数据损坏真实存在**（AppFlowy 0.5.5→0.7.3）：说明"升级前自动快照用户数据"是一个值得投入的发行级安全网，但必须**显式且可回滚**。
3. **隔离来自数据目录契约，而非框架**（Electron `userData` / Tauri OS 目录 / AppFlowy 本地库）：本仓库已有 `RUNTIME_DATA_DIR` / `OD_DATA_DIR` 契约，方向正确。

---

## 4. 对本仓库的具体采纳/不采纳清单

| 议题 | 结论 | 理由 |
|---|---|---|
| 迁移 Tauri | ❌ 不迁移 | 成本高、与发布门禁目标无关、Electron 路径已正确做命名空间隔离 |
| 云同步用户数据 | ❌ 不做 | AGPL/隐私/合规风险；本地 `.od` 契约已足够 |
| 自动备份真实用户数据 | ❌ 不自动 | 不引入静默后台备份；任何用户数据备份须**显式、用户授权、可验证、可回滚**（参考 AppFlowy 手动导出模型） |
| 命名空间隔离（现有 `packaged` 做法） | ✅ 保留并加固 | 与 Electron 官方推荐一致 |
| `OD_DATA_DIR` 绝对路径强制（现有 `paths.ts`） | ✅ 保留并补测试 | 防相对路径逃逸，是隔离第一道防线 |
| updater 仅保护 app payload | ✅ 保留 | 职责正确，但需在文档中明确"不保护用户数据"以避免误用 |

---

## 5. 调研产物的下游去向

本调研文档的全部结论，被验收文档 `2026-07-16-cw-07a-creator-release-readiness-audit.md` 引用，用于：

- 判定"升级/回滚是否破坏数据隔离"（审计目标 A、B）
- 给出发布 smoke matrix 的设计依据（审计目标 D）
- 支撑"不自动备份真实用户数据"的发布门禁红线

---

## 6. 参考来源（Agent Reach 抓取）

- `electron/electron` GitHub README + `app.getPath` / Squirrel 文档
- `tauri-apps/tauri` GitHub README + `tauri-plugin-updater` 文档
- `AppFlowy-IO/AppFlowy` GitHub README + Release Notes（0.5.x–0.7.x 升级警告）
- 本仓库现状代码审计（见验收文档附录引用的文件清单）
