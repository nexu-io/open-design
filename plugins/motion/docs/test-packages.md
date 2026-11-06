# 本地测试包：默认 npm，完整 ZIP 备用

当前源码位于 OD 的 `plugins/motion/`；下列模块命令在该目录执行。活动工作流在仓库根目录 `.github/workflows/motion.yml`，发布保持关闭。迁移基线及历史验收范围见[迁移说明](repository-migration.md)。

MCP 公开入口由包内 `shared/mcp-release.json` 固化，详见[一期注册清单](mcp-phase1-tools.md)。`build <target> <beta-version> [legacy|phase1]` 将 profile 和工具名写入 `release.json`；默认沿用源码的 phase1，公开9个 motion_ Tool 并只包含4个配套 Skill。缺注册时在创建 staging／ZIP 前失败；本次验证的插件 ZIP 不等于各平台完整原生包已重新验收。

本流程服务于团队试装和问题复现；当前只有测试渠道，尚未启用正式包或自动升级。编辑器和模板业务使用同一份源码。完整包同时包含模型网关 gateway/；供应商 Key 和本机 Agent 登录仍由用户配置，不随包分发。

## 手动构建

合入后，在 OpenDesign 仓库 → Actions → **Motion standalone checks** → Run workflow 选择 `format`。默认 `npm`，`full` 组装两个已声明目标的完整 ZIP。两种格式共用源码、锁定依赖和唯一 beta 版本。

| 选择 | 构建产物 | 运行时 |
| --- | --- | --- |
| `npm`（默认） | 轻量安装器 `.tgz`、应用 `.tar.gz`、`release-npm.json`、SHA256 | 目标机按应用 lockfile 安装 npm 依赖；首次需要时下载固定原生工具 |
| `full`（备用） | Mac arm64 / Windows x64 完整 ZIP、SHA256、`release-<target>.json` | 内置目标平台 Node、生产依赖和原生工具 |

当前 OD 工作流只构建和校验，不上传 Actions 制品，不发布 npm、Release 或存储对象；两种格式误勾 `publish` 均会失败。本地构建的制品位于 `plugins/motion/dist/`，按 [npm 安装说明](npm-installation.md) 使用相邻的安装器、应用归档和清单。

版本为 `下一补丁版本-beta.<run-number>.<attempt>`。例如源码 0.6.2 的第 42 次构建生成 0.6.3-beta.42.1。npm 安装器、应用 package.json、应用锁文件和 MCP 版本一致；清单记录源码 HEAD、构建身份和校验值，既有输出目录拒绝覆盖，源码版本不会被构建改写。

PR / main 工作流执行清单、类型、Studio 构建与回归、安装/打包测试，以及九个 Tool 的真实 ZIP E2E。Linux 是组装与测试环境，不是已支持的用户运行平台。Mac / Windows 的最终安装和真实出片仍须在对应系统验收；当前 OD 工作流没有 Windows 或 Mac 原生验收 job，不把产包成功写成通过。

## 固定运行时

