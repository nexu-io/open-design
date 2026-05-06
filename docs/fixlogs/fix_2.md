# 修复计划 #2 — max_tokens 截断导致工具调用输出不完整，系统误报"已完成"

## 问题描述

fix_1 成功打破了发现阶段死循环，对话能正确进入构建阶段。但进入 Phase 3（构建）后，agent 的工具调用输出（TodoWrite JSON）被中途截断，系统却仍然显示"已完成"。agent 实际上没有执行任何有效工作。

**典型截断模式**：

```
agent 输出：{"activeForm": "Emitting artifact", "content": "Emit
← JSON 在此处截断
系统显示：已完成    ← 误报！
实际状态：agent 没有任何有效工作产出
```

用户需要反复输入"继续"，但每次 agent 输出长 JSON 时都会再次截断。

---

## 根因分析

### 根因 1：max_tokens 默认值 8192 对工具调用场景严重不足

**文件**：`apps/web/src/state/maxTokens.ts:13`
```typescript
export const FALLBACK_MAX_TOKENS = 8192;
```

**文件**：`apps/daemon/src/server.ts:4135-4136`
```typescript
max_tokens: typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
```

当 agent 使用 TodoWrite 列出 10 项任务（每项包含 `content` + `activeForm` + `status` 三字段，且为中文文本），JSON 体可轻松超过 2000 tokens。加上系统提示词（~4000+ tokens）和对话历史（~2000+ tokens），以及后续的 Read/Bash 调用，8192 tokens 的输出配额在中间件/代理层就被耗尽。

### 根因 2：守护进程代理层丢失了 stop_reason

**文件**：`apps/daemon/src/server.ts:4179-4188`

```typescript
if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
  sse.send('delta', { delta: data.delta.text });
}
if (event === 'message_stop') {
  sse.send('end', {});       // ← 空对象！stop_reason 未传递
  ended = true;
  return true;
}
```

Anthropic 流式 API 中，`stop_reason` 在 `message_delta` 事件中传递（`data.delta.stop_reason`），但守护进程只监听了 `content_block_delta` 和 `message_stop`，从未捕获 `message_delta`。因此即使上游返回 `stop_reason: "max_tokens"`，前端也无从得知。

### 根因 3：前端代理接收端未检查 stop_reason

**文件**：`apps/web/src/providers/api-proxy.ts:75-78`

```typescript
if (parsed.event === 'end') {
  handlers.onDone(acc);   // ← 无条件调用 onDone
  return;
}
```

前端收到 `end` 事件后直接调用 `onDone`，不检查 `stop_reason`。即使守护进程传递了 `stop_reason`（修复 2.2 后），此处也需相应改动。

### 根因 4：原生 Anthropic SDK 路径同样未检查 stop_reason

**文件**：`apps/web/src/providers/anthropic.ts:82-83`

```typescript
await stream.finalMessage();
handlers.onDone(acc);   // ← 未检查 stop_reason
```

当用户配置了原生 Anthropic API（不走代理）时，`finalMessage()` 返回的 Message 对象包含 `stop_reason` 字段，但代码完全忽略。

---

## 修复方案

### 修复 2.1：提升默认 max_tokens

**文件 1**：`apps/web/src/state/maxTokens.ts`

```diff
- export const FALLBACK_MAX_TOKENS = 8192;
+ // 16384 is enough for ~10 tool calls with Chinese content in a single turn.
+ // 8192 was too low — complex TodoWrite payloads would truncate mid-JSON.
+ export const FALLBACK_MAX_TOKENS = 16384;
```

**文件 2**：`apps/daemon/src/server.ts:4136`（守护进程代理回退值）

```diff
- max_tokens: typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
+ max_tokens: typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 16384,
```

### 修复 2.2：守护进程 Anthropic 代理捕获并转发 stop_reason

**文件**：`apps/daemon/src/server.ts`

在 anthropic 代理处理器中（第 4170-4188 行）：

