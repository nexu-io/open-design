# Fix Log #1 — Quick Brief 发现阶段死循环修复

**日期**：2026-05-06
**项目**：C:\Users\54322\open-design
**基于**：G:\open_design_fix\fix_1.md

---

## 修改概要

| 修复编号 | 文件 | 变更行数 | 说明 |
|----------|------|----------|------|
| 1.4 | `apps/daemon/src/prompts/discovery.ts` | +7 / -1 | RULE 1 顶部新增防循环扫描指令 |
| 1.1 | `apps/daemon/src/prompts/discovery.ts` | +5 / -4 | RULE 1 标题+首段从轮次驱动改为状态驱动 |
| 1.2 | `apps/daemon/src/prompts/discovery.ts` | +12 / -6 | 跳过条件从 3 条扩充为 4 条，新增"发现已完成"主守卫 |
| 1.3 | `apps/daemon/src/prompts/discovery.ts` | +13 / -11 | Default arc 改为 Phase 1/2/3 + 不可逆约束 |

**总计**：1 文件，+24 / -13 行

---

## 详细修改

### 修复 1.4：RULE 1 顶部新增防循环扫描指令（第 36 行）

```diff
- ## RULE 1 — turn 1 must emit a `<question-form id="discovery">` (not tools, not thinking)
+ ## RULE 1 — emit a `<question-form id="discovery">` once per project (not tools, not thinking)
+
+ **Before emitting ANY `<question-form>`, first scan the entire conversation history above.**
+ If you see BOTH a previous `<question-form id="discovery">` in an assistant message AND
+ a matching user reply starting with `[form answers — discovery]`, DO NOT emit a new form —
+ discovery is finished. Skip directly to RULE 2 to process the answers, then to RULE 3 to build.
+ This guard overrides everything else below.
```

### 修复 1.1：RULE 1 首段改为状态驱动（第 38 行）

```diff
- When the user opens a new project or sends a fresh design brief, your **very first output**
+ When the user opens a new project or sends a fresh design brief, and the conversation does NOT
+ already contain a completed discovery cycle, your **very first output**
  is one short prose line + a `<question-form>` block.
```

### 修复 1.2：增强跳过条件（第 76-86 行）

原 3 条 skip 条件 → 改为 4 条编号条件，新增条件 1 为主守卫：

1. **Discovery already completed (primary guard)** — 历史中已存在发现表单 + 表单答案 → 禁止重新发出
2. **Current message is form answers** — 最新消息以 `[form answers — …]` 开头（原第 3 条）
3. **Active design tweak** — 设计调整消息（原第 1 条）
4. **Explicit skip** — 用户明确要求跳过（原第 2 条）

跳过分流：条件 1/2 → RULE 2 → RULE 3；条件 3/4 → 直接 RULE 3。

### 修复 1.3：Default arc → Workflow arc（第 262-274 行）

完整重写结尾 recap 段：
- "Turn 1/2/3" → "Phase 1/2/3"
- 新增 "the same project may span many API calls; phases are irreversible"
- 新增 "do not go backwards" 约束段
- 新增循环检测告警："If you find yourself about to emit a discovery form but the conversation already contains one with matching answers, STOP — you are about to create a loop."

---

## 累计修改文件列表（含 fix_0）

| 修复批次 | 文件 | 变更 |
|----------|------|------|
| fix_0 #1 | `apps/daemon/src/server.ts` | `lastStopReason` 追踪 + `child.on('close')` 完成判定 |
| fix_0 #2 | `apps/web/src/providers/daemon.ts` | `end` 事件默认 `null` + `onDone` 仅限 `succeeded` |
| fix_0 #3a | `apps/web/src/components/ProjectView.tsx` | 新建聊天 `onDone` 移除 `prev.runId` 强制 succeeded |
| fix_0 #3b | `apps/web/src/components/ProjectView.tsx` | 重连 `onDone` 移除硬编码 succeeded |
| fix_0 #4 | `apps/web/src/providers/daemon.ts` | transcript 内联工具调用上下文 |
| **fix_1 #1.1–1.4** | **`apps/daemon/src/prompts/discovery.ts`** | **RULE 1 防循环 + 跳过条件增强 + Phase arc** |

---

## 测试结果

# fix_1 test report

# 对话记录

