# Agnes AI BYOK 提供方预设实施计划

> **供执行 Agent 使用：** 实施本计划时必须使用 `superpowers:subagent-driven-development`
> 或 `superpowers:executing-plans`，逐项执行复选框步骤；宣称完成前必须使用
> `superpowers:verification-before-completion`。

**目标：** 在 Open Design 的 BYOK 提供方列表中增加可直接选择的 Agnes AI，并自动填入官方 OpenAI-compatible Base URL 与 `agnes-2.0-flash` 模型。

**架构：** Agnes UI 入口仍复用 `apps/web/src/state/config.ts` 的 canonical provider catalogue 和派生 BYOK preset；但为了满足 UI/CLI 双轨配置，`packages/contracts/src/api/app-config.ts` 现在定义共享的非秘密 `byokProvider` 协议、Base URL 与模型语义。daemon 的 `/api/app-config` 写入路径在落盘前校验该选择，并向 CLI 暴露相同状态；API Key 始终只留在浏览器现有凭据流中。web 启动时可水合已知或受支持的自定义端点：同一 provider identity 保留本地 Key，身份变化或 CLI 首次水合则保持空 Key。用户明确从 BYOK 切换至 Local CLI 时发送 `byokProvider: null`；例行启动同步则省略该字段，避免覆盖 CLI 已写入、尚待水合的选择。

**技术栈：** Node.js 24、pnpm 10.33.2、TypeScript、React 18、Vitest 4、Electron tools-dev runtime。

## 全局约束

- 实施依据：`specs/current/agnes-ai-byok-provider-design.md`。
- Provider 标题必须是 `Agnes AI`。
- Protocol 必须是现有 `openai`，不得新增 `agnes` protocol。
- Base URL 必须是 `https://apihub.agnes-ai.com/v1`。
- 默认模型必须是 `agnes-2.0-flash`。
- 不接入 Agnes 图像、视频或专用模型发现逻辑。
- 不在源码、测试、日志、命令参数或截图中放入真实 API Key。
- 不新增依赖、不新增 i18n key；允许修改 shared contract、daemon app-config 验证与 CLI，以保持 UI/CLI 双轨闭环。
- 根级开发生命周期只能使用 `corepack pnpm tools-dev`。
- 完成前必须通过与改动边界匹配的 web/daemon 聚焦测试、contracts/web/daemon typecheck、`pnpm guard` 与 `git diff --check`。如根 `pnpm typecheck` 受已知 pnpm 路径版本问题阻塞，使用 Corepack 直接执行对应 package 的 TypeScript 检查并记录该限制。

## 文件边界

- 修改 `packages/contracts/src/api/app-config.ts`
  - 定义受支持的 BYOK protocol enum 与非秘密 provider metadata 合同。
- 修改 `apps/daemon/src/app-config.ts`、`apps/daemon/src/routes/media.ts`、`apps/daemon/src/cli.ts`
  - 校验 protocol、HTTP(S) Base URL 与非空 model；无效选择通过 `/api/app-config` 返回 400，且不修改原有选择。
  - `od config byok get/set` 只读写非秘密 metadata，并在 daemon 拒绝时非零退出。
- 修改 `apps/web/src/state/config.ts`、`apps/web/src/types.ts`、`apps/web/src/App.tsx`
  - 在 `KNOWN_PROVIDERS` 中定义 Agnes AI 的 canonical provider metadata。
  - 在 `BYOK_PROVIDER_PRESET_SPECS` 中暴露稳定的 `agnes-ai` 快捷入口。
  - 水合 provider metadata 时以 protocol + Base URL 判断同一身份，保留同一身份的浏览器本地 Key；支持自定义受支持端点。
  - 区分显式 Local CLI 切换（发送 `null`）与例行 daemon-mode 同步（省略字段）。
- 修改 `apps/web/tests/state/config.test.ts`
  - 锁定 Agnes provider/preset、密钥保留、自定义端点水合和显式清除语义。
- 修改 `apps/daemon/tests/app-config.test.ts`、`apps/daemon/tests/server-persistence-smoke.test.ts`、`apps/daemon/tests/cli-templates.test.ts`
  - 覆盖非秘密持久化、真实 daemon 400 路径、保留既有选择，以及 CLI 输出/错误退出。
