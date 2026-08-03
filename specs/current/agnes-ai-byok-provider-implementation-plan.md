# Agnes AI BYOK 提供方预设实施计划

## 当前权威方案

`upstream/main` 的 `4d0376e fix(byok): restore local runtime configuration` 已取代此前的双轨实施计划。旧计划中的 daemon `byokProvider` metadata、shared app-config contract、`/api/app-config` BYOK 校验和 `od config byok` CLI 均不再实施，也不得保留在最终树中。

目标是仅通过浏览器本地 provider catalogue/preset derivation 增加 Agnes AI。

## 约束

- 标题为 `Agnes AI`，唯一 preset id 为 `agnes-ai`。
- 使用现有 `openai` protocol，Base URL 为 `https://apihub.agnes-ai.com/v1`，首选模型为 `agnes-2.0-flash`。
- 不新增协议、依赖、i18n key、daemon/CLI/contracts/MCP 改动或专用模型、图像、视频逻辑。
- API Key 继续由现有浏览器本地 provider draft 管理；不同 provider 的 key 必须保持隔离。
- 不写入真实 API Key 或敏感请求内容。

## 实施步骤

1. 将工作分支合并 `upstream/main`，并以其浏览器本地 BYOK 实现解决冲突；还原所有退役的 daemon、CLI 和 contracts BYOK 变更。
2. 先在 `apps/web/tests/state/config.test.ts` 编写/保留失败用例，验证 `BYOK_PROVIDER_PRESETS` 派生出的 Agnes 预设含固定 id、标题、protocol、Base URL 和模型；运行该用例并确认因缺少 provider/preset 而失败。
3. 只在 `apps/web/src/state/config.ts` 注册 Agnes provider 及其派生 preset 规格；复跑同一测试确认通过。
4. 在现有真实组件测试中验证 onboarding quick-fill 和 Settings provider 切换：前者预填 URL/模型，后者不复用另一 provider 的本地 key。
5. 运行聚焦 web 测试、`corepack pnpm --filter @open-design/web typecheck`、`git diff --check` 和敏感信息差异扫描。
6. 审核相对 `upstream/main` 的最终文件边界，只保留两份 Agnes 文档、web catalogue 实现和聚焦 web 测试，然后完成无 co-author trailer 的 merge commit。

## 完成判定

- `KNOWN_PROVIDERS` 中有且仅有一个 `Agnes AI`，派生列表中有且仅有一个 `agnes-ai`。
- Onboarding 和 Settings 复用既有 browser-local 行为预填固定 URL/模型，并隔离不同 provider 的本地 key。
- 相对 `upstream/main` 不存在 Agnes 的 daemon、CLI、shared-contract 或 MCP 改动。
- 聚焦测试、web typecheck、差异检查和敏感信息扫描都有记录的通过证据。
