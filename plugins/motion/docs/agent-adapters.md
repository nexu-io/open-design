# 四家 Agent 共用本机运行时

适配器继承外置运行时的 MCP 发布 profile，`scope.json.mcpProfile` 记录 legacy／phase1，不单独维护 Tool allowlist。注册与构建规则见[一期 MCP 契约](mcp-phase1-tools.md)；旧运行时没有此标记时按 legacy 记录，不据此宣称一期已验收。

Codex、Claude Code、DeepSeek Harness（DSH）与 WorkBuddy 从同一份已安装的 OpenDesign Motion 运行时生成薄适配器。适配器包含宿主清单、连接配置、制作 Skills、AGENTS.md、CLAUDE.md 和产品文档，不包含服务源码、node_modules、Node、浏览器、FFmpeg、用户工程或账号凭据。

各宿主分别启动 stdio MCP 进程，业务能力仍由同一份 `mcp.ts`、会话/工程、Model Gateway、Hyperframes 编辑器和渲染器提供。它们可以使用相同或不同的 `MOTION_DATA_DIR`；共用代码不代表共用一个 MCP 进程。macOS 同一数据目录的连接现在复用完整编辑器后台，各自保留工程绑定，Studio 仍只有一个活动工程；协议、版本或代码不兼容时拒绝复用，见 [共享编辑器](shared-editor.md)。Windows / Linux 保留原预览服务复用。Agent 仍需按最新工具契约读取会话、选择产物和校验 revision。

本地也可以使用 [npm 轻量安装器](npm-installation.md) 的 `setup --host codex|claude|deepseek|workbuddy`，自动安装对应入口与 Skills，并共用一份应用和原生依赖缓存。下文的导出方式保留，生成配置与自动注册是不同操作。

## 生成

安装机器执行一次，不修改客户端设置，不初始化工程，不安装依赖：

```sh
npm run export:adapters -- /absolute/runtime /absolute/projects /absolute/new-adapters
```

三个参数必须是绝对路径。运行时、工程和输出目录必须互不包含；先规范化 `..` 等路径片段，再解析现存父目录的符号链接，避免不存在的中间目录掩盖真实位置。输出目录已存在时拒绝覆盖，失败只清理本次新建的输出，保留运行时和工程。

脚本优先使用当前系统的包内 Node（Mac 的 `runtime/node/bin/node`、Windows 的 `runtime/node/node.exe`），源码运行时则使用执行该脚本的 Node 22.18+。有 `bootstrap.mjs` 时保留绝对路径 preload，以配置浏览器、媒体工具和最小 PATH。Windows PowerShell 中可用包内 Node 执行：

```powershell
& "$motionRuntime/runtime/node/node.exe" --experimental-strip-types "$motionRuntime/scripts/export-adapters.ts" $motionRuntime $motionData $motionAdapters
```

Mac 对应使用 `runtime/node/bin/node`。完整内部测试包保留原有 `motion@openmotion-test` 安装入口，同时带有本脚本供其他宿主生成适配器；本功能不自动改写既有安装或发布新测试版本。旧包没有此脚本，需从包含本次修改的新包生成。

| 输出 | 用途 |
| --- | --- |
| `codex/openmotion/`、`codex/.agents/plugins/marketplace.json` | 原生 Codex 薄插件及本地 marketplace |
| `claude/openmotion/`、`claude/.claude-plugin/marketplace.json` | 原生 Claude Code 薄插件及本地 marketplace |
| `workbuddy/openmotion/` | 本机 MCP + Skill Connector，含 `connector-meta.json`、`mcp.json`、图标和共用说明 |
| `workbuddy/mcp.json` | 手动添加自定义 MCP 的配置 |
| `deepseek/openmotion/cordis.patch.yml` | DSH Cordis patch-list，插入官方 MCP 客户端 |
| `openmotion-<host>-<version>-local.zip` | 各宿主的本机目录归档，非完整应用安装程序 |
| `launch-spec.json` | 四家共用的 Node、参数、工作目录和工程路径 |

ZIP 使用安装机器的绝对路径；跨机器、移动运行时或切换版本后重新生成，不能作为通用安装包公开分发。展示品牌为 OpenDesign，兼容保留 `motion` 插件和 MCP 标识，以及已有 `openmotion` 目录/市场名。

