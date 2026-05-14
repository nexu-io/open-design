---
id: 20260513-unify-agent-runtime-abstraction
name: 统一 Agent Runtime 抽象
status: implemented
created: '2026-05-13'
---

## 概览

### 问题陈述

- Agent runtime 差异目前仍暴露到上层调用路径中，上层模块仍可能需要感知具体 runtime 的协议、事件格式、parser、handler、stdout 形态或能力差异。
- 一个已知例子：`server.ts` 中对 `claude-stream-json`、`qoder-stream-json`、`copilot-stream-json`、`pi-rpc`、`acp-json-rpc`、`json-event-stream` 和 plain stdout 的显式处理。

### 目标

- 重构代码，统一 agent runtime 抽象 `RuntimeAdapter`。
- 将不同 agent runtime 的差异性封装到底层模块中。
- 让上层逻辑无需感知具体 runtime 的协议、parser、handler、事件格式或输出形态。
- 现有的文件结构、AgentRuntimeDef 等尽量不改动，避免大范围的文件搬迁或变量重命名，防止引发大量合并冲突。

### 成功标准

- 上层入口基于统一 runtime 定义调度 agent。
- 新增或调整 agent runtime 时，主要改动集中在底层 runtime 定义或适配模块。
- `server.ts` 和其他上层模块不再承担按具体 runtime、协议、parser、handler 或输出格式分支的职责。

## 调研

### 摘要

- 当前最主要的上层耦合点在 `apps/daemon/src/server.ts`：chat spawn path 需要直接读取 `def.streamFormat` / `def.eventParser` / `def.promptViaStdin`，并按 Claude、Qoder、Copilot、Pi RPC、ACP、json-event-stream、plain stdout 分支接入不同 parser/session handler。来源：`apps/daemon/src/server.ts:3787-3867`, `apps/daemon/src/server.ts:4036-4176`
- `server.ts` 还需要理解不同 runtime 的 lifecycle 差异：哪些 structured stream 要启用 substantive-output tracking、Pi/ACP session 如何挂到 run 以支持 abort、ACP forced SIGTERM 何时算成功、Claude failure diagnostics 何时触发。来源：`apps/daemon/src/server.ts:4061-4078`, `apps/daemon/src/server.ts:4174-4176`, `apps/daemon/src/server.ts:4192-4264`
- Critique Theater 的 prompt 组合和 spawn routing 都感知 `streamFormat === 'plain'`，导致上层业务逻辑需要知道哪些 runtime 输出 wrapper protocol、哪些 runtime 可被 critique parser 直接消费。来源：`apps/daemon/src/server.ts:3060-3138`, `apps/daemon/src/server.ts:3923-4034`
- prompt/spawn 周边逻辑仍感知 runtime 传输形态：stdin mode 由 `promptViaStdin` 或 `acp-json-rpc` 决定，SSE start payload 暴露 `streamFormat`，json-event-stream handler 由 `def.eventParser || def.id` 选择 parser kind。来源：`apps/daemon/src/server.ts:3790-3799`, `apps/daemon/src/server.ts:3808-3841`, `apps/daemon/src/server.ts:4155-4167`
- 已有 parser/session 模块本身相对独立，但统一入口尚未把“如何 attach stdout/stdin、如何 emit agent events、如何报告 fatal/abort/completion”封装为 runtime-level adapter contract。来源：`apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`

### 现有系统

