# 修复计划 #3 — API 模式下工具调用未执行 + Token 用量可视化

## 问题诊断

### 问题 1：工具调用仅渲染为文本，从未真正执行

fix_2 解决了 max_tokens 截断问题——TodoWrite 输出现已完整。但测试揭示了更深层的架构缺陷：

**API 模式下，agent（DeepSeek）输出的工具调用（`<tool_call>` XML 块）仅被渲染为聊天文本，从未被解析和执行。**

对比两条路径：

| 能力 | daemon/CLI 模式 | API 模式（当前） |
|------|----------------|-----------------|
| 工具调用格式 | Claude Code 原生 JSONL 流 | DeepSeek XML `<tool_call>` 标签 |
| 工具执行者 | Claude Code 子进程 | **无** — 仅渲染为文本 |
| 工具结果回传 | Claude Code 内循环 | **无** — 流结束后显示"已完成" |
| 文件读写 | Claude Code 直接操作文件系统 | **无** — TodoWrite/Read/Bash 仅为文本 |

**死循环根因**：
```
User: "帮我设计..."
Agent: TodoWrite → ... → "已完成"  (tools not executed)
User: "继续"
Agent: Read → Bash → ... → "已完成"  (tools not executed)
User: "继续"
Agent: "当前技能是 blog-post..." → TodoWrite → "已完成"  (still no execution)
... 永远无法进入实际构建
```

每次用户输入"继续"，agent 会在新一轮 API 调用中尝试推进工作。但由于之前的工具调用从未产生实际效果（文件未被读取、bash 未执行、TodoWrite 未落地），agent 每次都从零开始，陷入"规划 → 尝试调用工具 → 输出被截断/忽略 → 用户继续 → 重新规划"的死循环。

### 问题 2：Token 用量不可见

当前 UI 不显示每次 API 调用的 token 消耗。用户和开发者无法：
- 知道当前对话消耗了多少 tokens
- 判断是否接近 max_tokens 限制
- 调试为什么输出被截断

---

## 修复方案

### Part A：API 模式工具调用执行循环

**核心思路**：在 API 模式的流式响应处理中，解析 `<tool_call>` XML 块，将其转为实际的工具执行请求，将结果回注到对话中，然后自动发起下一轮 API 调用。

#### 修复 3.1：从模型输出中解析 `<tool_call>` 块

**文件**：新建 `apps/web/src/providers/tool-call-parser.ts`

```typescript
// 从流式文本中检测并提取 <tool_call> XML 块
// DeepSeek 格式:
//   <tool_call name="Read">
//   {"file_path": "..."}
//   </tool_call>
//
// 返回 { name, parameters, rawXml } 数组

export interface ParsedToolCall {
  name: string;
  parameters: Record<string, unknown>;
  rawXml: string;
}

export function parseToolCalls(text: string): {
  toolCalls: ParsedToolCall[];
  remainingText: string;
}
```

#### 修复 3.2：通过守护进程端点执行工具

**文件**：新建 `apps/web/src/providers/tool-executor.ts`

```
已知可用的守护进程端点（供工具执行使用）：
  - Read:  GET /api/projects/:id/files/read?path=...
  - Write: POST /api/projects/:id/files/write  { path, content }
  - Bash:  需要守护进程暴露一个安全的 bash 执行端点

TodoWrite（虚拟工具）：
  - 不需要实际执行，只需在 UI 中渲染为待办列表卡片

工具执行流程：
  1. 前端解析 <tool_call> 块
  2. 对每个工具调用，调用对应守护进程端点
  3. 收集所有工具结果
  4. 将结果格式化为 <tool_result> XML 块
  5. 追加到对话 history 中
```

#### 修复 3.3：API 模式自动循环（Agent Loop）

**文件**：修改 `apps/web/src/providers/anthropic.ts`

```
流程变更：
  当前:  streamMessage → onDelta → finalMessage → onDone
  改为:  streamMessage → onDelta → finalMessage →
         ├─ 无 tool_call 块 → onDone (行为不变)
         └─ 有 tool_call 块 →
              ├─ 解析 tool calls
              ├─ 执行工具 → 收集结果
              ├─ 将 tool_results 追加到 history
              ├─ 重新调用 streamMessage (递归/循环)
              └─ 直到无 tool_call 或达到最大循环次数 (max 25)
```

**关键约束**：
- 最大循环次数：25 轮（防止无限循环）
- 每轮更新 UI 中的 token 计数
- 用户可随时取消（AbortController）
- 循环中每轮工具调用结果在 UI 中实时可见

#### 修复 3.4：守护进程 Bash 执行端点

**文件**：`apps/daemon/src/server.ts`

为 API 模式工具调用添加受控的 Bash 执行端点：

