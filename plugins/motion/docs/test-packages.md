# 内部测试包：默认 npm，完整 ZIP 备用

当前源码位于 OD 的 `plugins/motion/`；下列模块命令在该目录执行。活动工作流在仓库根目录 `.github/workflows/motion.yml`，发布保持关闭。迁移基线及历史验收范围见[迁移说明](repository-migration.md)。

MCP 公开入口由包内 `shared/mcp-release.json` 固化，详见[一期注册清单](mcp-phase1-tools.md)。`build <target> <beta-version> [legacy|phase1]` 将 profile 和工具名写入 `release.json`；默认沿用源码的 phase1，公开9个 motion_ Tool 并只包含4个配套 Skill。缺注册时在创建 staging／ZIP 前失败；本次验证的插件 ZIP 不等于各平台完整原生包已重新验收。

本流程服务于团队试装和问题复现；当前只有测试渠道，尚未启用正式包或自动升级。编辑器和模板业务使用同一份源码。完整包同时包含模型网关 gateway/；供应商 Key 和本机 Agent 登录仍由用户配置，不随包分发。

## 手动构建

合入后，在 OpenDesign 仓库 → Actions → **Motion standalone checks** → Run workflow 选择 `format`。默认 `npm`，`full` 组装两个已声明目标的完整 ZIP。两种格式共用源码、锁定依赖和唯一 beta 版本。

| 选择 | 构建产物 | 运行时 |
| --- | --- | --- |
| `npm`（默认） | 轻量安装器 `.tgz`、应用 `.tar.gz`、`release-npm.json`、SHA256 | 目标机按应用 lockfile 安装 npm 依赖；首次需要时下载固定原生工具 |
| `full`（备用） | Mac arm64 / Windows x64 完整 ZIP、SHA256、`release-<target>.json` | 内置目标平台 Node、生产依赖和原生工具 |

当前 OD 工作流只构建和校验，不上传 Actions 制品，不发布 npm、Release 或存储对象；两种格式误勾 `publish` 均会失败。本地构建的制品位于 `plugins/motion/dist/`，按 [npm 安装说明](npm-installation.md) 使用相邻的安装器、应用归档和清单。旧 Forgejo 发布辅助脚本保留，但 OD 工作流不调用；重新接通公司分发源前，需要配置仓库和源码提交的关联。

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

构建机需要 Node 26.11.1、Git、tar、zip 和 unzip；CI 使用固定 digest 的官方 Node Linux 镜像。Node、浏览器、FFmpeg 和 ffprobe 均从固定公开 HTTPS 地址下载并校验 SHA256；构建原生运行时不使用仓库 Token、额外 Secret 或私有源码 checkout。

```sh
npm run package:test -- prepare mac-arm64
npm ci
npm run build:studio
npm run package:test -- build mac-arm64 0.6.2-beta.42.1
npm install --prefix .tools/codex-cli --ignore-scripts --no-audit --no-fund @openai/codex@0.166.0
node scripts/smoke-test-package.mjs <最终ZIP路径> .tools/codex-cli/node_modules/@openai/codex/bin/codex.js
```

同一 Linux 构建机将 target 改为 win-x64 即可装配 Windows 包。目标机只执行 smoke，不重新打包。验证从含空格与中文的新路径展开最终 ZIP，使用系统临时目录中的独立 Codex 配置和工程目录，检查原生安装、最小 PATH 下 MCP 握手、模板、工作流、Studio HTTP，以及有声音、有运动的 1 秒 MP4 和成片技术检查；验收优先使用共享浏览器锁分配的端口，否则由系统分配临时空闲端口；不固定占用 54900，避免共享 Windows runner 的其他服务冲突。验收在首次启动时保存进程归属，避免后续预览复用覆盖登记后遗留服务；结束时按版本和工程目录校验后，只清理测试自身创建的进程。模型回合、独立播放器、旧系统及跨版本回退不由此代替。

## 原 Forgejo 发布链路（历史参考）

源仓库曾使用分块上传、90 天保留期的 Release 外链和独立内部镜像。相关上传辅助脚本保留源码，当前 OD 工作流没有启用这些发布能力。源仓库的旧版本、镜像和权限状态不由本次迁移改变。以下验收记录对应原源码版本，不能代替迁入 OD 后的验证。