- Web/daemon 的架构边界已经把 agent CLI 调度放在 daemon：web 负责 UI 且保持 stateless，daemon 检测 agents、注册 skills、管理 artifacts 并 broker REST/SSE。来源：`docs/spec.md:85-90`, `apps/AGENTS.md:7-18`
- 架构文档描述的目标形态是 daemon 维护 agent adapter pool，并在生成流程中以 `system/user/cwd` 调用 agent adapter、再把 agent events 流回 web。来源：`docs/architecture.md:113-129`, `docs/architecture.md:187-226`
- 设计文档中的 adapter 接口目标是 `detect()`、`capabilities()`、`run(params): AsyncIterable<AgentEvent>`、`cancel()`，并把事件统一为 thinking/tool/text/error/done 等形态。来源：`docs/agent-adapters.md:13-69`
- 当前实现中的 runtime 定义集中在 `RuntimeAgentDef`，包含 CLI 二进制、版本参数、`buildArgs(...)`、`streamFormat`、`promptViaStdin`、`eventParser`、模型发现、能力和 prompt 预算字段。来源：`apps/daemon/src/runtimes/types.ts:37-68`
- 当前 registry 只是聚合各 runtime definition 并提供 `getAgentDef(id)`；新增 runtime 需要在 registry import 并加入 `AGENT_DEFS`。来源：`apps/daemon/src/runtimes/registry.ts:1-48`
- runtime definition 已承载部分底层差异：Claude 使用 stdin prompt 和 `claude-stream-json`；Codex 使用 stdin prompt、`json-event-stream` 和 `eventParser: 'codex'`；Pi 使用 RPC mode、stdin prompt、`pi-rpc` 和 image 支持。来源：`apps/daemon/src/runtimes/defs/claude.ts:38-70`, `apps/daemon/src/runtimes/defs/codex.ts:33-82`, `apps/daemon/src/runtimes/defs/pi.ts:50-95`
- agent spawn 路径仍在 `server.ts` 中基于 `def.streamFormat` 决定 stdin mode、spawn env、SSE start payload、stdout/stderr handlers、structured parser/session attachment 和 close-status 处理。来源：`apps/daemon/src/server.ts:3787-3867`, `apps/daemon/src/server.ts:4036-4176`, `apps/daemon/src/server.ts:4192-4268`
- Critique Theater eligibility 目前在 prompt composer 和 spawn path 都显式基于 `streamFormat === 'plain'`；非 plain adapters 会跳过 orchestrator 并走 legacy generation。来源：`apps/daemon/src/server.ts:3060-3138`, `apps/daemon/src/server.ts:3923-4034`

### 设计输入

- parser/handler 已按协议拆成独立模块：Claude JSONL parser 将 Claude stream-json 映射为 UI-friendly events；Qoder parser 独立处理 adapter-specific wrapper objects；Copilot parser 把 dotted top-level types 映射为相同 UI 事件。来源：`apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/qoder-stream.ts:1-12`, `apps/daemon/src/copilot-stream.ts:1-31`
- `json-event-stream` 已经是多 parser-kind 分发器，支持 `opencode`、`gemini`、`cursor-agent`、`codex`，并输出统一 event sink；`server.ts` 仍负责传入 `def.eventParser || def.id`。来源：`apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/server.ts:4155-4167`
- ACP 和 Pi 不是简单 stdout parser：ACP session 通过 JSON-RPC 初始化/session/prompt、处理权限请求和 model selection；Pi session 发送 `prompt` RPC、映射 agent events，并返回 `hasFatalError()`/`abort()` 给 run lifecycle。来源：`apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`
- spawn command invocation 已有通用 helper：`resolveAgentLaunch` 处理 executable resolution 和 Codex native binary 特例；`execAgentFile` 通过 `@open-design/platform` 的 `createCommandInvocation` 执行 agent 文件。来源：`apps/daemon/src/runtimes/launch.ts:15-49`, `apps/daemon/src/runtimes/invocation.ts:8-29`
- runtime tests 已覆盖 adapter-specific argv 和 protocol fields，例如 ACP runtimes 声明 `acp-json-rpc`，Pi 声明 `pi-rpc`、stdin prompt 和 image support。来源：`apps/daemon/tests/runtimes/agent-args.test.ts:148-175`
- prompt budget tests 依赖 runtime definition 的 `streamFormat` 和 `maxPromptArgBytes`；DeepSeek 作为 plain runtime 仍必须保留 prompt argv budget guard。来源：`apps/daemon/tests/runtimes/prompt-budget.test.ts:7-17`, `apps/daemon/tests/runtimes/prompt-budget.test.ts:37-68`
- Critique spawn wiring tests 固化了当前 `streamFormat === 'plain'` gating，并列出非 plain formats：`claude-stream-json`、`qoder-stream-json`、`copilot-stream-json`、`json-event-stream`、`acp-json-rpc`。来源：`apps/daemon/tests/critique-spawn-wiring.test.ts:174-214`

### 约束与依赖