- UI surface：`apps/web/src/components/EntryShell.tsx` 负责 onboarding provider 切换时的本地 Key 隔离；`apps/web/src/components/SettingsDialog.tsx` 继续复用 `BYOK_PROVIDER_PRESETS` 与 autosave 持久化路径。
- UI 回归：`apps/web/tests/components/EntryShell.onboarding.test.tsx` 与 `apps/web/tests/components/SettingsDialog.execution.test.tsx` 覆盖 Agnes 预填、provider 选择和 Key 隔离。
- daemon/CLI 变更仅限 shared non-secret `byokProvider` metadata；不得增加 API Key 参数、持久化或回显。

---

### Task 1：历史基线——仅注册 Agnes AI provider 与 BYOK preset（已由 Task 2 取代，不再执行）

> 本节保留最初 registry-only 的 TDD 记录。它不再是可执行实施方案：最终实现必须以 **Task 2** 的 shared contract、daemon、CLI、UI 状态与真实路由验证为准。

**文件：**

- 修改：`apps/web/tests/state/config.test.ts`
- 修改：`apps/web/src/state/config.ts`
- 运行时证据：`.tmp/tools-dev/default/agnes-ai-byok-provider.png`，只保留在 Git 忽略目录

**接口：**

- 消费：`KnownProvider`、`KNOWN_PROVIDERS`、`ByokProviderPresetConfig`、`BYOK_PROVIDER_PRESETS`
- 产出：
  - `KNOWN_PROVIDERS` 中唯一的 `{ label: 'Agnes AI', protocol: 'openai', baseUrl: 'https://apihub.agnes-ai.com/v1', preferredModels: ['agnes-2.0-flash'] }`
  - `BYOK_PROVIDER_PRESETS` 中唯一的 `{ id: 'agnes-ai', title: 'Agnes AI', protocol: 'openai', baseUrl: 'https://apihub.agnes-ai.com/v1', preferredModels: ['agnes-2.0-flash'] }`

- [ ] **步骤 1：先写失败测试**

在 `apps/web/tests/state/config.test.ts` 的 `describe('KNOWN_PROVIDERS')` 中加入：

```ts
it('registers Agnes AI as an OpenAI-compatible BYOK preset', () => {
  const providers = KNOWN_PROVIDERS.filter((provider) => provider.label === 'Agnes AI');
  const presets = BYOK_PROVIDER_PRESETS.filter((preset) => preset.id === 'agnes-ai');

  expect(providers).toHaveLength(1);
  expect(providers[0]).toEqual({
    label: 'Agnes AI',
    protocol: 'openai',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    preferredModels: ['agnes-2.0-flash'],
  });

  expect(presets).toHaveLength(1);
  expect(presets[0]).toEqual({
    id: 'agnes-ai',
    title: 'Agnes AI',
    protocol: 'openai',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    preferredModels: ['agnes-2.0-flash'],
  });
});
```

- [ ] **步骤 2：运行聚焦测试并确认红灯**

运行：

```bash
corepack pnpm --filter @open-design/web test -- tests/state/config.test.ts
```

预期：新增测试失败，`providers` 和 `presets` 的长度都是 `0`；其他既有测试不应失败。

- [ ] **步骤 3：写入最小 provider 实现**

在 `KNOWN_PROVIDERS` 的 `OpenAI` 条目后加入：

```ts
{
  label: 'Agnes AI',
  protocol: 'openai',
  baseUrl: 'https://apihub.agnes-ai.com/v1',
  preferredModels: ['agnes-2.0-flash'],
},
```

在 `BYOK_PROVIDER_PRESET_SPECS` 的 `openai` 条目后加入：

```ts
{ id: 'agnes-ai', title: 'Agnes AI', providerLabel: 'Agnes AI' },
```

不要加入 `apiKey`、Authorization header、provider-specific fetcher 或新的 protocol。

- [ ] **步骤 4：复跑聚焦测试并确认绿灯**

运行：

```bash
corepack pnpm --filter @open-design/web test -- tests/state/config.test.ts
```

预期：`apps/web/tests/state/config.test.ts` 全部通过，新增 Agnes 测试通过。

- [ ] **步骤 5：运行 web 级验证**

依次运行：

```bash
corepack pnpm --filter @open-design/web test
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/web build
```

预期：全部以退出码 `0` 完成；Vitest 无失败，TypeScript 无错误，Next.js 构建成功。

