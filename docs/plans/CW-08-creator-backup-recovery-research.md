# CW-08 Creator 本地备份/恢复 调研

本调研为 CW-08 Creator 本地备份/恢复功能提供可落地的设计原则。采用方案：**由桌面主进程（main process）编排的手动本地快照、校验与受控恢复**。备份仅包含 Creator 受管元数据与恢复所需的项目关联数据，不触碰真实用户素材；备份根位于 `dataRoot` 之外的受控 namespace；恢复只由 packaged 主进程暴露的显式能力（capability）发起，绝不作为普通浏览器/HTTP 写端点暴露。

## 来源与采纳原则

| 项目 | Stars | 来源 URL | 采纳原则 |
| --- | --- | --- | --- |
| electron/electron | 122,052 | https://github.com/electron/electron | 主进程是唯一可信区：用户数据走 `app.getPath('userData')`，与 `app.asar` 安装目录物理隔离；IPC 必须经过 preload + contextBridge 的最小化、参数校验的桥接，主进程侧再做一次校验（纵深防御）。 |
| tauri-apps/tauri | 109,146 | https://github.com/tauri-apps/tauri | 默认拒绝：所有命令默认被 ACL 阻断，仅在 `capabilities/` 显式授权（`permissions` + `scopes` + `windows`）后才对指定窗口开放；恢复这类高危操作必须作为显式权限，而非默认/远程可达能力。 |
| AppFlowy-IO/AppFlowy | 73,922 | https://github.com/AppFlowy-IO/AppFlowy | 本地优先（local-first）：用户数据 100% 由用户掌控、可自托管；备份范围只应是「受管元数据 + 项目关联引用」，不搬运原始二进制素材，降低备份体积与隐私面。 |
| kakehashi-inc/app_backup_restore | 0 | https://github.com/kakehashi-inc/app_backup_restore | 实现参考（低权重）：主进程 service 层负责导出（JSON）+ 维护 `backup_metadata.json` 清单，渲染端经 preload 的 `window.abr` 安全桥接调用；采用「按应用粒度还原 + 可导出脚本」的顺序执行思路。（仅作结构参考，不作为安全权威） |

> Star 数于 2026-07-17 经 GitHub API（`api.github.com/repos/<owner>/<repo>`）核验。kakehashi-inc/app_backup_restore 实测 0 star，作为实现参考。

## 调研重点与结论

### 1 数据/更新分离

- **原则（electron）**：Electron 程序文件打包在 `app.asar`/安装目录（`Program Files`、`/Applications`），用户数据落在 `app.getPath('userData')`（Windows `%APPDATA%/<App>`、macOS `~/Library/Application Support/<App>`、Linux `~/.config/<App>`）。`electron-updater`/`electron-builder` 全量更新只覆盖安装目录，**不触及 `userData`**；若把数据写进安装目录，更新会被删除。
- **适用**：Creator 的元数据/配置写入 `userData`（或受管 dataRoot），**备份根放在 dataRoot 之外的受控 namespace**（如 `userData/backups/` 下独立归档目录），与「实时数据目录」和「安装目录」三者分离，确保：更新不破坏备份、备份不包含应用二进制。
- **适用（AppFlowy）**：备份只含受管元数据与恢复所需的项目关联数据（路径引用/索引），**不纳入真实 `.od`/原始素材**，从而备份体积可控且备份过程不读取/复制用户隐私素材。

### 2 快照→校验→原子恢复→回滚的顺序

- **停写（stop writes）**：恢复前由主进程发出「暂停写入」信号（冻结元数据写入/关闭相关会话），确保快照或恢复目标在写入视图上一致。安全点：写操作集中收敛在主进程，主进程是唯一能暂停/恢复写入的地方；渲染端无法直接触发。
- **建快照（snapshot）**：在受控 namespace 下创建本次快照目录（如 `backups/snap-<ts>-<rand>/`），仅复制 allowlist 内文件。安全点：目录名带时间戳+随机量，避免覆盖既有备份。
- **校验（validate）**：恢复前逐文件比对 `manifest` 中的 `sha256` 与实算值，并校验 `schemaVersion` 兼容性与 allowlist 完整性；任一不匹配即中止。安全点：不信任任何未通过校验的输入。
- **原子恢复（atomic restore）**：用**整目录 `rename`/原子替换**提交恢复结果（先把目标写入临时目录，再 `rename` 到最终位置），使「恢复中」状态对应用不可见。安全点：要么看到完整新版本，要么仍是旧版本，不存在半写状态。
- **失败回滚（rollback）**：恢复前先对当前活动数据做「回滚点」（同 namespace 快照），若校验或 `rename` 失败则回退到回滚点，并清理半成品临时目录。安全点：保持「可恢复的前一状态」始终存在。

