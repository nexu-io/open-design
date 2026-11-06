# npm 轻量安装包（仅本地验证）

当前源码位于 OD 的 `plugins/motion/`；下列模块命令在该目录执行。活动工作流在仓库根目录 `.github/workflows/motion.yml`，发布保持关闭。迁移基线及历史验收范围见[迁移说明](repository-migration.md)。

这条安装渠道服务已有 Codex、Claude Code、DeepSeek Harness 或 WorkBuddy，以及 Node.js 22.18+ 和 npm 的用户。一次 setup 为所选宿主安装一期 9 Tool MCP 连接与 production/director/template/recreate 四个 Skills；应用、用户工程和原生工具各自保存。当前没有发布 npm 包或公开下载源，包的 `private: true` 保留，以下命令只使用本地制品。

## 构建与安装

在源码目录执行 `npm ci`、`npm run package:npm`。构建会生成：

- `dist/npm-local/openmotion-installer-0.6.2-local.1.tgz`：无 npm 依赖的 JS 安装入口，不含应用、Node、FFmpeg、浏览器或用户数据。
- `dist/npm-local/openmotion-application-0.6.2.tar.gz`：单独的应用资源，包含服务源码、预先构建的 Studio、Skills 和文档，不含 node_modules 或原生程序。
- `dist/npm-local/release.local.json`：固定应用 SHA256 与原生工具来源、版本和 SHA256。应用地址相对本清单解析，可将两个文件一起移动。

```sh
npx --yes --package /absolute/dist/npm-local/openmotion-installer-0.6.2-local.1.tgz openmotion setup --host codex --manifest /absolute/dist/npm-local/release.local.json
```

默认应用根目录是 macOS/Linux 的 `~/.local/share/openmotion` 或 Windows 的 `%LOCALAPPDATA%/openmotion`；用户工程在该目录的 `data/`，应用和缓存分别在 `apps/`、`cache/`。可用 `--home`、`--data-dir` 选择位置；不允许工程放进应用、缓存或受管理的宿主组合包。setup 不需要管理员权限或修改全局 PATH。

通过 `--host codex|claude|deepseek|workbuddy` 选择宿主，省略时兼容保留 Codex。四家使用同一个 `--home` 和清单时，复用同一应用、Node 绝对路径、`run-mcp.mjs`、工程目录与原生缓存；每个客户端仍启动自己的 stdio 连接。宿主选择和配置位置记录在 `install.json.hosts`，新增宿主不会丢失先前安装记录。

| 宿主 | MCP 注册 | Skills 加载 |
| --- | --- | --- |
| Codex | 官方 `codex mcp add openmotion` | `~/.agents/skills/openmotion/` 下完整技能/文档包，递归发现 |
| Claude Code | 官方 `claude mcp add-json -s user openmotion` | `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/` 中直接子目录；保留全部 4 个 Skills |
| DeepSeek Harness | 官方 `dsh plugin --profile web add <本地组合包> --ignore-scripts` | 独立的 Skill provider 扫描组合包 `skills/` 的直接子项，保留已有 provider 和配置 |
| WorkBuddy | 合并 `${WORKBUDDY_CONFIG_DIR:-~/.workbuddy}/mcp.json` 中的 `mcpServers.openmotion` | 同一配置根目录的 `skills/` 直接子目录；本地自定义 MCP + Skills，不发布 Connector |

Claude Code 和 WorkBuddy 的平铺技能目录内写入 `openmotion-install.json`，记录应用位置；共享文档链接在安装时改写为有效绝对路径。Codex/Harness 保留完整包的相对资料布局。新会话或重新加载后使用 Skills。

升级前关闭旧 MCP 连接，并按 [共享编辑器说明](shared-editor.md) 停止同一数据目录的旧后台；安装后重新连接 MCP、重新加载 Skills。后台身份包含 npm 原生下载器和原生锁文件，遇到版本或代码不兼容会报错要求停止旧后台，安装器不自动结束已有进程。