- [ ] **步骤 6：运行仓库级验证**

依次运行：

```bash
corepack pnpm guard
corepack pnpm typecheck
```

预期：两条命令均以退出码 `0` 完成，不出现 guard 或 workspace typecheck 错误。

- [ ] **步骤 7：验证桌面运行时与 UI 预填**

启动或重启完整开发运行时：

```bash
corepack pnpm tools-dev restart
corepack pnpm tools-dev inspect desktop status
```

预期：daemon、web、desktop 均为 `running`，desktop 的 `windowVisible` 为 `true`。

在桌面端进入“自己的模型 Key”页面，点击 `Agnes AI`。随后运行不读取 API Key 的 DOM 检查：

```bash
corepack pnpm tools-dev inspect desktop eval --expr \
  '({hasProvider:document.body.innerText.includes("Agnes AI"),hasBaseUrl:Boolean(document.querySelector("input[value=\"https://apihub.agnes-ai.com/v1\"]")),hasModel:document.body.innerText.includes("agnes-2.0-flash")})'
```

预期：

```json
{
  "hasProvider": true,
  "hasBaseUrl": true,
  "hasModel": true
}
```

保存 Key 为空或掩码状态的截图：

```bash
corepack pnpm tools-dev inspect desktop screenshot \
  --path /Users/xiangzi/Documents/workspace/launch-studio/.tmp/tools-dev/default/agnes-ai-byok-provider.png
```

人工检查截图：Agnes AI 可见；Base URL 和模型正确；截图中没有真实 Key。

- [ ] **步骤 8：执行敏感信息与差异检查**

运行：

```bash
git diff --check
git diff -- apps/web/src/state/config.ts apps/web/tests/state/config.test.ts
git diff -- apps/web/src/state/config.ts apps/web/tests/state/config.test.ts \
  | rg -n 'sk-[A-Za-z0-9_-]{8,}|Authorization:\s*Bearer\s+[A-Za-z0-9]'
```

预期：`git diff --check` 通过；差异只包含 Agnes metadata 和测试；最后一条敏感信息扫描无输出并返回未匹配状态。

- [ ] **步骤 9：提交原子实现**

```bash
git add apps/web/src/state/config.ts apps/web/tests/state/config.test.ts
git commit -m "feat: add Agnes AI BYOK provider preset"
```

提交不得包含 `.tmp` 截图、真实 API Key、`Co-authored-by` 或其他 co-author metadata。

### Task 2：最终 shared non-secret BYOK 架构与双轨闭环

**文件与责任：**

- `packages/contracts/src/api/app-config.ts`：定义 `BYOK_PROVIDER_PROTOCOLS`、`ByokProviderProtocol` 和只含 `protocol`、`baseUrl`、`model` 的非秘密 `byokProvider` 合同。
- `apps/daemon/src/app-config.ts`、`apps/daemon/src/routes/media.ts`：在写入前校验受支持 protocol、HTTP(S) Base URL 与非空 model；无效 `byokProvider` 返回 HTTP 400，且不得清除既有选择。
- `apps/daemon/src/cli.ts`：`od config byok get` / `set <protocol> <base-url> <model>` 通过同一 `/api/app-config` API 读写非秘密 metadata；daemon 400 必须令 CLI 非零退出。
- `apps/web/src/state/config.ts`、`apps/web/src/types.ts`、`apps/web/src/App.tsx`：水合已知和自定义受支持端点；同一 protocol + Base URL 保留浏览器本地 Key，身份变化或 CLI-first 水合保持空 Key；显式 BYOK → Local CLI 发送 `byokProvider: null`，例行 bootstrap/daemon-mode 同步省略该字段。
- `apps/web/src/components/EntryShell.tsx`、`apps/web/src/components/SettingsDialog.tsx`：保持 onboarding/Settings 的 provider 选择、预填和 Key 隔离行为；不得向 daemon 或 CLI 传递 API Key。
- `apps/web/tests/state/config.test.ts`、`apps/web/tests/components/EntryShell.onboarding.test.tsx`、`apps/web/tests/components/SettingsDialog.execution.test.tsx`：覆盖 UI/状态行为。
- `apps/daemon/tests/app-config.test.ts`、`apps/daemon/tests/cli-templates.test.ts`、`apps/daemon/tests/server-persistence-smoke.test.ts`：覆盖 app-config 持久化、CLI 输出/错误和真实 HTTP 路由。