`scripts/runtime-lock.json` 锁定版本、来源和 SHA256：Node 26.11.1、Chromium 156.0.8078.47、FFmpeg 9.0.2、Hyperframes 0.9.7。校验后才解包。网页只编译一次；npm 直接依赖使用精确版本、package-lock.json 固定传递依赖，目标机用 npm ci --omit=dev --ignore-scripts；安装器没有外部 npm 依赖。浏览器必须与锁定的 Puppeteer 版本一致。完整 ZIP 的生产依赖仍按目标 OS/CPU 分目录装配预编译包，禁用跨平台安装脚本，不复用构建机的 node_modules。Mac 改用 [Martin Riedl 的公开 9.0.2 构建](https://ffmpeg.martin-riedl.de/)，FFmpeg/ffprobe 分别固定带构建日期/版本的 ZIP 和上游 SHA256；完整包自动合并到原 runtime/media/bin 布局，不再 checkout 私有冻结归档。它们是第三方预编译包。Windows 使用 Gyan 官网指向的 GitHub 镜像，固定 9.0.2 地址与原 SHA256；Gyan 站点直链在本次原生 CI 下载超时。重定向必须保持 HTTPS；所有原生来源公开，下载器不发送仓库凭据。

| 测试包 | 最低系统要求 | 构建 / 运行验收 |
|---|---|---|
| mac-arm64 | macOS 26.0，本轮支持与验证基线，旧系统未验收 | Linux 装配 / Mac 本机验收 |
| win-x64 | Windows 11，实际链路以 smoke 结果为准 | Linux 装配 / Windows 目标机独立验收 |

没有 Linux、Intel Mac 或 Windows arm64 完整包，也没有旧 macOS 兼容承诺。本需求不重新选择编辑器方案。

## 完整 ZIP 备用试安装

将最终 ZIP 交给 Codex：

> 请将此 OpenMotion 测试包安装到稳定的用户应用目录，读取包内安装说明，注册 openmotion-test 原生插件，保留其他插件和已有工程。运行包内适用平台的安装脚本，验证 MCP 版本、模板和预览，在新会话使用。

Agent 负责展开 ZIP。包内含 Node、浏览器、媒体工具和生产依赖，无需用户另外执行 npm install。

工程默认在 `~/OpenMotion-test-data`，独立于包和插件缓存；可通过 `MOTION_DATA_DIR` 指定已有目录。试装不自动迁移、卸载 motion-local；若同时启用，测试会话需明确选择本次插件，避免同名工具混淆。

Mac 入口为 scripts/install.command；Windows 为 scripts/install.ps1。Agent 也可在当前终端执行：

```text
<包内Node> <展开后的包目录>/scripts/configure-plugin.mjs
codex plugin marketplace add <展开后的包目录>
codex plugin add motion@openmotion-test
codex plugin list --marketplace openmotion-test
```

安装器先把当前应用目录写入薄插件配置，再注册到 Codex。完整应用、生产依赖与运行时留在安装目录；Codex 缓存只包含入口、技能与文档，避免再次复制完整运行时。原生插件入口路径在安装时生成，不包含构建机路径。应用目录不要在安装后移动，移动或更换版本后重新执行安装器。Windows 应使用较短的目录（如用户目录下的 OpenMotion-test），避免浏览器完整路径达到 260 字符；启动前会给出明确提示。安装器不重启 Codex。升级安装新的唯一版本，工程保留在包外；跨版本工程兼容和回退仍需另行验证。

完整包也保留 `scripts/export-adapters.ts` 及其无依赖 ZIP helper，可在目标安装机器为四家生成绑定该应用的薄适配器；不要在 Linux 装配阶段固化目标机路径。原有 Codex 安装入口保留，其他宿主的生成和独立验收见 [多 Agent 适配器](agent-adapters.md)。

## 本地复现与验收

默认轻量格式在 `npm ci`、`npm run build:studio` 后执行：

```sh
version=$(node scripts/test-package.mjs version 42 1)
node scripts/package-npm.mjs "dist/$version" "$version"
node scripts/smoke-npm-package.mjs "dist/$version/release-npm.json" /absolute/path/to/codex/bin/codex.js
```

须在支持的目标系统执行 smoke；Linux 只装配，不代表支持 Linux 原生运行。共享机器的浏览器验收继续使用 browser-lock 的真实锁和分配端口。实际目标机检查还会自动从公开源下载原生依赖，无需公司仓库读取权限。以下为完整 ZIP 的原复现入口：

构建机需要 Node 26.11.1、Git、tar、zip 和 unzip；CI 使用工作流中固定的 Node 版本。Node、浏览器、FFmpeg 和 ffprobe 均从固定公开 HTTPS 地址下载并校验 SHA256；构建原生运行时不使用仓库 Token、额外 Secret 或私有源码 checkout。

```sh
npm run package:test -- prepare mac-arm64
npm ci
npm run build:studio
npm run package:test -- build mac-arm64 0.6.2-beta.42.1
npm install --prefix .tools/codex-cli --ignore-scripts --no-audit --no-fund @openai/codex@0.166.0
node scripts/smoke-test-package.mjs <最终ZIP路径> .tools/codex-cli/node_modules/@openai/codex/bin/codex.js
```

同一 Linux 构建机将 target 改为 win-x64 即可装配 Windows 包。目标机只执行 smoke，不重新打包。验证从含空格与中文的新路径展开最终 ZIP，使用系统临时目录中的独立 Codex 配置和工程目录，检查原生安装、最小 PATH 下 MCP 握手、模板、工作流、Studio HTTP，以及有声音、有运动的 1 秒 MP4 和成片技术检查；验收优先使用共享浏览器锁分配的端口，否则由系统分配临时空闲端口；不固定占用 54900，避免共享 Windows runner 的其他服务冲突。验收在首次启动时保存进程归属，避免后续预览复用覆盖登记后遗留服务；结束时按版本和工程目录校验后，只清理测试自身创建的进程。模型回合、独立播放器、旧系统及跨版本回退不由此代替。
