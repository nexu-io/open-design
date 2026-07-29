# Agnes AI BYOK 提供方预设设计

## 背景

Open Design 的 BYOK 页面已经通过统一的 provider catalogue 支持多种模型服务商。每个快捷提供方预设负责选择现有 API 协议，并预填对应的 Base URL 与推荐模型；API Key 仍由用户自行输入。

Agnes AI 的文本模型提供 OpenAI-compatible Chat Completions 接口。官方接入参数为：

- Base URL：`https://apihub.agnes-ai.com/v1`
- Endpoint：`POST /v1/chat/completions`
- Model：`agnes-2.0-flash`
- Authentication：`Authorization: Bearer <API_KEY>`

因此，Agnes AI 不需要新的传输协议或独立请求实现，可以复用现有 OpenAI-compatible BYOK 路径。

## 目标

- 在 BYOK 提供方列表中增加可直接选择的 `Agnes AI`。
- 选择后自动填入 Agnes AI 的 Base URL 和默认模型。
- 用户只需填写自己的 Agnes API Key，即可使用现有连接测试与聊天流程。
- UI 与 `od config byok get|set` 通过同一份 daemon app-config HTTP API 使用非秘密 provider metadata。
- 不在源码、测试、日志、截图或文档中保存真实 API Key。

## 非目标

- 不新增 `agnes` API protocol。
- 不为 Agnes AI 编写独立的流式响应解析器。
- 不接入 Agnes 的图像或视频生成模型。
- 不保证 Agnes 提供未在其文本模型文档中承诺的 `/v1/models` 接口。
- 没有真实 API Key 时，不宣称完成线上端到端调用验证。

## 方案比较

### 方案 A：复用 OpenAI protocol 的正式快捷预设

在共享 provider catalogue 中增加 Agnes AI，并将其映射到现有 `openai` protocol。它同时出现在 BYOK 快捷提供方入口中。

优点：

- 用户能直接发现并选择 Agnes AI。
- 请求、配置、验证与错误处理全部复用成熟路径。
- 不增加 Agnes 专用协议、analytics provider id 或请求分支。
- CLI 复用 `od config byok get|set`；不接受、持久化或回显 API Key。

缺点：

- Agnes 与其他 OpenAI-compatible 服务共享同一个协议标签。
- Base URL 字段继续显示，因为固定来源能力目前按 protocol 区分，不能只对某个 OpenAI-compatible 预设隐藏。

### 方案 B：只加入 OpenAI 的快速填充下拉列表

Agnes AI 仅作为 OpenAI protocol 下的 KnownProvider，不增加顶层快捷入口。

优点是改动最小；缺点是发现性较弱，不符合“增加这个 Agnes AI 模型 Key”所期望的直接入口。

### 方案 C：新增独立 Agnes protocol

新增 `ApiProtocol = 'agnes'`，并扩展请求路由、类型、analytics、i18n、测试和 daemon 配置。

该方案能提供独立协议标签，但 Agnes 当前与 OpenAI Chat Completions 兼容，新增整套协议会制造重复实现与长期维护成本。

## 选定方案

采用方案 A。

### Provider catalogue

在 `apps/web/src/state/config.ts` 的 `KNOWN_PROVIDERS` 中新增：

- `label`: `Agnes AI`
- `protocol`: `openai`
- `baseUrl`: `https://apihub.agnes-ai.com/v1`
- `preferredModels`: `['agnes-2.0-flash']`

在同一文件的 `BYOK_PROVIDER_PRESET_SPECS` 中增加稳定预设：

- `id`: `agnes-ai`
- `title`: `Agnes AI`
- `providerLabel`: `Agnes AI`

预设解析继续由现有 catalogue 解析逻辑完成，避免在组件中重复 endpoint 或模型常量。

### Shared non-secret app-config contract

`packages/contracts/src/api/app-config.ts` 定义 `byokProvider` 的共享语义：只包含受支持的 `protocol`、HTTP(S) `baseUrl` 与非空 `model`。该合同由 web、daemon 和 CLI 共同使用；它不是凭据容器。

daemon 在 `/api/app-config` 写入前校验该合同。无效 protocol、URL 或模型返回 HTTP 400 的结构化 `missing-input` 错误，并保持已有选择不变。`byokProvider: null` 表示显式清除；未知字段（包括 `apiKey`）不会写入 daemon app-config。

### UI 行为

用户在“自己的模型 Key”页面选择 `Agnes AI` 后：

1. 当前 BYOK protocol 切换为 `openai`。
2. Base URL 填充为 `https://apihub.agnes-ai.com/v1`。
3. Model 填充为 `agnes-2.0-flash`。
4. API Key 字段保持空白，或恢复同一 protocol + Base URL 的浏览器本地草稿；不得复用其他 provider 的 Key。
5. 用户填写 Key 后，可使用现有“测试”按钮验证连接。
6. 保存和切换 provider 时继续使用现有 provider draft key，避免不同 Base URL 的 OpenAI-compatible 凭证互相覆盖。

Base URL 字段保持可见。现有 fixed-origin 配置以 protocol 为粒度，如果把 `openai` 标记为 fixed-origin，会错误影响 OpenAI、DeepSeek、OpenRouter 等其他服务商。

### 请求和数据流

配置与请求数据流：

`Agnes AI preset` → 浏览器 `ApiProtocolConfig(openai)`（含浏览器本地 Key）→ 非秘密 `byokProvider` → `/api/app-config` → `od config byok get|set` / web hydration

运行时请求仍复用既有路径：

