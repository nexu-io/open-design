# Fix Log #2 — max_tokens 截断导致工具调用不完整、误报"已完成"

**日期**：2026-05-06
**项目**：C:\Users\54322\open-design
**基于**：G:\open_design_fix\fix_2.md

---

## 修改概要

| 修复编号 | 文件 | 变更行数 | 说明 |
|----------|------|----------|------|
| 2.1a | `apps/web/src/state/maxTokens.ts` | +3 / -1 | `FALLBACK_MAX_TOKENS` 8192 → 16384 |
| 2.1b | `apps/daemon/src/server.ts` | +1 / -1 | 代理路径 max_tokens 回退值 8192 → 16384 |
| 2.2 | `apps/daemon/src/server.ts` | +5 / -2 | 捕获 `message_delta.stop_reason`，通过 `end` SSE 事件转发 |
| 2.3 | `apps/web/src/providers/api-proxy.ts` | +8 / -1 | `end` 事件检测 `stopReason` 截断 → 调 `onError` |
| 2.4 | `apps/web/src/providers/anthropic.ts` | +9 / -2 | `finalMessage()` 后检测 `stop_reason` → 截断时 `onError` |

**总计**：4 个文件，+26 / -7 行

---

## 详细修改

### 修复 2.1a：提升前端 FALLBACK_MAX_TOKENS

**文件**：`apps/web/src/state/maxTokens.ts:13`

```diff
- export const FALLBACK_MAX_TOKENS = 8192;
+ // 16384 is enough for ~10 tool calls with Chinese content in a single turn.
+ // 8192 was too low — complex TodoWrite payloads would truncate mid-JSON.
+ export const FALLBACK_MAX_TOKENS = 16384;
```

### 修复 2.1b + 2.2：守护进程代理提升默认值 + 捕获 stop_reason

**文件**：`apps/daemon/src/server.ts:4132-4189`

```diff
  max_tokens:
-   typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
+   typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 16384,
```

```diff
  let ended = false;
+ let stopReason = null;
  await streamUpstreamSse(response, ({ event, data }) => {
    ...
+   if (event === 'message_delta' && data.delta?.stop_reason) {
+     stopReason = data.delta.stop_reason;
+     return false;
+   }
    if (event === 'content_block_delta' ...) { ... }
    if (event === 'message_stop') {
-     sse.send('end', {});
+     sse.send('end', { stopReason });
      ended = true;
      return true;
    }
  });
```

### 修复 2.3：前端 streamProxyEndpoint 检测截断

**文件**：`apps/web/src/providers/api-proxy.ts:75-84`

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

**文件**：`apps/web/src/providers/anthropic.ts:82-91`

```diff
-   await stream.finalMessage();
-   handlers.onDone(acc);
+   const final = await stream.finalMessage();
+   if (final.stop_reason === 'max_tokens' || final.stop_reason === 'length') {
+     handlers.onError(new Error(
+       `Response truncated (stop_reason=${final.stop_reason}). The output hit the token limit. ` +
+       `Try increasing max_tokens in Settings or reducing the prompt length.`
+     ));
+     return;
+   }
+   handlers.onDone(acc);
```

---

## 累计修改文件列表（含 fix_0、fix_1）

| 修复批次 | 文件 | 变更 |
|----------|------|------|
| fix_0 #1 | `apps/daemon/src/server.ts` | `lastStopReason` 追踪 + `child.on('close')` 完成判定 |
| fix_0 #2 | `apps/web/src/providers/daemon.ts` | `end` 事件默认 `null` + `onDone` 仅限 `succeeded` |
| fix_0 #3a | `apps/web/src/components/ProjectView.tsx` | 新建聊天 `onDone` 移除 `prev.runId` 强制 succeeded |
| fix_0 #3b | `apps/web/src/components/ProjectView.tsx` | 重连 `onDone` 移除硬编码 succeeded |
| fix_0 #4 | `apps/web/src/providers/daemon.ts` | transcript 内联工具调用上下文 |
| fix_1 #1.1–1.4 | `apps/daemon/src/prompts/discovery.ts` | RULE 1 防循环 + 跳过条件增强 + Phase arc |
| **fix_2 #2.1a** | **`apps/web/src/state/maxTokens.ts`** | **FALLBACK_MAX_TOKENS 8192 → 16384** |
| **fix_2 #2.1b+2.2** | **`apps/daemon/src/server.ts`** | **代理默认 16384 + 捕获 message_delta.stop_reason** |
| **fix_2 #2.3** | **`apps/web/src/providers/api-proxy.ts`** | **end 事件检测截断** |
| **fix_2 #2.4** | **`apps/web/src/providers/anthropic.ts`** | **finalMessage() 后检测截断** |

---

## 测试结果

# fix_2 test report

# 对话记录

**你2026年5月6日 15:32**

帮我设计一个配色以青色为主，橙色为点缀的健康管理手机应用，其包含拍照计算卡路里页面，包含热量缺口数据仪表，包含运动状况，包含设置于详情这几个页面。整体风格现代活泼。

**Anthropic API · deepseek-v4-pro2026年5月6日 15:32**

Got it — 青色为主、橙色点缀的健康管理App，拍照算热量 + 热量缺口仪表 + 运动 + 设置详情，现代活泼。再确认几个细节：