`--skills-dir` 可选择 Codex、Claude Code、WorkBuddy 的技能根目录；Harness 使用其专属 provider 根目录，不改动用户的全局技能目录。`--codex`、`--claude`、`--dsh` 可指定可执行文件，Harness 的 `--profile` 默认 `web`；macOS 本机没有 dsh 命令时优先使用已安装桌面包的官方 CLI。Windows 应使用能直接启动的宿主可执行文件。注册阶段使用宿主自身配置根（`CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`DSH_HOME`、`WORKBUDDY_CONFIG_DIR`）；应用根始终由 `--home` 控制，二者不混用。

例如在同一台机器依次执行（其他参数与上面的 setup 相同）：

```sh
openmotion setup --host claude --manifest /absolute/release.local.json --home /absolute/shared-openmotion
openmotion setup --host deepseek --profile web --manifest /absolute/release.local.json --home /absolute/shared-openmotion
openmotion setup --host workbuddy --manifest /absolute/release.local.json --home /absolute/shared-openmotion
```

安装器保留其他 MCP、Skills 与用户配置。已有同名入口或 Skills 若不是本安装器管理则拒绝覆盖。WorkBuddy 配置在独立锁内重新读取并合并，保留其他设置；Harness 的本地组合包由官方配置工具加入所选 profile，不手工拼接或覆盖现有 YAML。重复安装复用同一应用与数据，更新同一个安装根目录时不允许隐式切换工程目录。安装失败回退本次 Skills 和安装记录；已校验的应用缓存保留供重试。

## Actions 默认轻量产物

OD 的 **Motion standalone checks** 手动工作流默认 `format=npm`，`format=full` 保留 Mac arm64 / Windows x64 完整 ZIP 组装。当前工作流只在 runner 内构建和校验，不上传 Actions 制品，不发布 npm、Release 或存储对象；两种格式误勾 `publish` 都会拒绝。公开下载服务不属于本次迁移。

CI 在 Studio 构建后执行 `node scripts/package-npm.mjs dist/<beta> <beta>`，生成 `openmotion-installer-<beta>.tgz`、`openmotion-application-<beta>.tar.gz`、`release-npm.json` 与 SHA256 文件。安装器与应用/MCP 统一使用唯一 beta 版本；源 checkout 不被 bump，已有 beta 输出目录拒绝覆盖。清单同时固定应用、安装器、npm 锁文件与原生锁文件的 SHA256 和源码/构建身份。

本地生成制品后，将上文 npx 命令里的 tgz 替换为该 beta 文件，`--manifest` 指向相邻 `release-npm.json`。生产 npm 依赖在应用目录用 `npm ci` 安装；不是依赖消费者自动采用 tgz 内的 package-lock.json。一期应用按同一 phase1 注册表仅包含 9 个公开 Tool 和四个入口；平铺宿主升级会移除本安装器拥有的已退出入口，并保留其他宿主/用户技能。依赖和原生版本沿用迁移源锁文件。

目标系统验收继续使用 `scripts/smoke-npm-package.mjs`，支持 `--codex` 对应的 `.js` / `.mjs` CLI 入口。检查实际安装、原生 Skill 发现、MCP、延迟下载、缓存、Studio、音画导出与技术校验；独立播放器和模型回合仍需单独验证。OD 工作流当前执行 Linux 组装与九 Tool ZIP E2E，不包含 Windows 实机验收；Windows 与 Mac 的安装验收在对应机器运行，不能从组装成功推断通过。

## 按需下载与复用

setup 仅获取应用并按 lockfile 运行 `npm ci --omit=dev --ignore-scripts`，不运行依赖安装脚本、不下载原生工具。MCP 握手、工具发现、工作流和引擎指南资源读取也不触发原生下载。首次工程操作需要启动本地服务时（例如创建工程或打开预览），准备固定的 FFmpeg、ffprobe 和 Chromium；也可在安装后主动执行：

```sh
npx --yes --package /absolute/dist/npm-local/openmotion-installer-0.6.2-local.1.tgz openmotion prepare --home /absolute/install-root
```

npm 可以通过带 `os/cpu` 的平台包及安装脚本自动配置原生程序。本渠道保留“首次使用再下载”的时机，因此由运行时按固定清单自动准备；不要求用户手动安装 FFmpeg/ffprobe，也不执行 brew/winget。

原生依赖按 OS/CPU 和内容 SHA256 保存到用户缓存，采用互斥锁、校验后解包和完成标记，后续直接复用。下载失败不标记为可用；不会自动换版本或执行 brew/winget。显式指定 `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` / `HYPERFRAMES_BROWSER_PATH` 时使用用户的程序（旧媒体路径变量和 `MOTION_BROWSER_PATH` 也支持）；缺失的组件仍按固定版本下载。Node/npm 由宿主已有环境提供，不随轻量包下载。

固定源与完整测试包共用 `scripts/runtime-lock.json`，目前只有 Mac arm64、Windows x64。Mac 使用 [Martin Riedl 公开的 9.0.2 发布构建](https://ffmpeg.martin-riedl.de/)：FFmpeg 和 ffprobe 分别固定带构建日期/版本的 ZIP 地址及上游 SHA256，分别缓存和验证，不使用 latest；Windows 继续使用固定 Gyan 公开归档。浏览器来自固定版本的 Chrome for Testing。所有原生下载均无需公司账号或仓库凭据，下载器不附带仓库 Token。安装器自动选择 OS/CPU、下载、校验和设置路径，用户不需要手动安装 FFmpeg/ffprobe。当前仍以 macOS 26、Windows 11 为已声明目标，按需下载不自动扩大系统兼容范围。

本地清单也允许显式 `file:` 资源，用于离线夹具或验证已冻结的原字节；同样检查 SHA256。HTTP、凭据嵌入 URL、非法解包路径或缺少校验值会被拒绝。被强制终止的安装可能留下 PID 锁；确认对应进程已经退出后才能删除锁重试。

## 本地验收

隔离设置四家各自的配置根，并通过 `--home`、`--skills-dir`、`--data-dir` 指定全新目录；不把测试安装进日常配置。验收最终 npm tgz、Skills 发现、宿主实际解析的 MCP 启动配置、首次原生下载、第二次缓存复用、Studio 以及一秒有声音和运动的导出。定向自动测试覆盖清单/路径校验、校验失败、锁、配置冲突、重复安装和失败回退。

安装成功、MCP 连接和技术导出不代替模型创作回合、独立播放器或其他操作系统实测。当前一期契约见 [9 Tool 说明](mcp-phase1-tools.md)。本轮按最新主干重新验证，实际结果记在 [需求记录](product/changes.md#req-20261105-013npm-轻量安装与-actions-默认产物) 及交付日志；不把旧 28 Tool/旧四入口原型的验证当作当前一期验收。

WorkBuddy 桌面对话/模型调用、Windows 实机和公网冷下载须分别验收。本渠道不改变系统支持范围，不新增发布、自动升级、账号或计费能力。
