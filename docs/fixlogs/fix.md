# 修复计划：第二轮对话 Agent 工具调用中断、过早显示成功

## 问题概述

当对话进入第二轮后，agent 在调用工具时被中断，运行被过早标记为"已成功"。

## 根因分析

根因分布在三层代码的四个位置：

| # | 文件 | 行号 | 问题 |
|---|------|------|------|
| 1 | `apps/daemon/src/server.ts` | 3895–3907 | 仅凭子进程退出码 `0` 判定 `succeeded`，忽略 `stop_reason` |
| 2 | `apps/web/src/providers/daemon.ts` | 301–305 | `end` 事件无 `status` 字段时默认回退为 `'succeeded'` |
| 3 | `apps/web/src/providers/daemon.ts` | 325–333 | 只要 `endStatus !== 'failed'` 就调用 `onDone`，不正向验证 |
| 4 | `apps/web/src/components/ProjectView.tsx` | 829–833, 1136 | `onDone` 硬编码 `runStatus: 'succeeded'`，覆盖真实状态 |

此外，第二轮对话将完整历史打平为纯文本 `## user\n...\n## assistant\n...` 格式传入 `claude -p` 非交互模式，agent 缺少第一轮的工具调用上下文，可能因此提前退出（退出码仍为 0）。

---

## 修复方案

### 修复 1：守护进程完成判定 — 引入 `stop_reason` 检查

**文件**：`apps/daemon/src/server.ts`  
**位置**：`child.on('close', ...)` 附近

**当前代码**（第 3889–3907 行）：

```typescript
child.on('error', (err) => {
  revokeToolToken('child_exit');
  unregisterChatAgentEventSink();
  send('error', createSseErrorPayload('AGENT_EXECUTION_FAILED', err.message));
  design.runs.finish(run, 'failed', 1, null);
});
child.on('close', (code, signal) => {
  revokeToolToken('child_exit');
  unregisterChatAgentEventSink();
  if (acpSession?.hasFatalError()) {
    return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
  }
  const status = run.cancelRequested
    ? 'canceled'
    : code === 0
      ? 'succeeded'
      : 'failed';
  design.runs.finish(run, status, code, signal);
});
```

**修改为**：

```typescript
// 在 startChatRun 函数作用域内，新增一个变量追踪最后的 stop_reason：
let lastStopReason = null;

// 在流解析器中捕获 stop_reason。以 claude-stream 为例（第 3849–3852 行）：
if (def.streamFormat === 'claude-stream-json') {
  const claude = createClaudeStreamHandler((ev) => {
    if (ev.type === 'usage' && ev.stopReason) {
      lastStopReason = ev.stopReason;
    }
    send('agent', ev);
  });
  child.stdout.on('data', (chunk) => claude.feed(chunk));
  child.on('close', () => claude.flush());
}

// 同样，在其他流格式（copilot-stream-json、json-event-stream 等）中
// 也捕获 lastStopReason

// 修改 close 处理器：
child.on('close', (code, signal) => {
  revokeToolToken('child_exit');
  unregisterChatAgentEventSink();
  if (acpSession?.hasFatalError()) {
    return design.runs.finish(run, 'failed', code ?? 1, signal ?? null);
  }
  if (run.cancelRequested) {
    return design.runs.finish(run, 'canceled', code, signal);
  }
  // 非零退出码 → 明确失败
  if (code !== 0) {
    return design.runs.finish(run, 'failed', code, signal);
  }
  // 退出码 0 但 stop_reason 指示未完成 → 仍视为失败
  //
  // 'end_turn'  : agent 在非交互模式下完成了一个回复轮次
  //               但对端到端运行而言只有一个轮次有意义；
  //               如果 agent 在调用工具的过程中返回 stop_reason='end_turn'
  //               而非处理完所有工具调用，说明它提前中止了。
  //
  // 'tool_use'  : agent 明确表示需要执行工具 ——
  //               如果进程此时退出，说明工具调用未完成。
  //
  // 'max_tokens' / 'stop_sequence' / 'refusal' : 明确的非完成终止原因。
  if (
    lastStopReason === 'end_turn' ||
    lastStopReason === 'tool_use' ||
    lastStopReason === 'max_tokens' ||
    lastStopReason === 'stop_sequence' ||
    lastStopReason === 'refusal'
  ) {
    console.warn(
      `[od] run ${run.id} exited 0 but stop_reason=${lastStopReason} — marking failed`,
    );
    return design.runs.finish(run, 'failed', code, signal);
  }
  // 退出码 0 且 stop_reason 为 'end_turn'/'stop_reason_complete' 或 null → 成功
  design.runs.finish(run, 'succeeded', code, signal);
});
```

