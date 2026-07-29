# Agnes AI BYOK 提供方预设实施计划

> **供执行 Agent 使用：** 实施本计划时必须使用 `superpowers:subagent-driven-development`
> 或 `superpowers:executing-plans`，逐项执行复选框步骤；宣称完成前必须使用
> `superpowers:verification-before-completion`。

**目标：** 在 Open Design 的 BYOK 提供方列表中增加可直接选择的 Agnes AI，并自动填入官方 OpenAI-compatible Base URL 与 `agnes-2.0-flash` 模型。

**架构：** 复用 `apps/web/src/state/config.ts` 中的 canonical provider catalogue 和由其派生的 BYOK preset，不新增 `ApiProtocol`、daemon endpoint 或请求实现。现有 Settings/Onboarding UI 会从 `BYOK_PROVIDER_PRESETS` 自动获得入口，现有 `openai` protocol 继续负责连接测试和聊天请求。

**技术栈：** Node.js 24、pnpm 10.33.2、TypeScript、React 18、Vitest 4、Electron tools-dev runtime。

## 全局约束

- 实施依据：`specs/current/agnes-ai-byok-provider-design.md`。
- Provider 标题必须是 `Agnes AI`。
- Protocol 必须是现有 `openai`，不得新增 `agnes` protocol。
- Base URL 必须是 `https://apihub.agnes-ai.com/v1`。
- 默认模型必须是 `agnes-2.0-flash`。
- 不接入 Agnes 图像、视频或专用模型发现逻辑。
- 不在源码、测试、日志、命令参数或截图中放入真实 API Key。
- 不新增依赖、不修改 contracts、不修改 daemon route、不增加 i18n key。
- 根级开发生命周期只能使用 `corepack pnpm tools-dev`。
- 完成前必须通过 web 测试、web typecheck、web build、`pnpm guard` 和根 `pnpm typecheck`。

## 文件边界

- 修改 `apps/web/src/state/config.ts`
  - 在 `KNOWN_PROVIDERS` 中定义 Agnes AI 的 canonical provider metadata。
  - 在 `BYOK_PROVIDER_PRESET_SPECS` 中暴露稳定的 `agnes-ai` 快捷入口。
- 修改 `apps/web/tests/state/config.test.ts`
  - 锁定 Agnes provider 与 preset 的唯一性、协议、Base URL 和默认模型。
- 不修改 `SettingsDialog.tsx`
  - 该组件已经从 `BYOK_PROVIDER_PRESETS` 渲染 provider 入口并复用现有切换逻辑。
- 不修改 daemon/CLI
  - `od config` 已经通过 `/api/app-config` 表达同一份 OpenAI-compatible 配置。

---

### Task 1：以测试先行方式注册 Agnes AI provider 与 BYOK preset

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

## 完成判定

- 新增测试经历明确的红灯和绿灯。
- `Agnes AI` 在 provider catalogue 与 BYOK preset 中各恰好出现一次。
- Base URL、protocol 和默认模型与设计规格完全一致。
- web 测试、web typecheck、web build、guard、根 typecheck 全绿。
- 桌面 IPC 状态证明窗口运行且可见。
- UI/DOM 检查证明 Agnes 入口和预填值存在。
- 截图和 Git 差异中没有真实 API Key。
- 实现以单个原子提交完成。
