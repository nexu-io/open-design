# 修复计划 #1 — Quick Brief 发现阶段死循环

## 问题描述

经过 fix_0 后，第一轮对话已能正常完成。但在多轮对话中，agent 陷入 "Quick brief" 发现阶段的死循环：每轮都重复询问相同的发现性问题（品牌方向、页面动效、展示方式等），无法进入实际构建阶段（RULE 3 TodoWrite）。

**典型日志模式**：
```
User → "帮我设计..."
Agent → 1行文案 + <question-form id="discovery"> (Turn 1 ✓)
User → [form answers — discovery]
Agent → "Answers sent...Done" + AGAIN <question-form id="discovery"> (BUG!)
User → [form answers — discovery] (changed answers)
Agent → "直接开始构建" + AGAIN <question-form id="discovery"> (BUG!)
... 无限循环
```

---

## 根因分析

### 根因 1：RULE 1 是基于"轮次编号"的，而非"状态"

**文件**：`apps/daemon/src/prompts/discovery.ts:34`

```
## RULE 1 — turn 1 must emit a `<question-form id="discovery">`
```

在 API 模式下，每次 `/api/chat` 调用都是一个独立的无状态请求。系统提示词始终以 "RULE 1" 开头，agent 无法区分"全新项目的第 1 轮"和"已有完整对话历史的第 N 轮"。agent 看到规则 "turn 1 must emit discovery form" 后倾向于认为当前就是 turn 1。

### 根因 2：缺少"发现阶段已完成"的显式防循环守卫

当前跳过条件（第 74-77 行）：

```
**Only** skip the form in these narrow cases:
- The user is replying *inside an active design* with a tweak
- The user explicitly says "skip questions" / "just build" / "no questions, go"
- The user's message starts with `[form answers — …]`
```

这三个条件存在缺陷：
- "inside an active design with a tweak" 表述模糊，agent 无法可靠判断
- 第三条仅在**当前消息**以 `[form answers — …]` 开头时生效，但如果用户在提交表单答案后又发了一条普通消息，该条件不匹配
- 缺少关键条件："对话历史中已经包含发现表单和表单答案 → 禁止再次发出发现表单"

### 根因 3：自强化循环——agent 从历史中学习错误模式

当第二轮 agent 在确认答案后**同时**重新发出发现表单时，这条混合输出成为对话历史的一部分。第三轮 API 调用时，新 agent 看到历史中：
1. 用户提交了表单答案
2. 上一个 assistant 重新发出了表单

agent 学会这个模式并继续复制，形成自强化死循环。

### 根因 4：默认弧线（recap）强化了固定轮次思维

```
## Default arc (recap)
- **Turn 1** — short prose line + `<question-form id="discovery">` + stop.
- **Turn 2** — branch on `brand`...
- **Turn 3+** — work the plan...
```

这段 recap 以"Turn N"的格式描述流程，暗示 agent 应该按轮次顺序执行。在 API 模式下，每次请求都被视为新的 Turn 1，recap 强化了"该发发现表单了"的认知。

---

## 修复方案

所有修改集中在 **`apps/daemon/src/prompts/discovery.ts`**。

### 修复 1.1：将 RULE 1 从"轮次驱动"改为"状态驱动"

**当前代码**（第 34 行）：

```
## RULE 1 — turn 1 must emit a `<question-form id="discovery">` (not tools, not thinking)

When the user opens a new project or sends a fresh design brief, your **very first output** is one short prose line + a `<question-form>` block. Nothing else. No file reads. No Bash. No TodoWrite. No extended thinking. The form is your time-to-first-byte.
```

**修改为**：

```
## RULE 1 — emit a `<question-form id="discovery">` once per project (not tools, not thinking)

When the user opens a new project or sends a fresh design brief, and this conversation does NOT already contain a completed discovery cycle (a `<question-form id="discovery">` block followed by a user reply starting with `[form answers — discovery]`), your **very first output** is one short prose line + a `<question-form>` block.

**Anti-loop guard — this is the most critical rule in the entire prompt:**
If the conversation history already contains BOTH:
  a) an assistant message with `<question-form id="discovery">`, AND
  b) a user message starting with `[form answers — discovery]`
then the discovery phase is COMPLETE. Do NOT emit another discovery form under any circumstance. Skip directly to RULE 2 to process the answers, then to RULE 3 to build.

Nothing else. No file reads. No Bash. No TodoWrite. No extended thinking. The form is your time-to-first-byte.
```

### 修复 1.2：增强跳过条件——新增"历史已包含发现完成"条件

**当前代码**（第 74-77 行）：

```
**Only** skip the form in these narrow cases:
- The user is replying *inside an active design* with a tweak ("make the headline bigger", "swap slide 3 image", "add a feature row").
- The user explicitly says "skip questions" / "just build" / "no questions, go".
- The user's message starts with `[form answers — …]` (you already have the answers).

When skipping, jump straight to RULE 3.
```

**修改为**：

