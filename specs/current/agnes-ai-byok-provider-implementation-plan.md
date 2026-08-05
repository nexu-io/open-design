# Agnes AI BYOK 提供方预设实施计划

## 当前权威方案

Agnes AI 作为 BYOK 快捷预设接入，遵循 AGENTS.md 的 UI/CLI 双轨规则（issue #6359 同时要求 `od config byok get/set/clear`）。非敏感的 provider 选择（protocol / baseUrl / model）以 `ByokProviderPrefs` 形式通过共享的 `/api/app-config` 端点持久化，web UI 与 `od config byok` 读写同一份 metadata；API Key 只保存在浏览器本地 provider draft 中，绝不进入 app-config、daemon 凭证存储或 CLI 传输。

上游 `4d0376e fix(byok): restore local runtime configuration` 曾把 BYOK 改为纯浏览器本地并移除 daemon/CLI/contracts 实现；本 PR 恢复该双轨闭合（DTO + daemon 校验/持久化 + web 同步/合并 + CLI 子命令），并保持 API Key 留在既有浏览器本地 credential flow 中的安全边界。

## 约束

- 标题为 `Agnes AI`，唯一 preset id 为 `agnes-ai`。
- 使用现有 `openai` protocol，Base URL 为 `https://apihub.agnes-ai.com/v1`，首选模型为 `agnes-2.0-flash`。
- 不新增协议、依赖、i18n key 或 MCP 改动；不新增专用模型、图像、视频逻辑。
- 共享 DTO 只含非敏感字段：`protocol`、`baseUrl`、`model`。daemon 校验拒绝任何 `apiKey` 字段；无效对象保留最后一次有效选择，仅 `null` 明确清除。
- API Key 继续由现有浏览器本地 provider draft 管理；不同 provider 的 key 必须保持隔离。最终组件实现以 `EntryShell.tsx` 和 `SettingsDialog.tsx` 的 provider-scoped browser-local draft 为准，覆盖 Onboarding quick-fill、Settings 顶部预设与 `Gateway preset` picker；目标无 draft 时清空 Key，重选当前 provider 时保留活动配置。
- daemon 的 `byokProvider` 在 bootstrap 合并时权威生效：CLI 写入的选择在 web 重载后成为活动 provider，同时不导入 API Key；`byokProvider: null` 权威回退到 daemon 模式。
- 不写入真实 API Key 或敏感请求内容。

## 实施步骤

1. 在 `packages/contracts/src/api/app-config.ts` 定义非敏感 `ByokProviderPrefs` 并挂到 `AppConfigPrefs.byokProvider`（可选，`null` 表示显式清除）。
2. 在 `apps/daemon/src/app-config.ts` 加入 `byokProvider` 校验与持久化：trim + URL scheme 校验；拒绝 `apiKey` 字段；无效对象保留旧值；`null` 清除。
3. 在 `apps/daemon/src/cli.ts` 的 `runConfig` 注册 `od config byok get|set|clear`，读写同一 `/api/app-config` 端点，输出机器可读 JSON；更新 usage 帮助。
4. 在 `apps/web/src/state/config.ts` 注册 Agnes provider 与派生 preset 规格（browser-local catalogue/preset）。
5. `syncConfigToDaemon` 同步非敏感 `byokProvider`（API 模式下取 apiProtocol/baseUrl/model，否则 `null`）；`mergeDaemonConfig` 在 bootstrap 时将 daemon 选择映射回 `mode`/`apiProtocol`/`baseUrl`/`model`，保留端点级浏览器本地 key。
6. 测试：daemon `app-config.test.ts`（持久化、拒绝 key、无效对象保留、null 清除）、CLI stub server 测试（`get`/`set`/`clear` 的 HTTP 行为）、web `config.test.ts`（preset 派生、同步不含 key、merge 采用 CLI 写入的 Agnes 选择）。
7. 验证：聚焦测试、contracts/daemon/web typecheck、`pnpm guard`、根 `pnpm typecheck`、web build、`git diff --check` 与敏感信息差异扫描。
8. 审核相对 `upstream/main` 的最终文件边界，提交无 co-author trailer 的提交并推送，回复评审线程。

## 完成判定

- `KNOWN_PROVIDERS` 中有且仅有一个 `Agnes AI`，派生列表中有且仅有一个 `agnes-ai`。
- `od config byok get|set|clear` 可用并读写 `/api/app-config`；daemon 拒绝 API Key 持久化，无效对象不覆盖有效选择。
- `od config byok set openai https://apihub.agnes-ai.com/v1 agnes-2.0-flash` 后，web bootstrap 合并使该选择成为活动 UI provider，且不导入 API Key。
- 相对 `upstream/main` 的允许文件边界：两份 Agnes 文档、`packages/contracts/src/api/app-config.ts`、daemon `app-config.ts`/`cli.ts` 及聚焦测试、`apps/web/src/state/config.ts` 及聚焦测试、既有 `EntryShell.tsx`/`SettingsDialog.tsx` 组件改动；不存在 MCP 改动。
- 聚焦测试、contracts/daemon/web typecheck、`pnpm guard`、根 typecheck、web build、差异检查与敏感信息扫描都有记录的通过证据。