### 3 Electron IPC 最小权限边界

- **原则（electron 安全默认值）**：`contextIsolation: true`（12+ 默认）、`nodeIntegration: false`（5+ 默认）、`sandbox: true`（20+ 默认）。preload 只通过 `contextBridge.exposeInMainWorld` 暴露**单一、已校验参数**的函数（如 `restore: (snapshotId) => ipcRenderer.invoke('backup:restore', snapshotId)`），**绝不** `exposeInMainWorld('x', ipcRenderer.send)` 暴露原始 IPC。主进程 `ipcMain.handle` 内再做路径前缀校验（`safePath.startsWith(backupRoot)`）防止路径穿越。
- **为什么恢复不能作为普通 Web/HTTP 写端点**：若将恢复做成 localhost HTTP 写路由（如 `POST /api/restore`），它等同把「任意能连该端口的网页/扩展/进程」当作可信写入者，绕过了渲染端沙盒与显式用户意图确认，且无法约束仅对指定 windows 开放——本质是放大攻击面。Electron 明确把 IPC 当作「来自不可信客户端的请求」来校验。
- **原则（Tauri capability/permission）**：Tauri v2 默认**所有命令被 ACL 拒绝**，只有在 `capabilities/<name>.json` 里对指定 `windows` 显式授予 `permissions`（并可加 `scopes` 限制目录/URL），命令才可被前端调用；`deny` 优先于 `allow`。映射：恢复只在专有能力文件里授权给主窗口，且用 `fs:scope`/`shell` 等作用域收窄到备份 namespace，**远程 URL 不授予该能力**。Electron 侧以「主进程显式能力 + 参数白名单 + 路径前缀校验」达到等价边界。

### 4 manifest/allowlist/SHA-256/schemaVersion 设计

- **备份清单（manifest）**：每个快照根放 `manifest.json`，字段含 `schemaVersion`、`createdAt`、`appVersion`、`entries[]`（相对路径 + `size` + `sha256` + `mtime`）、`allowlist[]`、`sourceDataRoot`。恢复时以 manifest 为准，而非盲目复制目录。
- **文件 allowlist**：恢复/备份只允许 allowlist 内相对路径（受管元数据、配置、项目关联索引），**显式排除** `node_modules`、安装目录、`*.log`、原始素材目录、任意绝对路径；任何 allowlist 之外的条目在校验阶段直接拒绝。
- **SHA-256 逐文件哈希**：备份时对每个文件计算 `sha256` 写入 manifest；恢复时重算并与 manifest 比对，不匹配视为损坏/篡改并中止。安全点：防静默损坏、防内容替换。
- **schemaVersion 字段**：manifest 顶部记录格式版本（如 `1`）；主进程按 `schemaVersion` 决定可否恢复、是否需要迁移；版本不兼容时拒绝并提示，避免旧备份以新格式语义被误读。

## 设计约束（来自本任务红线）

- 不碰真实 `.od` / 真实素材；验收只使用临时目录、mock、fixture。
- 不云同步、不调用第三方 API、不静默/自动备份（仅手动触发本地快照）。
- 备份只含 Creator 受管元数据与恢复所需项目关联数据（不含原始素材）。
- 备份根位于 `dataRoot` 之外的受控 namespace（与实时数据目录、安装目录三者分离）。
- 恢复只由 packaged 主进程受控能力发起，绝不作为普通浏览器/HTTP 写端点暴露。
- 禁止任意客户端路径（路径前缀校验 + allowlist，防路径穿越）。
- 禁止跳过/放宽测试；恢复须覆盖校验失败、原子提交失败、回滚成功的用例。