`ApiProtocolConfig(openai)` → 现有 OpenAI-compatible provider → `POST <baseUrl>/chat/completions`

启动水合时，已知 provider 和受支持的自定义 endpoint 都可进入 BYOK 模式。若 daemon metadata 与浏览器当前 protocol + Base URL 相同，保留浏览器本地 Key 并刷新模型；身份变化或 CLI-first 水合必须保持空 Key。例行 daemon-mode/bootstrap 同步省略 `byokProvider`，避免覆盖 CLI 已保存而尚未水合的选择；用户明确从 BYOK 切换到 Local CLI 时才写入 `byokProvider: null`，reload 后继续保持 Local CLI。

CLI 只支持：

```text
od config byok get
od config byok set <protocol> <base-url> <model>
```

`get` 不接受 positional 参数；`set` 恰好接受三个非秘密 positional 参数。daemon 拒绝无效选择时，CLI 输出结构化 `missing-input` 错误并以对应的非零退出码退出，而不是报告 daemon-not-running。

### 凭证安全

- 不在 provider catalogue 中包含真实 Key。
- API Key 仅存在于浏览器现有 credential/draft 流；不得进入 shared contract、daemon app-config 或 CLI 参数。
- 单元测试只使用占位符或空字符串，且不得在输出中打印该值。
- 连接测试继续使用现有 daemon secret redaction。
- 验证输出不得打印 Key、Authorization header 或完整凭证配置。
- 截图前确认 API Key 字段为空或处于掩码状态。

### 模型列表行为

`agnes-2.0-flash` 作为静态推荐模型始终可选。

Agnes 文本文档明确承诺 Chat Completions，但未把 `/v1/models` 列为接入条件。本次不新增 Agnes 专用模型拉取逻辑；即使“拉取模型”失败，静态默认模型与聊天连接测试仍可独立工作。

## 错误处理

- API Key 缺失：复用现有 BYOK 必填校验。
- Base URL、protocol 或 model 无效：daemon app-config 返回结构化 HTTP 400 `missing-input`，CLI 保持 daemon-healthy 的输入错误语义。
- 未授权或 Key 无效：复用连接测试错误与脱敏逻辑。
- Agnes 服务不可达或超时：复用现有 OpenAI-compatible 网络错误处理。
- 模型列表拉取失败：保留静态 `agnes-2.0-flash`，不阻止用户测试或保存配置。
- 模型调用失败：展示现有 provider 错误，不回显请求头或 Key。

## 测试与验证

### 单元测试

在 `apps/web/tests/state/config.test.ts` 增加测试，验证：

- `KNOWN_PROVIDERS` 包含唯一的 `Agnes AI`。
- Agnes 使用 `openai` protocol。
- Base URL 与默认模型等于官方参数。
- `BYOK_PROVIDER_PRESETS` 能解析出 `agnes-ai`，并继承正确的 Base URL 与模型。

同时覆盖：同一 provider identity 保留浏览器本地 Key、CLI-first hydration 为空 Key、自定义受支持 endpoint 可水合，以及显式 BYOK → Local CLI 写入 `null` 而例行同步省略字段。`EntryShell.onboarding` 与 `SettingsDialog.execution` 交互测试确认 Agnes 预填与跨 provider Key 隔离。

daemon/CLI 测试覆盖真实 `/api/app-config` 400（无效 protocol、URL、空 model 不改写旧值）、有效 Agnes/自定义 endpoint、`od config byok get|set` 的 JSON 输出、精确 positional arity，以及结构化 `missing-input` CLI 错误。

### 静态验证

- `corepack pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/state/config.test.ts tests/components/EntryShell.onboarding.test.tsx tests/components/SettingsDialog.execution.test.tsx`
- `corepack pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/app-config.test.ts tests/cli-templates.test.ts tests/server-persistence-smoke.test.ts`
- `corepack pnpm --filter @open-design/contracts typecheck`
- `corepack pnpm --filter @open-design/web typecheck`
- `corepack pnpm --filter @open-design/daemon exec tsc -p tsconfig.json --noEmit`
- `corepack pnpm --filter @open-design/daemon exec tsc -p tsconfig.tests.json --noEmit`
- `corepack pnpm guard`

### 运行时验证

1. 使用 `pnpm tools-dev` 启动 daemon、web 和 desktop。
2. 通过 `pnpm tools-dev inspect desktop status` 确认桌面窗口可见。
3. 在 BYOK 页面选择 `Agnes AI`。
4. 确认 Base URL 和 Model 正确，API Key 未被预填为其他 provider 的凭证。
5. 保存一张 Key 为空或已掩码的验证截图。

真实 Key 未提供时，验收范围止于 UI、配置持久化、请求路径和错误处理。真实线上成功只在用户通过安全输入方式提供 Key 后验证。

## 验收标准

- BYOK 提供方列表能直接选择 `Agnes AI`。
- 选择后预填官方 Base URL 与 `agnes-2.0-flash`。
- API Key 不写入源码、测试或日志，也不从其他 provider 误复用。
- 现有 OpenAI-compatible 连接测试和聊天请求路径无需新增协议即可工作。
- `od config byok get|set` 只能读写非秘密 provider metadata；无效选择产生结构化输入错误而非 daemon-not-running。
- 同一 identity 水合保留浏览器本地 Key；CLI-first/身份变化水合不导入 Key；显式 Local CLI 切换清除 metadata 而 bootstrap 不覆盖 CLI 选择。
- 相关单元测试、web typecheck、仓库 guard 和根 typecheck 通过。
- 桌面端运行验证能看到 Agnes AI 入口和正确预填值。