你
6 分钟前
帮我设计一个配色以青色为主，橙色为点缀的健康管理手机应用，其包含拍照计算卡路里页面，包含热量缺口数据仪表，包含运动状况，包含设置于详情这几个页面。整体风格现代活泼。
Anthropic API · deepseek-v4-pro
6 分钟前
Got it — 健康管理手机应用，4 个核心页面，青色为主 + 橙色点缀，现代活泼。再确认几个细节：
Quick brief — 30 seconds
I'll lock these in before building. You've already covered the big ones — just a few more.
已回答
Who is the primary user?
￼
视觉方向
*
我指定的青色+橙色就够了，你帮我定整体方向
我有一个参考app或截图，稍后贴给你
App 名称？
light
拍照计算卡路里 — 是拍照后AI自动识别，还是需要用户手动确认/修正？
AI 自动识别 + 用户可手动修正
纯手动输入，拍照只是辅助记录
不确定，你帮我设计合理的流程
底部导航结构偏好？
标准 4 个 tab（拍照 / 仪表 / 运动 / 我的）
3 个 tab + 拍照用中间大按钮突出（类似 Instagram）
你帮我定
其他要求或参考？
￼
答案已发送，代理将在本次会话后续使用。
已完成
40s
你
3 分钟前
[form answers — discovery]

- Who is the primary user?: (skipped)
- 视觉方向: 我指定的青色+橙色就够了，你帮我定整体方向
- App 名称？: light
- 拍照计算卡路里 — 是拍照后AI自动识别，还是需要用户手动确认/修正？: AI 自动识别 + 用户可手动修正
- 底部导航结构偏好？: 3 个 tab + 拍照用中间大按钮突出（类似 Instagram）
- 其他要求或参考？: (skipped)
Anthropic API · deepseek-v4-pro
3 分钟前
好的，青色为主 + 橙色点缀已记住。接下来选一个视觉姿态 — 这决定的是气质（圆角还是直角、留白节奏、字体性格），颜色我会按你说的调。
Pick a visual direction
青色+橙色已锁定。下面选的是视觉姿态 — 它决定圆角/直角、留白密度、字体性格。
已回答
Direction
- 

