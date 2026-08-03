# Agnes AI BYOK 提供方预设设计

## 决策

本设计以 `upstream/main` 的提交 `4d0376e fix(byok): restore local runtime configuration` 为准。该提交取代此前的 daemon/CLI 双轨方案：BYOK 设置与 API Key 均只保存在浏览器本地既有配置和 provider draft 中。

Agnes AI 作为一个浏览器本地 BYOK 快捷预设接入，不改变 daemon、共享合同、CLI、MCP 或请求协议。

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
- 不改动 `packages/contracts`、`apps/daemon`、MCP、`od` CLI 或 app-config BYOK metadata。
- 不接入图像或视频能力，不新增依赖或 i18n key。
- 不在源码、测试、文档、日志、报告或截图中写入真实 API Key。

## 数据流

`Agnes AI preset` → 浏览器本地 `ApiProtocolConfig(openai)` 与 provider draft → 现有 OpenAI-compatible 请求路径。

没有 daemon hydration、共享 `byokProvider` metadata 或 `od config byok` 参与该路径。

## 验证与验收

- state 测试验证派生出的唯一 `agnes-ai` preset 含固定 protocol、Base URL 与模型。
- Onboarding 测试验证通过现有 quick-fill 选择后预填 URL 和模型。
- Settings 测试验证选择 Agnes 时不会复用另一 provider 的浏览器本地 Key。
- 最终差异相对 `upstream/main` 只允许两份本设计文档、`apps/web/src/state/config.ts`、`apps/web/src/components/EntryShell.tsx`、`apps/web/src/components/SettingsDialog.tsx` 与聚焦 web 测试；不得包含 daemon、CLI、contracts 或 MCP 的 Agnes 改动。