## Codex / Claude Code

```sh
codex plugin marketplace add "$motionAdapters/codex"
codex plugin add motion@openmotion-local
codex plugin list --marketplace openmotion-local --json
codex mcp get motion --json

claude plugin marketplace add "$motionAdapters/claude"
claude plugin install motion@openmotion-local
claude plugin list --json
```

Codex 声明 `requires_local_executor`；两家原生插件均引用同一外置 Node、bootstrap、MCP 入口和数据目录。marketplace 位于各自插件 ZIP 外，原生安装使用生成的 `codex/` 或 `claude/` 目录。同名旧 `motion-local`、`openmotion-test` 或手动 MCP 已启用时，先核对、选择一个连接，避免重复加载。

独立验证使用临时 `CODEX_HOME` / `CLAUDE_CONFIG_DIR`，安装后读取宿主实际解析的启动配置，检查工具和 `motion_get_project.dataDirectory`。卸载仅移除薄入口，保留外置运行时和用户数据。旧自带服务源码的 `check-installed-mcp.mjs` / `resolve-installed.mjs` 不用于新适配器缓存；本轮不改变旧安装器行为。

## DeepSeek Harness

```sh
dsh --profile headless --patch "$motionAdapters/deepseek/openmotion/cordis.patch.yml" --json   '仅查询Motion工作流和builtin模板，不修改工程或导出。'
```

需要活动 profile 已具备可用模型接入。patch 使用 `insert`，保留已有插件和设置；stdio 启动不需要 DeepSeek 模型 API Key，模型账号由 Harness 管理。工具通常显示为 `mcp__motion__motion_get_project`，以实际发现的名称为准。参见 [DSH 官方 MCP 客户端](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)。

## WorkBuddy

按 [官方 Connector 规范](https://open.workbuddy.cn/en/docs/connector) 输出 MCP + Skill 包，保留共用制作 Skill，不再生成未经桌面验证的 `.workbuddy-plugin` 清单或 Claude marketplace。元信息包含中英文说明、示例和图标；`mcp.json` 使用外置 stdio 进程及 `cwd`，最低版本标为 4.22.15。此本机进程不配置远程 OAuth，也不复制宿主或媒体供应商凭据。

本机未安装 WorkBuddy；桌面导入、模型调用和出片仍为 **not_run**。可在目标桌面按自定义 MCP 流程使用 `workbuddy/mcp.json`，先确认工具和数据目录；生成规范正确不表示已通过 Connector 市场审核。市场名称注册、通用安装和公开分发不在本次范围。

## 验证、升级与回退

打包验证检查四家启动配置一致、ZIP 完整、无运行时代码和工程、文档/Skills 来自选定运行时、空格和特殊字符路径、bootstrap、最小 PATH、重复输出保护和失败清理。接入验证检查原生安装、实际工具发现和指定工程目录；最新会话/网关工具应随运行时发现，不能固定使用旧版 13 工具作为通过标准。

模型创作验收另外执行：读取会话与产物 → 获取最新 revision → 模板/源文件修改 → lint/timeline → 请求导出 → completed → 对 job/revision 校验 MP4。画面、声音和实际播放器播放/跳转/重播单独记录。静态检查、握手、安装成功不能替代模型出片或跨平台验收。

升级时保留旧、新应用目录，用新运行时重新生成适配器，继续显式选择工程目录；失败恢复旧连接。运行时脚本从 `scope.json.runtimeRoot` 或宿主实际 transport.cwd 查找，原生 CLI/创作规范使用工具返回的绝对路径，不能从薄插件缓存推断源码位置。

后台渲染仅对服务管理的任务设置 Hyperframes 0.9.7 的 `HYPERFRAMES_RENDER_DETACHED=1`，避免短命客户端退出取消任务；保留服务超时和子进程组终止。交互式 CLI 的取消策略不变。macOS 共享后台重启会将中断导出持久化为失败，不自动接管续跑；Studio 回收已做专项验收。跨版本数据回退、公开目录发布与自动更新仍需另外设计和验收。