```
**Only** skip the form in these cases (any single one is sufficient):

1. **Discovery already completed (primary guard):** The conversation history already contains both a `<question-form id="discovery">` in an assistant message AND a user message starting with `[form answers — discovery]`. Once discovery is done, it stays done — never re-emit the form.

2. **Current message is form answers:** The user's latest message starts with `[form answers — …]`. Process the answers per RULE 2, do not re-ask.

3. **Active design tweak:** The user is replying *inside an active design* with a specific tweak ("make the headline bigger", "swap slide 3 image", "add a feature row").

4. **Explicit skip:** The user explicitly says "skip questions" / "just build" / "no questions, go".

When skipping because of condition 1 or 2, process the existing form answers per RULE 2, then jump to RULE 3. When skipping because of condition 3 or 4, jump straight to RULE 3.
```

### 修复 1.3：重写默认弧线 — 移除 Turn 编号语言

**当前代码**（第 255-263 行）：

```
## Default arc (recap)

- **Turn 1** — short prose line + `<question-form id="discovery">` + stop.
- **Turn 2** — branch on `brand`:
  - "Pick a direction for me" → emit `<question-form id="direction">` + stop.
  - "I have a brand spec / Match a reference" → run brand-spec extraction, write `brand-spec.md`, then TodoWrite.
  - else → TodoWrite directly.
- **Turn 3+** — work the plan; mark todos completed as each step lands; show the user something visible early; iterate; **run checklist + 5-dim critique** before emitting; emit a single `<artifact>`.
```

**修改为**：

```
## Workflow arc (state-based — not turn-based — the same project may span many API calls)

- **Phase 1 — Discovery (run once):** If no discovery form has been completed yet → short prose line + `<question-form id="discovery">` + stop. Do not proceed past this step until the user replies with `[form answers — discovery]`.

- **Phase 2 — Direction / brand binding (run once):** After receiving `[form answers — discovery]`, check the `brand` field:
  - "Pick a direction for me" → emit `<question-form id="direction">` + stop.
  - "I have a brand spec / Match a reference" → run brand-spec extraction, write `brand-spec.md`, then TodoWrite.
  - else → TodoWrite directly.

- **Phase 3 — Build (all subsequent work):** Work the plan; mark todos completed as each step lands; show the user something visible early; iterate; **run checklist + 5-dim critique** before emitting; emit a single `<artifact>`.

**Critical: do not go backwards.** Once Phase 1 is complete, never return to it. Once Phase 2 is complete, never return to it. Moving from Phase 2 to Phase 3 is irreversible for this project.
```

### 修复 1.4：在 RULE 1 的首句添加强化指令

在 RULE 1 开头、"When the user opens..." 之前，插入一行强化指令：

```
Before emitting ANY `<question-form>`, first scan the entire conversation history above. If you see BOTH a previous `<question-form id="discovery">` AND its matching `[form answers — discovery]` reply, DO NOT emit a new form — discovery is finished. Go directly to RULE 2.
```

这行指令放在 RULE 1 的最顶部，确保 agent 在决定是否发出表单之前，先检查对话历史。

---

## 修复涉及的单一文件

| 文件 | 修复点 | 变更类型 |
|------|--------|----------|
| `apps/daemon/src/prompts/discovery.ts` | RULE 1 开头添加防循环扫描指令 | 新增 3 行 |
| `apps/daemon/src/prompts/discovery.ts` | RULE 1 标题和首段改为状态驱动 | 修改约 5 行 |
| `apps/daemon/src/prompts/discovery.ts` | 跳过条件增强为 4 条（新增第 1 条"历史已完成"） | 修改约 15 行 |
| `apps/daemon/src/prompts/discovery.ts` | Default arc (recap) 改为 Phase 1/2/3 + 不可逆约束 | 重写约 15 行 |

共计修改约 40 行，全部在 `discovery.ts` 一个文件中。

---

## 验证步骤

1. 使用与 fix_0 测试相同的 prompt 重新测试：
   ```
   帮我设计一个配色以青色为主，橙色为点缀的健康管理手机应用...
   ```
2. 确认 agent 在 Turn 1 发出发现表单。
3. 提交 `[form answers — discovery]` 后，确认 agent **不再**重新发出发现表单，而是进入 RULE 2（品牌分支）/ RULE 3（TodoWrite 开始构建）。
4. 在多轮测试中反复提交不同答案，确认循环已被打破。
5. 额外测试：在提交发现表单后发送一条普通消息（不含 `[form answers — …]` 前缀），确认 agent 不会重新发出发现表单。

---

## 影响范围

| 影响 | 说明 |
|------|------|
| 系统提示词长度 | 增加约 30 行（~1500 字符），对上下文窗口影响可忽略 |
| 向后兼容 | 不改变表单 XML 格式、RULE 2 分支逻辑、RULE 3 构建流程 |
| 其他 agent 行为 | 修复仅影响发现阶段的循环控制，不影响构建、检查清单、批评等后续流程 |
| daemon CLI 模式 | daemon 模式也使用同一系统提示词，同样受益于防循环改进 |