## 2026-11-04 阶段验证

- [CI #44](https://code.powerformer.net/core/open-motion/actions/runs/44) 在 Linux 生成两个完整 ZIP；Windows 原生安装、MCP、Studio、带声音的一秒 MP4、运动帧及技术验收通过。同版 Mac 原包也在本机通过上述验收。版本 0.6.2-beta.44.1，完整源码提交 23ab9bb03fd1ffd2072bb94ea0e30305a8220ea2。
- Mac ZIP 约 252 MiB；Windows ZIP 约 360 MiB。Windows 渲染在 260 字符的浏览器路径报 ENOENT，改为短目录后通过；启动时会提示安装路径过长。Codex 使用薄入口，完整运行时不再复制进插件缓存。测试用 Codex CLI 0.166.0，不代替桌面端模型回合或独立播放器验收。
- 原生安装后最小 PATH 下提供 Node、FFmpeg、Chrome 路径；Windows 同时补入系统自带 PowerShell 的标准目录。macOS 临时目录使用真实路径，避免 /var 与 /private/var 别名误报。
- [CI #82](https://code.powerformer.net/core/open-motion/actions/runs/82) 的最终版本 **0.6.2-beta.82.1** 已完成两个平台的分块上传及 [测试 Release 发布](https://code.powerformer.net/core/open-motion/releases/tag/openmotion-v0.6.2-beta.82.1)，产包源码为 0588a13eede5a18d234b038fac18a8d80d72457b。Windows 在全新目录完成安装、MCP、Studio、有声运动 MP4 及技术校验；Mac 从本地镜像取回同轮原 ZIP，也完成上述验收。镜像容器重启后，两个 ZIP 的下载 SHA256 仍与上游一致。
- Windows 启动诊断已分别比较 Node 26/24、日志文件/管道、前后台启动、原工程/新工程及无字体缓存；同一旧包复用目录时能启动，但 CI #70 全新安装再次复现。随后同一 ZIP 在新目录关闭 Node 编译缓存，Studio 约 13 秒就绪；与 [Node Windows 编译缓存问题](https://github.com/nodejs/node/issues/66438) 的症状相符。当前仅对 Windows Hyperframes 子进程设置 NODE_DISABLE_COMPILE_CACHE=1，保留冻结版本和原 60 秒超时；Mac 不变，CI #78 的同一原包对照通过完整出片，包含修复的最终 #82 原生验收也已通过。#81 的另一次失败是共享 runner 固定测试端口占满，已改为动态端口；未计作通过。
- [CI #47](https://code.powerformer.net/core/open-motion/actions/runs/47) 与 [CI #49](https://code.powerformer.net/core/open-motion/actions/runs/49) 另遇 Studio 60 秒启动超时；未改大超时、未计通过，已补启动输出诊断。最新版结果随对应 run 记录，不能用早期成功覆盖后续失败。
- [CI #61](https://code.powerformer.net/core/open-motion/actions/runs/61) 完成 252 MiB 原 Mac ZIP 分块上传及测试 Release 发布；完整下载 SHA256 为 4512a3251dd7b775100c3c0d3e7dfe4069fc7349c68603e79ad3ff89b098a4e0，普通附件 413 已用现有制品链路解决。镜像本地 Docker 自动同步、校验、重启复下载均一致，从镜像取回的同一 ZIP 在 Mac 完成安装、MCP、Studio 及有声运动视频验收。生产镜像尚未部署。早期 #44 草稿不作为可用下载。
- 产品前端未改动；[源码 CI #83](https://code.powerformer.net/core/open-motion/actions/runs/83) 的 Studio 回归 8,053 项通过（1 文件跳过、16 todo）。本轮打包、启动、原 ZIP 上传及 Release 链接校验 7 项通过。服务端全量检查曾 55/56 通过，模板工程重开出现一次 400；本轮用同一运行时对照主分支与 PR，分别为 51/52、58/59，相同模板流程均报 fetch failed，未出现新增失败测试项。历史 400 根因仍未定位，不能将这些结果记成全量通过。网页返回的 .zip.zip 下载名已用同一 Mac 原包完成安装与有声出片复验，原包内容和 SHA256 未变。