**注意**：不同的流格式（`claude-stream-json`、`copilot-stream-json`、`json-event-stream`、`pi-rpc`、`acp-json-rpc`）以不同方式传递 `stop_reason`，需要按格式适配。

---

### 修复 2：前端 end 事件处理 — 移除默认 'succeeded' 回退

**文件**：`apps/web/src/providers/daemon.ts`  
**位置**：第 301–305 行

**当前代码**：

```typescript
if (event.event === 'end') {
  exitCode = typeof event.data.code === 'number' ? event.data.code : null;
  exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
  endStatus = isChatRunStatus(event.data.status) ? event.data.status : 'succeeded';
  onRunStatus?.(endStatus);
}
```

**修改为**：

```typescript
if (event.event === 'end') {
  exitCode = typeof event.data.code === 'number' ? event.data.code : null;
  exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
  // 不再乐观默认 succeeded。如果守护进程未发送可识别的状态，保持 null，
  // 后续在 onDone 调用之前会通过 fetchChatRunStatus 查询真实状态。
  endStatus = isChatRunStatus(event.data.status) ? event.data.status : null;
  onRunStatus?.(endStatus);
}
```

同时，修改 onDone 调用逻辑（第 325–333 行）：

**当前代码**：

```typescript
if (endStatus === 'canceled') return;

if (endStatus === 'failed' || exitSignal || (exitCode !== null && exitCode !== 0)) {
  const tail = stderrBuf.trim().slice(-400);
  handlers.onError(
    new Error(`agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${tail ? `\n${tail}` : ''}`),
  );
  return;
}
handlers.onDone(acc);
```

**修改为**：

```typescript
if (endStatus === 'canceled') return;

if (
  endStatus === 'failed' ||
  exitSignal ||
  (exitCode !== null && exitCode !== 0)
) {
  const tail = stderrBuf.trim().slice(-400);
  handlers.onError(
    new Error(
      `agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${tail ? `\n${tail}` : ''}`,
    ),
  );
  return;
}

// 只有 endStatus 明确为 'succeeded' 时才调用 onDone。
// 如果 endStatus 为 null（守护进程未发送明确状态），
// 此处不触发 onDone、也不触发 onError ——
// 外部调用方将在 endStatus === null 且重连耗尽后
// 通过 fetchChatRunStatus 获取解析后的状态。
if (endStatus === 'succeeded') {
  handlers.onDone(acc);
}
// 若 endStatus 为 null 或其他未知状态，重连循环会在 for 循环耗尽后
// 走第 312–322 行的查状态分支。
```

---

### 修复 3：ProjectView onDone — 使用实际状态，移除硬编码

**文件**：`apps/web/src/components/ProjectView.tsx`

#### 修复 3a：新建聊天的 onDone（约第 1124–1171 行）

**当前代码**：

```typescript
onDone: () => {
  textBuffer.flush();
  textBuffer.cancel();
  cancelSendTextBuffer();
  for (const ev of parser.flush()) {
    if (ev.type === 'artifact:end') {
      setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
    }
  }
  updateAssistant((prev) => ({
    ...prev,
    endedAt: Date.now(),
    runStatus: config.mode === 'api' || prev.runId ? 'succeeded' : prev.runStatus,
  }));
  // ...
},
```

**修改为**：

```typescript
onDone: () => {
  textBuffer.flush();
  textBuffer.cancel();
  cancelSendTextBuffer();
  for (const ev of parser.flush()) {
    if (ev.type === 'artifact:end') {
      setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
    }
  }
  updateAssistant((prev) => ({
    ...prev,
    endedAt: Date.now(),
    // 仅 API 模式默认 succeeded（API 模式无守护进程返回状态）。
    // daemon 模式下信任由 consumeDaemonRun 传递的 onRunStatus
    // 所设置的实际状态，不再在此处覆盖。
    runStatus: config.mode === 'api' ? 'succeeded' : prev.runStatus,
  }));
  // ...
},
```

#### 修复 3b：重连恢复的 onDone（约第 825–834 行）

**当前代码**：

```typescript
onDone: () => {
  textBuffer.flush();
  textBuffer.cancel();
  unregisterTextBuffer();
  updateMessageById(
    message.id,
    (prev) => ({ ...prev, runStatus: 'succeeded', endedAt: prev.endedAt ?? Date.now() }),
    true,
  );
  // ...
},
```

**修改为**：

