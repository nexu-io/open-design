# Agnes AI BYOK 提供方预设设计

## 决策

本设计遵循 AGENTS.md 的 UI/CLI 双轨要求（issue #6359 同时要求 `od config byok get/set/clear`）：Agnes AI 作为 BYOK 快捷预设接入，非敏感的 provider 选择（protocol / baseUrl / model）通过共享的 `/api/app-config` 端点持久化，`od config byok` 与 web UI 读写同一份 metadata；API Key 仍只保存在浏览器本地既有配置和 provider draft 中，绝不进入 app-config 或经 CLI 传输。

## 固定参数

- Provider 标题：`Agnes AI`
- Preset id：`agnes-ai`
- Protocol：`openai`
- Base URL：`https://apihub.agnes-ai.com/v1`
- 默认模型：`agnes-2.0-flash`

## 实现边界

在 `apps/web/src/state/config.ts` 的 canonical provider catalogue 中注册唯一的 Agnes AI provider，并在同文件的派生 preset 规格中注册唯一的 `agnes-ai`。组件继续消费既有 catalogue/preset 派生结果，不重复定义 URL 或模型值。

Onboarding 与 Settings 选择该预设后，沿用现有通用行为：切换到 `openai`、预填上述 Base URL 和模型，并以 provider identity 隔离浏览器本地的 API Key draft。不同 Base URL 的 OpenAI-compatible provider 不会复用彼此的本地 Key。

最终实现还在 `apps/web/src/components/EntryShell.tsx` 与 `apps/web/src/components/SettingsDialog.tsx` 做组件级 browser-local draft 隔离：Onboarding quick-fill、Settings 顶部预设和 Settings 的 `Gateway preset` picker 都走同一套按 provider 保存与恢复的语义。切到没有历史 draft 的目标 provider 时 Key 为空；重复选择当前 provider 时保留该 provider 的活动配置。

## 非目标

- 不新增 `agnes` protocol、provider 专用请求分支、流式解析器或模型发现逻辑。
- 不通过 `od config byok` 或 app-config 读写 API Key；不新增 MCP 改动。
- 不接入图像或视频能力，不新增依赖或 i18n key。
- 不在源码、测试、文档、日志、报告或截图中写入真实 API Key。

## 数据流

UI：`Agnes AI preset` → 浏览器本地 `ApiProtocolConfig(openai)` 与 provider draft → `syncConfigToDaemon` 以非敏感 `byokProvider` 写入 `/api/app-config` → 现有 OpenAI-compatible 请求路径。bootstrap 时 `mergeDaemonConfig` 以 daemon 的 `byokProvider` 为权威映射回 `mode`/`apiProtocol`/`baseUrl`/`model`（CLI 写入的选择在 web 重载后成为活动 provider），`null` 权威回退 daemon 模式；API Key 不离开浏览器本地 credential flow。

CLI：`od config byok get|set|clear` 读写同一个 `/api/app-config` 端点（daemon `writeAppConfig` 合并写入，`byokProvider: null` 清除选择），供外部代理与 headless 流程读取或配置同一份非敏感 provider metadata。

## 验证与验收

- state 测试验证派生出的唯一 `agnes-ai` preset 含固定 protocol、Base URL 与模型。
- Onboarding 测试验证通过现有 quick-fill 选择后预填 URL 和模型。
- Settings 测试验证选择 Agnes 时不会复用另一 provider 的浏览器本地 Key。
- daemon 测试验证 `byokProvider` 持久化、拒绝 `apiKey` 字段、`null` 清除；CLI 测试验证 `get`/`set`/`clear` 经 stub server 打到 `/api/app-config`；web 测试验证同步 payload 不含浏览器 API Key。
- 最终差异相对 `upstream/main` 包含本设计文档、`packages/contracts` 的 `ByokProviderPrefs`、daemon app-config 校验与持久化、`od config byok` 子命令、web `syncConfigToDaemon` 同步及聚焦测试；不包含 MCP 改动。