Modern minimal — Linear / Vercel 风
安静、精确、软件原生。系统字体，近乎灰阶的底色，青色大面积铺陈，橙色仅用于关键CTA。界面消失，内容浮出。适合追求「不打扰」的工具型产品。
参考： Linear · Vercel · Notion 2024 · Stripe docs
Warm & soft — Headspace / 轻芒风
奶白底、柔和圆角、青色如薄荷般清新，橙色如柑橘般温暖。像一本贴心的健康手帐 — 亲切但不幼稚。适合注重「情绪价值」的健康产品。
参考： Headspace · Stripe pre-2020 · Substack · Mercury
Tech / utility — WHOOP / Gentler Streak 风
已选
数据密集、等宽数字、深底或浅底+网格。青色用于数据高亮，橙色用于警示阈值。信息密度高但不杂乱 — 为「认真追踪每一卡」的用户设计。
参考： WHOOP · Gentler Streak · Datadog · GitHub
Editorial — Monocle / 杂志风
杂志排版感。大标题、宽裕留白、衬线标题+无衬线正文。青色做低调底色，橙色仅用于一处点缀。自信、安静、有品味。适合定位「生活方式」而非工具的健康app。
参考： Monocle · FT Weekend · NYT Magazine
Brutalist / 实验风 — [Are.na](http://are.na/) / [Read.cv](http://read.cv/) 风
大声的字体、可见的网格、等宽正文+超大衬线标题。青色和橙色用在高对比度碰撞中。故意「不漂亮」即是自信。适合独立开发者、艺术向健康产品。
参考： [Are.na](http://are.na/) · [Read.cv](http://read.cv/) · mschf
对青色/橙色有更具体的偏好吗？（可选）
青色很多，橙色仅仅作为点缀
答案已发送，代理将在本次会话后续使用。
已完成
1m 14s
你
1 分钟前
[form answers — direction]

- Direction: tech-utility
- 对青色/橙色有更具体的偏好吗？（可选）: 青色很多，橙色仅仅作为点缀
Anthropic API · deepseek-v4-pro
1 分钟前
方向锁定 — Tech / utility，青色为主铺陈，橙色仅做阈值警示，等宽数字 + 数据密度。
先读取技能资产，然后上 Todo 开工。
<tool_calls>
<invoke name="TodoWrite">
<parameter name="todos" string="true">[{"content": "Read [DESIGN.md](http://design.md/) + skill assets (template.html, [layouts.md](http://layouts.md/))", "status": "in_progress", "activeForm": "Reading [DESIGN.md](http://design.md/) + skill assets"}, {"content": "Adapt tech-utility palette: cyan-dominant + orange minimal accent", "status": "pending", "activeForm": "Adapting tech-utility palette"}, {"content": "Plan 4 screens (仪表/运动/拍照/设置) + 3-tab + center camera nav", "status": "pending", "activeForm": "Planning screen architecture"}, {"content": "Build index.html with iPhone frame + working tab navigation", "status": "pending", "activeForm": "Building iPhone frame + navigation shell"}, {"content": "Design Screen 1 — 热量缺口数据仪表 (Dashboard)", "status": "pending", "activeForm": "Designing calorie deficit dashboard"}, {"content": "Design Screen 2 — 运动状况 (Exercise status)", "status": "pending", "activeForm": "Designing exercise status screen"}, {"content": "Design Screen 3 — 拍照计算卡路里 (Photo calorie capture)", "status": "pending", "activeForm": "Designing photo calorie screen"}, {"content": "Design Screen 4 — 设置与详情 (Settings & details)", "status": "pending", "activeForm": "Designing settings screen"}, {"content": "Self-check: checklist + 5-dim critique", "status": "pending", "activeForm": "Running checklist and critique"}, {"content": "Emit
已完成
44s
你
刚刚
继续
Anthropic API · deepseek-v4-pro
刚刚
<tool_calls>
<invoke name="Read">
<parameter name="file_path" string="true">.od-skills/blog-post/assets/template.html</parameter>
</invoke>
<invoke name="Read">
<parameter name="file_path" string="true">.od-skills/blog-post/references/layouts.md</parameter>
</invoke>
<invoke name="Bash">
<parameter name="command" string="true">ls -la .od-skills/ 2>/dev/null; ls -la .md DESIGN. design.* 2>/dev/null; echo "---"; find . -name "[DESIGN.md](http://design.md/)" -o -name "template.html" -o -name "[layouts.md](http://layouts.md/)" 2>/dev/null | head -20</parameter>
</invoke>
</tool_calls>
已完成
16s
你
刚刚
继续
Anthropic API · deepseek-v4-pro
刚刚
当前技能是 blog-post，但实际需要的是 手机应用原型。我直接按移动端原型来建，用 iPhone 15 Pro 框架 + 四个页面。
<tool_calls>
<invoke name="TodoWrite">
<parameter name="todos" string="true">[{"activeForm": "Reading [DESIGN.md](http://design.md/) + available assets", "content": "Read [DESIGN.md](http://design.md/) + find available mobile frames", "status": "in_progress"}, {"activeForm": "Adapting tech-utility palette", "content": "Adapt tech-utility palette: cyan-dominant + orange minimal accent", "status": "pending"}, {"activeForm": "Planning 4-screen architecture", "content": "Plan 4 screens + 3-tab + center camera nav architecture", "status": "pending"}, {"activeForm": "Building iPhone frame + shared CSS", "content": "Build index.html with iPhone frame + shared design tokens + nav shell", "status": "pending"}, {"activeForm": "Building calorie deficit dashboard", "content": "Screen 1 — 热量缺口数据仪表 (calorie deficit dashboard)", "status": "pending"}, {"activeForm": "Building exercise status screen", "content": "Screen 2 — 运动状况 (exercise status)", "status": "pending"}, {"activeForm": "Building photo calorie screen", "content": "Screen 3 — 拍照计算卡路里 (photo calorie capture + AI result)", "status": "pending"}, {"activeForm": "Building settings & details screen", "content": "Screen 4 — 设置与详情 (settings & details)", "status": "pending"}, {"activeForm": "Running checklist and critique", "content": "Self-check: checklist + 5-dim critique", "status": "pending"}, {"activeForm": "Emitting artifact", "content": "Emit

# 结论

每次出现

</invoke>
</tool_calls>

或者

{"activeForm": "Emitting artifact", "content": "Emit

就会输出“已完成”，实际上根本没有开始工作。