1. 新增变量 `let stopReason = null;`
2. 监听 `message_delta` 事件，提取 `data.delta?.stop_reason`
3. 在 `end` 事件中传递 `stopReason`

```diff
  let ended = false;
+ let stopReason = null;
  await streamUpstreamSse(response, ({ event, data }) => {
    if (!data) return false;
    if (event === 'error' || data.type === 'error') {
      const message = data.error?.message || data.message || 'Anthropic upstream error';
      sendProxyError(sse, message, { details: data });
      ended = true;
      return true;
    }
+   if (event === 'message_delta' && data.delta?.stop_reason) {
+     stopReason = data.delta.stop_reason;
+     return false;
+   }
    if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
      sse.send('delta', { delta: data.delta.text });
    }
    if (event === 'message_stop') {
-     sse.send('end', {});
+     sse.send('end', { stopReason });
      ended = true;
      return true;
    }
    return false;
  });
```

### 修复 2.3：前端 streamProxyEndpoint 检测截断

**文件**：`apps/web/src/providers/api-proxy.ts:75-78`

```diff
  if (parsed.event === 'end') {
+   const sr = parsed.data?.stopReason;
+   if (sr === 'max_tokens' || sr === 'length') {
+     handlers.onError(new Error(
+       `Response truncated (stop_reason=${sr}). The output hit the token limit. ` +
+       `Try increasing max_tokens in Settings or reducing the prompt length.`
+     ));
+     return;
+   }
    handlers.onDone(acc);
    return;
  }
```

### 修复 2.4：原生 Anthropic SDK 路径检测截断

**文件**：`apps/web/src/providers/anthropic.ts:82-83`

```diff
-    await stream.finalMessage();
-    handlers.onDone(acc);
+    const final = await stream.finalMessage();
+    if (final.stop_reason === 'max_tokens' || final.stop_reason === 'length') {
+      handlers.onError(new Error(
+        `Response truncated (stop_reason=${final.stop_reason}). The output hit the token limit. ` +
+        `Try increasing max_tokens in Settings or reducing the prompt length.`
+      ));
+      return;
+    }
+    handlers.onDone(acc);
```

---

## 修复涉及的文件

| 修复编号 | 文件 | 变更类型 |
|----------|------|----------|
| 2.1a | `apps/web/src/state/maxTokens.ts` | 常量 8192 → 16384 |
| 2.1b | `apps/daemon/src/server.ts` | 代理 max_tokens 回退值 8192 → 16384 |
| 2.2 | `apps/daemon/src/server.ts` | 捕获 `message_delta.stop_reason`，在 `end` 事件中传递 |
| 2.3 | `apps/web/src/providers/api-proxy.ts` | `end` 事件检查 `stopReason`，截断时调用 `onError` |
| 2.4 | `apps/web/src/providers/anthropic.ts` | `finalMessage()` 后检查 `stop_reason`，截断时调用 `onError` |

共计 4 个文件，约 30 行变更。

---

## 验证步骤

1. 使用与之前相同的测试 prompt 发起对话。
2. 确认发现阶段（Phase 1）和方向选择（Phase 2）正常完成。
3. 进入构建阶段（Phase 3）后，观察 TodoWrite 输出是否完整（不再截断于 `"Emit`）。
4. 如果 agent 的输出仍然触及 token 限制，确认前端显示的是截断错误信息（而非"已完成"）。
5. 在 Settings 中手动调高 max_tokens（如 32768），确认可正常完成长输出。

---

## 影响范围

| 影响 | 说明 |
|------|------|
| 默认 max_tokens | 8192 → 16384，对 API 调用方增加 token 消耗，但对大多数设计任务足够且必要 |
| 截断检测 | 原本被忽略的截断现在会报告为错误，提示用户调整 token 限制 |
| 其他代理路径 (OpenAI/Azure/Google) | 未修改，但同样存在类似问题，可在后续修复中统一处理 |
| 向后兼容 | `maxTokens` 过低的用户可能开始看到截断错误，需要调高配置 |