```typescript
// POST /api/projects/:id/bash
// Body: { command: string, cwd?: string, timeout?: number }
// 安全约束：
//   - cwd 限定在项目目录内
//   - 超时默认 30s
//   - 禁止交互式命令
//   - 输出截断为 100KB
```

#### 修复 3.5：前端工具调用渲染

**文件**：修改聊天渲染组件，将 `<tool_call>` / `<tool_result>` XML 块渲染为可折叠的工具卡片，而非原始文本。

---

### Part B：Token 用量可视化

#### 修复 3.6：从 API 响应中提取 token 用量

**文件**：修改 `apps/web/src/providers/anthropic.ts` + `api-proxy.ts`

- 从 Anthropic `finalMessage().usage` 提取 `input_tokens` / `output_tokens`
- 从代理 SSE `end` 事件中提取 `usage` 信息
- 存储到消息对象的 `usage` 字段

**守护进程代理**同步修改：在 `/api/proxy/anthropic/stream` 中捕获 `message_delta.usage` 并通过 `end` 事件转发。

#### 修复 3.7：Token 用量 UI 组件

**文件**：新建 `apps/web/src/components/TokenUsage.tsx`

功能：
- 每条 assistant 消息底部显示 token 用量（输入 / 输出 / 总计）
- 对话顶部显示累计 token 用量进度条
- 接近 max_tokens 限制时（>80%）高亮警告
- 可折叠，默认仅显示总计，展开显示明细

```
┌─────────────────────────────────┐
│ 📊 累计: 12,450 / 16,384 (76%) │  ← 进度条
├─────────────────────────────────┤
│ 系统提示:  3,200 tokens         │
│ 消息历史:  6,800 tokens         │
│ 本次输出:  2,450 tokens         │
└─────────────────────────────────┘
```

#### 修复 3.8：Settings 中的 max_tokens 配置提示

**文件**：修改 `apps/web/src/components/SettingsDialog.tsx`

在 max_tokens 设置项旁边添加当前值提示和推荐值建议：
- "简单问答：4096"
- "含工具调用的设计任务：16384+"
- "复杂多轮开发：32768+"

---

## 实施优先级

| 优先级 | 修复 | 说明 |
|--------|------|------|
| **P0** | 3.1 + 3.2 + 3.3 | 工具调用执行循环 — 核心功能 |
| **P0** | 3.5 | 工具调用渲染 — 否则用户看到原始 XML |
| **P1** | 3.4 | Bash 端点 — Read/Write 已有端点可复用 |
| **P1** | 3.6 + 3.7 | Token 可视化 — 调试必需品 |
| **P2** | 3.8 | Settings 提示 — 锦上添花 |

---

## 涉及文件

| 修复编号 | 文件 | 操作 |
|----------|------|------|
| 3.1 | `apps/web/src/providers/tool-call-parser.ts` | **新建** |
| 3.2 | `apps/web/src/providers/tool-executor.ts` | **新建** |
| 3.3 | `apps/web/src/providers/anthropic.ts` | 修改 — 添加 agent loop |
| 3.3 | `apps/web/src/providers/api-proxy.ts` | 修改 — 代理路径也需支持 |
| 3.4 | `apps/daemon/src/server.ts` | 修改 — 添加 `/api/projects/:id/bash` |
| 3.5 | `apps/web/src/components/ProjectView.tsx` | 修改 — tool_call 渲染 |
| 3.6 | `apps/web/src/providers/anthropic.ts` | 修改 — 提取 usage |
| 3.6 | `apps/daemon/src/server.ts` | 修改 — 转发 usage |
| 3.7 | `apps/web/src/components/TokenUsage.tsx` | **新建** |
| 3.8 | `apps/web/src/components/SettingsDialog.tsx` | 修改 — 提示信息 |

---

## 验证步骤

### 工具执行
1. 发起设计请求 → 确认发现阶段正常
2. 确认 TodoWrite 被解析为待办卡片（而非显示原始 JSON）
3. 确认 Read 工具实际读取了文件内容
4. 确认 Write 工具实际创建了文件到项目目录
5. 确认多轮工具调用自动循环（用户只需等待，不需反复输入"继续"）
6. 最终确认 `<artifact>` 被正确渲染

### Token 可视化
1. 每条 assistant 消息显示 token 用量
2. 累计 token 接近限制时显示警告
3. Settings 中调整 max_tokens 后生效

---

## 影响范围

| 影响 | 说明 |
|------|------|
| API 模式行为 | 工具调用从"无操作文本"变为"实际文件系统操作" |
| 用户体验 | 用户不再需要反复输入"继续"，Agent Loop 自动推进 |
| 对话延迟 | 每轮工具调用需等待 API 往返，多轮可能 30s–2min |
| 安全性 | Bash 端点需严格限制 cwd 范围，禁止危险命令 |
| 向后兼容 | 不改变 daemon/CLI 模式；API 模式无工具调用时行为不变 |