- 仓库边界要求 CLI/agent argument definition changes 放在 `apps/daemon/src/runtimes/defs/`，stdout parser changes 放在匹配 runtime helpers 和 parser tests；app tests 必须在 `apps/daemon/tests/`。来源：`apps/AGENTS.md:12-18`, `apps/AGENTS.md:27-32`
- Adapter source layout 文档要求每个 adapter 独立模块，让社区新增 adapter 不需要触碰 core daemon code；当前代码还未达到该目录形态。来源：`docs/agent-adapters.md:298-319`
- daemon 不应提升 agent 权限；Codex/Cursor 由 workspace sandbox 限制，Qoder 由 cwd 和显式 absolute `--add-dir` 限制。来源：`docs/agent-adapters.md:291-297`
- ACP model detection 和 ACP session 包含明确的超时、错误和 recoverable model selection 分支；统一抽象需要保留这些协议级 lifecycle/failure semantics。来源：`apps/daemon/src/acp.ts:350-388`, `apps/daemon/src/acp.ts:492-528`
- Pi image forwarding 有文件类型、数量、总大小和 realpath upload-root 检查；统一抽象不能绕过这些 runtime-specific safety checks。来源：`apps/daemon/src/pi-rpc.ts:399-449`
- 当前 close handler 对 structured stream errors、empty-output guard、ACP forced SIGTERM clean completion 和 Claude failure diagnostics 有集中逻辑；抽象边界需要保留 run status 的 fail-fast/visible error 行为。来源：`apps/daemon/src/server.ts:4061-4078`, `apps/daemon/src/server.ts:4192-4264`

### 关键参考