**?**

**Quick brief — 30 seconds**

几个细节锁定后马上开做。

已回答

**手机平台***

**iPhone (iOS)**Android两个都要 — 双平台展示

**目标用户**

**品牌情况**

**没有品牌 — 帮我定一个方向**我有品牌规范，发给你参考某个已有App的视觉风格

**确认页面数量**

就这4个页面**4个页面 + 每个做2-3种状态变体**我再补充

**App 名称（可留空让我取）**

**其他要求**

答案已发送，代理将在本次会话后续使用。

**已完成**22s

**你2026年5月6日 15:32**

[form answers — discovery]
- 手机平台: iPhone (iOS)
- 目标用户: 入门者
- 品牌情况: 没有品牌 — 帮我定一个方向
- 确认页面数量: 4个页面 + 每个做2-3种状态变体
- App 名称（可留空让我取）: light
- 其他要求: (skipped)

**Anthropic API · deepseek-v4-pro2026年5月6日 15:32**

Got it — 青色主调、橙色点缀的 iPhone 健康 App，4 页面 + 变体，名叫「light」。先选一个视觉方向，我会按方向绑定字体、间距姿势，再把配色调成你的青橙方案。

**?**

**Pick a visual direction**

没有品牌约束——从下面挑一个视觉方向。每个方向自带调色板、字体和布局姿势，你可以在下方用覆写把配色拧成青色+橙色。

已回答

**方向***

**Editorial — Monocle / FT magazineAa**飞燕环宇 · 0123
印刷杂志感。大留白、衬线大标题、米白纸+墨色+一抹暖色点缀。自信、安静、有智识。
参考： Monocle · The Financial Times Weekend · NYT Magazine · It's Nice That**现代极简 — Linear / VercelAa**飞燕环宇 · 0123
安静、精准、软件原生。系统字体、近乎灰阶、一个高饱和强调色。界面退后让内容说话。
参考： Linear · Vercel · Notion 2024 · Stripe docs**温暖柔和 — Stripe pre-2020 / HeadspaceAa**飞燕环宇 · 0123
奶白底色、柔和强调色、圆润边角。像一本有温度的产品杂志——友好但不甜腻。适合健康、生活方式类。
参考： Stripe pre-2020 · Headspace · Substack · Mercury**科技实用 — Datadog / GitHub**已选**Aa**飞燕环宇 · 0123
数据密集、等宽友好、网格感。为工程师和操作者打造——信息密度优先，氛围靠后。
参考： Datadog · GitHub · Cloudflare dashboard · Sentry**粗野实验 — Are.na / YaleAa**飞燕环宇 · 0123
大字号、可见网格、系统等宽+超大衬线。以刻意的「丑」为自信。适合艺术、独立、宣言类。
参考： Are.na · Yale Center for British Art · mschf · Read.cv

**配色覆写（可选）**

答案已发送，代理将在本次会话后续使用。

**已完成**56s

**你2026年5月6日 15:34**

[form answers — direction]
- 方向: tech-utility
- 配色覆写（可选）: (skipped)

**Anthropic API · deepseek-v4-pro2026年5月6日 15:34**

I'll build this as an interactive iPhone app prototype with a tab bar, each page cycling through 2-3 states. Cyan primary, orange accent, tech-utility data-dense posture.

先规划一下，然后开建。

<tool_call name="TodoWrite">

{"todos": [

{"content": "Read iPhone frame and any available mobile templates", "status": "in_progress"},

{"content": "Bind tech-utility palette → cyan primary + orange accent", "status": "pending"},

{"content": "Build iPhone 15 Pro shell + tab navigation (4 tabs)", "status": "pending"},

{"content": "Page 1: Camera calorie capture (3 states: ready, scanning, result)", "status": "pending"},

{"content": "Page 2: Calorie dashboard with deficit gauge (3 states: daily, meals, weekly)", "status": "pending"},

{"content": "Page 3: Exercise / activity tracker (3 states: rings, detail, weekly)", "status": "pending"},

{"content": "Page 4: Settings & profile (3 states: list, profile edit, goals)", "status": "pending"},

{"content": "Polish: transitions, state dots, tab bar icons, micro-animations", "status": "pending"},

{"content": "Self-check: contrast, hit targets, data specificity, restraint", "status": "pending"},

{"content": "Emit artifact", "status": "pending"}

]}

</tool_call>

**已完成**2m 39s

**你2026年5月6日 15:37**

继续

**Anthropic API · deepseek-v4-pro2026年5月6日 15:37**

<tool_call name="Read">

{"file_path": "C:\\Users\\54322\\open-design\\skills\\blog-post\\assets\\template.html"}

</tool_call>

<tool_call name="Bash">

{"command": "ls \"C:\\Users\\54322\\open-design\\skills\\blog-post\\\" 2>nul || echo \"not found\"", "description": "List blog-post skill structure"}

</tool_call>

<tool_call name="Bash">

{"command": "dir /b /s \"C:\\Users\\54322\\open-design\\frames\\\" 2>nul || echo \"no frames dir\"", "description": "Check if frames directory exists"}

</tool_call>

# 结论

一到</tool_call>就会中断执行，错误显示“已完成”，请诊断具体原因，并计划在对话UI中增加一个token用量可视化的接口，方便调试与知晓系统状态。