**实施步骤：**

- [ ] **步骤 1：共享合同与红灯。** 先添加 web state、daemon CLI 和真实 `/api/app-config` 路由回归：同身份保留本地 Key，首次 hydration 为空 Key，自定义端点可用，显式 Local CLI 写入 `null`，无效 protocol/URL/model 返回 400 且保留旧值，CLI 非零退出。
- [ ] **步骤 2：确认红灯。** 分别运行聚焦 web state、daemon CLI 与 server persistence 测试；失败必须对应缺少 identity 保留、clear intent 或 400 校验，而不是环境错误。
- [ ] **步骤 3：实现最小 shared contract 与 daemon 校验。** 将 protocol allowlist 放在 `packages/contracts`；daemon 只接受 `protocol`、`baseUrl`、`model`，在落盘前拒绝无效 payload。`null` 是唯一允许的清除值；未知字段（包括 `apiKey`）不得持久化。
- [ ] **步骤 4：实现 web hydration 与同步生命周期。** 用 protocol + Base URL 判定身份；只在相同身份保留浏览器 Key。将“例行省略”与“用户明确清除”表示为 transient sync intent，避免 bootstrap 覆盖 CLI 写入或 reload 循环。
- [ ] **步骤 5：实现 CLI 闭环。** `get` 输出机器可读的非秘密 provider object；`set` 只接受恰好三个非秘密 positional values，并将 daemon 400 转为非零退出，不回显输入之外的凭据。
- [ ] **步骤 6：确认绿灯与真实边界。** 至少执行：

```bash
corepack pnpm --filter @open-design/contracts build
corepack pnpm --filter @open-design/contracts typecheck
corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts \
  tests/state/config.test.ts \
  tests/components/EntryShell.onboarding.test.tsx \
  tests/components/SettingsDialog.execution.test.tsx
corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/app-config.test.ts tests/cli-templates.test.ts tests/server-persistence-smoke.test.ts
corepack pnpm --filter @open-design/web typecheck
corepack pnpm --filter @open-design/daemon exec tsc -p tsconfig.json --noEmit
corepack pnpm --filter @open-design/daemon exec tsc -p tsconfig.tests.json --noEmit
corepack pnpm guard
```

- [ ] **步骤 7：敏感信息、差异与提交。**

```bash
git diff --check
git diff -- packages/contracts/src/api/app-config.ts apps/daemon/src/app-config.ts \
  apps/daemon/src/routes/media.ts apps/daemon/src/cli.ts apps/web/src/App.tsx \
  apps/web/src/state/config.ts apps/web/src/types.ts \
  | rg -n 'Authorization:\s*Bearer|apiKey|sk-[A-Za-z0-9_-]{8,}'
git add packages/contracts/src/api/app-config.ts apps/daemon/src/app-config.ts \
  apps/daemon/src/routes/media.ts apps/daemon/src/cli.ts apps/web/src/App.tsx \
  apps/web/src/state/config.ts apps/web/src/types.ts apps/web/tests \
  apps/daemon/tests specs/current/agnes-ai-byok-provider-implementation-plan.md
git commit -m "fix: harden BYOK provider synchronization"
```

最后一条 diff 命令用于人工审查敏感字段接触面；不得把真实 API Key、Authorization header 或凭据值写入源码、测试输出、报告或 commit。提交不得包含 `.tmp`、构建产物、`Co-authored-by` 或其他 co-author metadata。

## 完成判定

- 共享 contract、daemon、CLI、web state 与 onboarding/Settings 均通过同一非秘密 `byokProvider` 合同闭环。
- 新增测试经历明确的红灯和绿灯，且真实 daemon 路由验证了 HTTP 400 与不覆写旧值。
- `Agnes AI` 在 provider catalogue 与 BYOK preset 中各恰好出现一次。
- Base URL、protocol 和默认模型与设计规格完全一致。
- 同一 identity 保留浏览器本地 Key；身份变化、CLI-first hydration 与自定义端点均不导入或持久化 Key。
- 显式 Local CLI 切换写入 `null`，例行同步省略字段，reload 保持 Local CLI。
- contracts/web/daemon 类型检查、聚焦测试、guard 和差异检查全绿。
- Git 差异、日志、报告和提交中没有真实 API Key、Authorization header 或 API Key 参数。