- `apps/daemon/src/runtimes/types.ts:37-68` - 当前 runtime definition schema。
- `apps/daemon/src/runtimes/registry.ts:1-48` - runtime registry 聚合点。
- `apps/daemon/src/server.ts:3060-3138,3770-4268` - prompt eligibility、spawn、protocol branch、stream handling 和 close lifecycle 的上层耦合点。
- `apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/qoder-stream.ts:1-12`, `apps/daemon/src/copilot-stream.ts:1-31`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529` - 现有协议/parser/session 模块。
- `docs/agent-adapters.md:13-69,298-319` - 目标 adapter interface 和 source layout。
- `apps/daemon/tests/runtimes/agent-args.test.ts:148-175`, `apps/daemon/tests/runtimes/prompt-budget.test.ts:7-68`, `apps/daemon/tests/critique-spawn-wiring.test.ts:174-214` - 现有测试覆盖的 runtime/protocol invariants。

## 设计

### 假设

- 本次只做“最小 runtime 抽象”，不实现文档中的完整 `AgentAdapter.run(): AsyncIterable<AgentEvent>` / `detect()` / `cancel()` 体系；完整 adapter 形态留给后续演进。来源：`docs/agent-adapters.md:13-69`
- 现有 `RuntimeAgentDef`、`runtimes/defs/*` 和 registry 结构保持不搬迁，避免大范围重命名和合并冲突。来源：`apps/daemon/src/runtimes/types.ts:37-68`, `apps/daemon/src/runtimes/registry.ts:1-48`
- Critique Theater 本轮继续只支持 plain stdout；本次目标是把这个限制从上层的 `streamFormat === 'plain'` 字符串判断改成 adapter capability，不扩展 structured adapters 的 critique 支持。来源：`apps/daemon/src/server.ts:3060-3138`, `apps/daemon/src/server.ts:3923-4034`

### 设计摘要

- 新增一个薄的 `RuntimeAdapter` 底层模块，作为 `RuntimeAgentDef` 与 daemon 上层 chat/connection flow 之间的唯一 runtime 差异封装层。
- `RuntimeAgentDef.streamFormat`、`eventParser`、`promptViaStdin` 等字段先保留，但只允许 runtime adapter factory 内部解释；`server.ts` 和 connection test path 改为调用语义方法，例如 prompt delivery、critique eligibility、stream attachment、close classification。
- 不重写 spawn/run 生命周期，不搬迁 parser/session 模块；adapter 只把现有 `create*StreamHandler`、`attachAcpSession`、`attachPiRpcSession` 和 plain stdout forwarding 包成统一 attachment contract。
- 采用 fail-fast 策略：adapter factory 遇到未知 `streamFormat` 直接抛错，不默默降级成 plain，避免隐藏坏 runtime definition。

### 设计决策

- 决策：保留 `RuntimeAgentDef` 作为 runtime 定义源，只新增 adapter 层解释底层协议字段；这符合现有 defs/registry 集中管理 runtime 的结构，也避免改动每个 runtime 文件。来源：`apps/daemon/src/runtimes/types.ts:37-68`, `apps/daemon/src/runtimes/registry.ts:19-48`
- 决策：adapter 暴露语义能力而非协议字符串，例如 `supportsCritiqueTheater()`、`stdinMode()`、`attach()`、`classifyClose()`；上层不再按 `claude-stream-json` / `pi-rpc` / `acp-json-rpc` 等字符串分支。来源：`apps/daemon/src/server.ts:3787-3867`, `apps/daemon/src/server.ts:4036-4176`
- 决策：parser/session 实现继续复用现有模块，由 adapter 负责选择和接线；现有模块已经分别封装 Claude/Qoder/Copilot/json-event/Pi/ACP 协议细节。来源：`apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/qoder-stream.ts:1-12`, `apps/daemon/src/copilot-stream.ts:1-31`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`
- 决策：ACP 与 Pi 只共享 adapter contract，不共享协议实现；二者包含不同的 session lifecycle、abort、fatal/completion 和安全检查，强行合并会扩大范围。来源：`apps/daemon/src/acp.ts:350-388`, `apps/daemon/src/acp.ts:492-528`, `apps/daemon/src/pi-rpc.ts:399-449`
- 决策：structured stream 的 substantive-output guard、stream error、ACP forced SIGTERM success、Claude diagnostics 等 close semantics 迁移到 adapter attachment/close classifier 返回值，保持 fail-fast/visible failure 行为。来源：`apps/daemon/src/server.ts:4061-4078`, `apps/daemon/src/server.ts:4192-4264`
- 决策：connection test 使用同一个 adapter helper，避免 `server.ts` 和 connection test 各自维护一套 runtime protocol 分支并继续漂移。来源：`apps/daemon/src/connectionTest.ts:305-305`, `apps/daemon/src/server.ts:4080-4167`
- 决策：SSE `start` payload 不再作为上层 runtime protocol 依赖点；若客户端无合同字段依赖，移除或停止消费 `streamFormat`。来源：`apps/daemon/src/server.ts:3789-3799`, `packages/contracts/src/sse/chat.ts:1-30`

### 系统结构

```mermaid
flowchart TD
  Def[RuntimeAgentDef\n现有 defs/*] --> Factory[createRuntimeAdapter(def)]
  Factory --> Adapter[RuntimeAdapter\n语义行为]
  Server[server.ts chat flow] --> Adapter
  Conn[connectionTest flow] --> Adapter
  Adapter --> Plain[plain stdout 转发]
  Adapter --> JSON[Claude/Qoder/Copilot/json-event handlers]
  Adapter --> RPC[ACP/Pi sessions]
```

### 接口 / API

伪类型草图：

```ts
type RuntimeAdapter = {
  readonly id: string;
  readonly displayName: string;
  supportsCritiqueTheater(): boolean;
  stdinMode(): 'pipe' | 'ignore';
  shouldWritePromptToStdin(): boolean;
  attach(ctx: RuntimeAttachContext): RuntimeAttachment;
};

type RuntimeAttachment = {
  session?: RuntimeSessionHandle | null;
  trackingSubstantiveOutput: boolean;
  producedSubstantiveOutput(): boolean;
  streamError(): string | null;
  classifyClose(exit: RuntimeExit): 'succeeded' | 'failed' | 'canceled' | null;
};

type RuntimeSessionHandle = {
  abort?: () => void;
  hasFatalError?: () => boolean;
  completedSuccessfully?: () => boolean;
};
```

adapter 负责协议专属映射：

- `plain`：把 stdout 作为 `stdout` chunk 转发。
- `claude-stream-json`：挂接 `createClaudeStreamHandler`。
- `qoder-stream-json`：挂接 `createQoderStreamHandler` 并进行 substantive-output/error tracking。
- `copilot-stream-json`：挂接 `createCopilotStreamHandler`。
- `json-event-stream`：挂接 `createJsonEventStreamHandler(def.eventParser || def.id, ...)` 并进行 substantive-output/error tracking。
- `pi-rpc`：挂接 `attachPiRpcSession`、image safety inputs、session abort/fatal handling，以及 substantive-output/error tracking。
- `acp-json-rpc`：挂接 `attachAcpSession`、MCP server inputs、session abort/fatal/completion handling。

### 系统流程

流程：

1. Chat run 像现在一样解析 `RuntimeAgentDef`。
2. Chat run 创建一次 `adapter = createRuntimeAdapter(def)`。
3. Prompt composition 和 Critique Theater 使用 adapter 语义，而不是 `streamFormat`。
4. Spawn code 使用 adapter stdin 行为，同时保留现有 launch/env helpers。
5. Spawn 后，`adapter.attach(...)` 接线 stdout/stderr/parser/session，并返回 attachment state。
6. Close handler 向 attachment/classifier 查询 fatal/error/empty-output/ACP completion semantics，然后结束 run。
7. Connection test path 复用同一套 adapter attach/stdin 行为。

### 变更范围

#### 影响区域

- Runtime abstraction foundation：新增一个小型底层模块，负责 protocol selection，并向 daemon caller 暴露语义化 runtime 行为。
- Chat run spawn/stream handling：移除上层对 `def.streamFormat` / `def.eventParser` / `def.promptViaStdin` 的分支；保留现有 spawn/env/invocation flow。
- Critique Theater gating：保留当前 plain-only 行为，但表达为 adapter capability，而不是 protocol-string check。
- Connection/runtime smoke path：复用同一套 adapter 行为，让 runtime checks 不再维护重复的 parser/stdin/session branching。
- Contracts/UI compatibility：避免把 `streamFormat` 变成 public contract dependency；只有确认没有 client 依赖后，才移除或停止消费它。

#### 计划文件

- `apps/daemon/src/runtimes/runtime-adapter.ts` - 新 adapter factory 和语义 adapter contract。
- `apps/daemon/src/runtimes/types.ts` - 仅在 adapter contract 需要时增加少量共享类型。
- `apps/daemon/src/server.ts` - 在 prompt gating、spawn stdin behavior、stream attachment 和 close classification 中，用 adapter calls 替换 protocol branches。
- `apps/daemon/src/connectionTest.ts` - 将 runtime smoke stream/stdin behavior 路由到 adapter。
- `apps/daemon/tests/runtimes/*` - 增加 adapter 覆盖并更新 runtime behavior tests。
- `apps/daemon/tests/critique-spawn-wiring.test.ts` - 断言 critique eligibility 通过 adapter capability，而不是 stream format strings。
- `packages/contracts/src/sse/chat.ts` 和 web SSE consumers - 只有确认 `streamFormat` cleanup 安全后才触碰。

### 边界情况

- 未知 `streamFormat`：在 adapter creation 期间抛错，让坏 runtime definitions 显式失败。
- Structured stream 以 0 退出但没有 substantive output：保留显式失败，不视为带空 assistant message 的成功。
- ACP clean completion 后跟 forced SIGTERM：仅在狭窄的 clean-completion 形态下保持 succeeded。
- Pi image forwarding：adapter 必须把现有 image/upload root checks 传给 `attachPiRpcSession`；不得绕过或使用 mock path。
- Stdin write errors：仅保留现有 EPIPE-specific recovery；非 EPIPE stdin errors 仍保持可见。
- 非 plain runtime 上的 Critique：仍禁用，但原因是 adapter capability，而不是 prompt/spawn code 中的 protocol string knowledge。

### 验证策略

- Runtime adapter unit tests：覆盖每个现有 `streamFormat`、未知 format fail-fast、stdin mode、prompt write behavior 和 critique eligibility。来源：`apps/daemon/src/runtimes/types.ts:50-55`, `apps/daemon/tests/runtimes/agent-args.test.ts:148-175`
- Stream attachment tests：把代表性 stdout samples 输入 fake child streams，覆盖 plain、Claude、Qoder、Copilot、json-event、Pi 和 ACP paths；断言发出的 `stdout`/`agent`/`error` events 与当前行为一致。来源：`apps/daemon/src/claude-stream.ts:1-30`, `apps/daemon/src/json-event-stream.ts:376-421`, `apps/daemon/src/acp.ts:398-569`, `apps/daemon/src/pi-rpc.ts:315-529`
- Close semantics tests：保留 structured empty-output failure、ACP fatal failure、ACP forced SIGTERM success、stream error failure 和 cancel classification。来源：`apps/daemon/src/server.ts:4192-4264`
- Critique wiring tests：把 assertions 从 protocol strings 更新为 adapter capability，同时保留当前 non-plain skip behavior。来源：`apps/daemon/tests/critique-spawn-wiring.test.ts:174-214`
- Package validation：运行 `pnpm --filter @open-design/daemon test`、`pnpm --filter @open-design/daemon typecheck`，再运行 repo-level `pnpm guard` 和 `pnpm typecheck`。来源：`apps/AGENTS.md:47-59`, `AGENTS.md#validation-strategy`

## 计划

- [x] 步骤 1：引入 runtime adapter 基础
  - [x] 子步骤 1.1 实现：在 `apps/daemon/src/runtimes/` 下新增 `createRuntimeAdapter(def)` 和最小语义类型。
  - [x] 子步骤 1.2 实现：把每个当前 `streamFormat` 映射到现有 parser/session helpers，不移动 helper 文件。
  - [x] 子步骤 1.3 实现：让未知 formats 抛出清晰错误。
  - [x] 子步骤 1.4 验证：为 format coverage、stdin behavior、critique eligibility 和 fail-fast unknown formats 增加 adapter unit tests。
- [x] 步骤 2：把 chat run protocol branching 移到 adapter 后面
  - [x] 子步骤 2.1 实现：每个 run 创建一次 adapter，并用它处理 critique eligibility/prompt alignment。
  - [x] 子步骤 2.2 实现：用 adapter methods 替换 spawn stdin 和 prompt-write conditionals。
  - [x] 子步骤 2.3 实现：用 `adapter.attach(...)` 替换 stream parser/session branching。
  - [x] 子步骤 2.4 实现：用 attachment/classifier state 替换 close-handler protocol checks，同时保留当前 failure semantics。
  - [x] 子步骤 2.5 验证：更新 chat/critique tests，断言 semantic capability behavior 而不是 protocol strings。
- [x] 步骤 3：在 connection/runtime checks 中复用 adapter
  - [x] 子步骤 3.1 实现：让 connection test stream/stdin behavior 走同一个 adapter helper。
  - [x] 子步骤 3.2 验证：新增或更新 tests，确保 connection checks 不会重新引入重复 protocol branching。
- [x] 步骤 4：兼容性和完整验证
  - [x] 子步骤 4.1 实现：只有确认没有 contract/UI consumer 需要后，才移除或停止依赖 public `streamFormat` SSE start data。
  - [x] 子步骤 4.2 验证：运行 `pnpm --filter @open-design/daemon test`。
  - [x] 子步骤 4.3 验证：运行 `pnpm --filter @open-design/daemon typecheck`。
  - [x] 子步骤 4.4 验证：运行 `pnpm guard` 和 `pnpm typecheck`。

## 备注

<!-- 可选章节，按需添加。 -->

### 实现

- `apps/daemon/src/runtimes/runtime-adapter.ts` - 新增 `RuntimeAdapter` semantic contract、`createRuntimeAdapter(def)`、supported stream-format validation、stdin/critique capability helpers，以及到现有 plain stdout、Claude、Qoder、Copilot、json-event、Pi RPC 和 ACP helpers 的 attachment wiring。
- `apps/daemon/tests/runtimes/runtime-adapter.test.ts` - 增加 adapter foundation 覆盖，覆盖所有当前 runtime formats、stdin behavior、critique eligibility 和 unknown-format fail-fast errors。
- `apps/daemon/src/runtimes/runtime-adapter.ts` - 新增 adapter-owned close classification 和 ACP MCP capability helpers，使 chat lifecycle 和 MCP routing 不再按 runtime protocol strings 分支。
- `apps/daemon/src/server.ts` - 每个 chat run 创建一个 runtime adapter，并将其用于 critique eligibility、stdin mode、prompt writing、stream/session attachment、close classification 和 start payload cleanup。
- `apps/daemon/src/connectionTest.ts` - 通过 `createRuntimeAdapter(def)` 路由 agent smoke-test stdin 和 stream/session handling。
- `apps/daemon/tests/critique-spawn-wiring.test.ts` - 更新 critique spawn tests，断言 adapter capability gating 而不是 protocol-string checks。
- `apps/web/src/providers/daemon.ts` - 更新 SSE client 注释，描述 runtime-adapter-driven event streams。

### 验证

- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/runtimes/runtime-adapter.test.ts` - 通过。
- `pnpm --filter @open-design/daemon typecheck` - 通过。
- `pnpm --filter @open-design/daemon test -- tests/runtimes/runtime-adapter.test.ts` - 通过；由于 package script argument handling，实际运行了完整 daemon test suite。
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/runtimes/runtime-adapter.test.ts tests/critique-spawn-wiring.test.ts` - 通过。
- `pnpm --filter @open-design/daemon typecheck` - 通过。
- `pnpm --filter @open-design/daemon test` - full parallel suite 初次运行时有一个 chat-route failure；单独重跑失败 test file 后通过，说明这是 flaky suite interaction，而不是确定性 regression。
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/chat-route.test.ts -t "keeps Claude stream runs alive"` - 通过。
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/chat-route.test.ts` - 通过。
- `pnpm guard` - 通过。
- `pnpm typecheck` - 通过。
- `pnpm --filter @open-design/daemon test` - 重跑时在 full parallel suite 中遇到一个无关的 `tests/project-watchers.test.ts` timeout；runtime/chat/connection suites 已通过。
- `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/project-watchers.test.ts -t "still emits events when the watch root is itself nested under .od"` - 通过。