```typescript
onDone: () => {
  textBuffer.flush();
  textBuffer.cancel();
  unregisterTextBuffer();
  updateMessageById(
    message.id,
    (prev) => ({
      ...prev,
      // 信任 onRunStatus 已设置的实际状态，不再硬编码 'succeeded'
      endedAt: prev.endedAt ?? Date.now(),
    }),
    true,
  );
  // ...
},
```

**注意**：`consumeDaemonRun` 在调用 `onDone` 之前会先触发 `onRunStatus(endStatus)`（第 305 行）。在修复 2 落地后，`endStatus` 只会在守护进程明确返回 `'succeeded'` 时才为该值。因此重连恢复的 `onRunStatus` 回调会先把状态写到消息上，`onDone` 只需保留 `endedAt`。

---

### 修复 4：改进 prompt 历史格式 — 为第二轮 agent 保留工具调用上下文

**文件**：`apps/web/src/providers/daemon.ts`  
**位置**：`startDaemonStream` 函数，约第 100–102 行

**当前代码**：

```typescript
const transcript = history
  .map((m) => `## ${m.role}\n${m.content.trim()}`)
  .join('\n\n');
```

**修改为**：

```typescript
const transcript = history
  .map((m) => {
    let block = `## ${m.role}\n${m.content.trim()}`;
    // 如果是 assistant 消息且包含工具调用事件，内联它们，
    // 让新的 agent 进程感知上一轮做了哪些文件操作。
    if (m.role === 'assistant' && Array.isArray(m.events) && m.events.length > 0) {
      const toolCalls = m.events
        .filter((ev) => ev.kind === 'tool_use' || ev.kind === 'tool_result')
        .map((ev) => {
          if (ev.kind === 'tool_use') {
            const name = ev.name ?? 'unknown_tool';
            const input = ev.input ? JSON.stringify(ev.input) : '{}';
            return `[Tool Call: ${name} ${input}]`;
          }
          // tool_result
          const isError = ev.isError ? ' [ERROR]' : '';
          const preview =
            typeof ev.content === 'string'
              ? ev.content.slice(0, 200)
              : JSON.stringify(ev.content ?? '').slice(0, 200);
          return `[Tool Result${isError}: ${preview}]`;
        });
      if (toolCalls.length > 0) {
        block += '\n' + toolCalls.join('\n');
      }
    }
    return block;
  })
  .join('\n\n');
```

**说明**：此修复让新的 agent 进程知道上一轮 assistant 消息中的工具调用（Write/Edit/Read 等）及其结果，避免 agent 因缺少上下文而误判任务已无需执行或提前退出。

---

## 修复依赖关系

```
修复 1（守护进程 stop_reason）  ← 最关键，阻断根因
    ↓
修复 2（前端 end 事件处理）     ← 依赖修复 1 提供准确的 status
    ↓
修复 3（ProjectView onDone）    ← 依赖修复 2 传递正确的 endStatus
    ↓
修复 4（prompt 历史格式）       ← 独立修复，改善 agent 上下文理解
```

## 验证步骤

1. **单元测试**：为 `checkPromptArgvBudget`、`stop_reason` 完成判定逻辑添加测试用例。
2. **集成测试**：在两轮对话场景中验证：
   - 第一轮 agent 使用 Write 工具创建文件。
   - 第二轮用户要求修改该文件。
   - 确认 agent 调用 Edit/Read 工具且运行不会被过早标记为 succeeded。
3. **边界测试**：
   - agent 退出码 0 + `stop_reason='end_turn'` → 应标记 `failed`。
   - agent 退出码 0 + `stop_reason='tool_use'` → 应标记 `failed`。
   - agent 退出码 1 → 应标记 `failed`。
   - 正常的 agent 完成（退出码 0 + `stop_reason='completed'` 等）→ 应标记 `succeeded`。
4. **回归测试**：运行 `pnpm guard`、`pnpm typecheck`、`pnpm -C e2e test:ui`。

## 影响范围

| 影响 | 说明 |
|------|------|
| 守护进程完成判定 | 部分原本退出码 0 但因 `stop_reason` 未完成的运行现在会标记为 `failed`，用户将在 UI 中看到错误而非误导性的"成功" |
| 前端状态渲染 | `failed` 状态的运行将正确渲染错误信息而不是空白成功状态 |
| 对话历史格式 | 第二轮及之后的 assistant 消息将包含工具调用摘要，可能使 prompt 长度轻微增加（新增的 JSON 片段通常 < 1KB） |
| API 兼容性 | `ChatRunStatus` 类型无变更，`succeeded`/`failed`/`canceled` 语义不变 |
