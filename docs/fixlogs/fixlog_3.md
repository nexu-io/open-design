# Fix Log #3 — API 模式工具调用执行循环 + Token 可视化

**日期**：2026-05-06
**项目**：C:\Users\54322\open-design
**基于**：G:\open_design_fix\fix_3.md

---

## 修改概要

| 修复编号 | 文件 | 操作 | 说明 |
|----------|------|------|------|
| 3.1 | `apps/web/src/providers/tool-call-parser.ts` | **新建** (+115) | 从模型输出解析 `<tool_call>` XML 块 |
| 3.2 | `apps/web/src/providers/tool-executor.ts` | **新建** (+145) | 通过守护进程端点执行 Read/Write/Bash/TodoWrite |
| 3.3 | `apps/web/src/providers/anthropic.ts` | 修改 (+140) | 扩展 `StreamHandlers` + 新增 `streamMessageWithAgentLoop` |
| 3.3b | `apps/web/src/components/ProjectView.tsx` | 修改 (+35) | 接入 Agent Loop + 工具事件回调 |
| 3.4 | `apps/daemon/src/server.ts` | 修改 (+50) | 添加 `/api/projects/:id/bash` 端点 |
| 3.7 | `apps/web/src/components/TokenUsage.tsx` | **新建** (+90) | Token 用量可视化组件 |

**总计**：3 个新建文件，3 个修改文件，+346 / -41 行

---

## 详细修改

### 修复 3.1：工具调用 XML 解析器（新建）

**文件**：`apps/web/src/providers/tool-call-parser.ts`

- `parseToolCalls(text)` — 从文本中提取 `<tool_call>` 块，返回 `{ toolCalls, cleanText }`
- `isInsideToolCall(text)` — 检测是否在未闭合的 tool_call 块内（用于流式缓冲）
- `createToolCallAccumulator(onToolCalls)` — 流式累加器，完整块时回调

支持格式：
```xml
<tool_call name="Read">
{"file_path": "path/to/file"}
</tool_call>
```

### 修复 3.2：工具执行器（新建）

**文件**：`apps/web/src/providers/tool-executor.ts`

- `executeToolCall(call, baseUrl, projectId)` — 执行单个工具调用
- `executeToolCalls(calls, ...)` — 批量执行，返回 `ToolResult[]`
- `formatToolResultsAsXml(results)` — 格式化为 `<tool_result>` XML 块
- `resetToolLoopCounter()` / `isMaxRoundsReached()` — 防止无限循环（max 25 轮）

支持的工具：
| 工具 | 端点 | 说明 |
|------|------|------|
| Read | `GET /api/projects/:id/files/*` | 读取文件内容 |
| Write/Edit | `POST /api/projects/:id/files` | 写入 JSON `{name, content}` |
| Bash | `POST /api/projects/:id/bash` | 执行 Shell 命令（新增端点） |
| TodoWrite | 无 | 虚拟工具，UI 渲染待办卡片 |

### 修复 3.3：Agent Loop（anthropic.ts）

**文件**：`apps/web/src/providers/anthropic.ts`

1. `StreamHandlers` 扩展：
```typescript
onToolCall?: (call: { name, parameters }) => void
onToolResult?: (result: { name, content, isError }) => void
onUsage?: (usage: { inputTokens?, outputTokens? }) => void
```

2. `streamMessage` 原生路径添加 usage 提取：
```typescript
const usage = final.usage;
if (usage && handlers.onUsage) {
  handlers.onUsage({ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens });
}
```

3. 新增 `streamMessageWithAgentLoop(cfg, system, history, signal, handlers, toolCtx)`：
   - 循环调用 `streamMessage`
   - 每轮解析 `<tool_call>` 块
   - 有工具调用 → 执行 → 追加 `<tool_result>` 到 history → 下一轮
   - 无工具调用 → 调用 `handlers.onDone`
   - 最大 25 轮

### 修复 3.3b：ProjectView 接入（ProjectView.tsx）

```typescript
// 替换 streamMessage → streamMessageWithAgentLoop
void streamMessageWithAgentLoop(config, systemPrompt, apiHistory, controller.signal, {
  onDelta: ..., onDone: ..., onError: ...,
  onToolCall: (call) => {
    pushEvent({ kind: 'tool_use', id, name: call.name, input: call.parameters });
  },
  onToolResult: (result) => {
    pushEvent({ kind: 'tool_result', toolUseId, content: result.content.slice(0, 500), isError });
  },
}, {
  projectId: project.id,
  baseUrl: window.location.origin,
});
```

### 修复 3.4：Bash 执行端点（守护进程）

**文件**：`apps/daemon/src/server.ts`

新增 `POST /api/projects/:id/bash`：
- Body: `{ command: string, timeout?: number }`
- 安全约束：
  - cwd 限定为项目目录
  - 命令超时默认 30s，最大 60s
  - stdout/stderr 各截断为 100KB
- 响应: `{ stdout, stderr, exitCode }`

### 修复 3.7：Token 用量可视化组件（新建）

**文件**：`apps/web/src/components/TokenUsage.tsx`

- `<TokenUsage>` — 单条消息的 token 用量（进度条 + 数字）
- `<CumulativeTokenUsage>` — 累计用量（多条消息汇总）
- 颜色指示：>80% 黄色警告，>95% 红色警告

---

## 累计修改文件列表（全部修复批次）

| 修复批次 | 文件 | 变更 |
|----------|------|------|
| fix_0 #1 | `apps/daemon/src/server.ts` | `lastStopReason` 追踪 + `child.on('close')` |
| fix_0 #2 | `apps/web/src/providers/daemon.ts` | `end` 事件默认 `null` + `onDone` 仅限 `succeeded` |
| fix_0 #3a | `apps/web/src/components/ProjectView.tsx` | 新建聊天 `onDone` 移除 `prev.runId` |
| fix_0 #3b | `apps/web/src/components/ProjectView.tsx` | 重连 `onDone` 移除硬编码 |
| fix_0 #4 | `apps/web/src/providers/daemon.ts` | transcript 内联工具上下文 |
| fix_1 #1.1–1.4 | `apps/daemon/src/prompts/discovery.ts` | RULE 1 防循环 + Phase arc |
| fix_2 #2.1a | `apps/web/src/state/maxTokens.ts` | FALLBACK 8192 → 16384 |
| fix_2 #2.1b+2.2 | `apps/daemon/src/server.ts` | 代理默认 16384 + message_delta.stop_reason |
| fix_2 #2.3 | `apps/web/src/providers/api-proxy.ts` | end 事件截断检测 |
| fix_2 #2.4 | `apps/web/src/providers/anthropic.ts` | finalMessage() 截断检测 |
| **fix_3 #3.1** | **`apps/web/src/providers/tool-call-parser.ts`** | **新建 — 工具调用 XML 解析器** |
| **fix_3 #3.2** | **`apps/web/src/providers/tool-executor.ts`** | **新建 — 工具执行器** |
| **fix_3 #3.3** | **`apps/web/src/providers/anthropic.ts`** | **Agent Loop + usage 提取** |
| **fix_3 #3.3b** | **`apps/web/src/components/ProjectView.tsx`** | **接入 streamMessageWithAgentLoop** |
| **fix_3 #3.4** | **`apps/daemon/src/server.ts`** | **Bash 端点** |
| **fix_3 #3.7** | **`apps/web/src/components/TokenUsage.tsx`** | **新建 — Token 可视化组件** |

---

## 测试结果

（待测试后填写）
