#!/usr/bin/env node
// Scaffold one Open Design skill per upstream html-ppt full-deck template.
//
// Each generated `skills/html-ppt-<name>/SKILL.md` ships only frontmatter +
// a short body. Authoring guidance, layouts, themes, and animations live in
// the master `skills/html-ppt/` skill — these wrappers only exist so each
// template surfaces as its own card in the Examples gallery and so the
// "Use this prompt" flow can prefill `mode=deck`, scenario, and the right
// example_prompt.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, 'skills');
const UPSTREAM_URL = 'https://github.com/lewislulu/html-ppt-skill';

// `featured` is a sort priority used by the Examples gallery — smaller wins
// the tie-break, so a curated handful float to the top. Templates without
// `featured` slot in alphabetically after the existing skills.
const TEMPLATES = [
  {
    slug: 'pitch-deck',
    name: 'html-ppt-pitch-deck',
    title: 'HTML PPT · Pitch Deck',
    scenario: 'finance',
    featured: 20,
    description:
      'Investor-ready 10-slide HTML pitch deck — white + blue→purple gradient hero, big numbers, traction bar chart, $4.5M-style ask page. Use when the user wants a fundraising deck, seed-round pitch, or VC meeting slides.',
    triggers: ['pitch deck', 'pitch', 'fundraising', 'seed round', 'investor deck', 'vc deck', 'pitch slides'],
    examplePrompt:
      'Build a 10-slide pitch deck in HTML for my seed round. Use the html-ppt-pitch-deck full-deck template (white + blue→purple gradient, traction bars, $X.XM ask). Confirm three things first: (1) name + one-line pitch, (2) key traction numbers, (3) ask + use of funds.',
  },
  {
    slug: 'product-launch',
    name: 'html-ppt-product-launch',
    title: 'HTML PPT · Product Launch',
    scenario: 'marketing',
    featured: 21,
    description:
      'Launch keynote deck — dark hero + light content, warm orange→peach accent, feature cards, pricing tiers, CTA. Use when announcing a product, launching a feature, or doing a keynote-style reveal.',
    triggers: ['product launch', 'keynote', 'launch deck', 'feature reveal', 'launch slides', '发布会'],
    examplePrompt:
      'Make a product-launch keynote deck in HTML using the html-ppt-product-launch full-deck template (dark hero, warm orange accent, feature cards, pricing tiers). Confirm: product name + tagline, the 3 key features, and pricing tiers — then write the deck.',
  },
  {
    slug: 'tech-sharing',
    name: 'html-ppt-tech-sharing',
    title: 'HTML PPT · Tech Sharing',
    scenario: 'engineering',
    featured: 22,
    description:
      'Conference / internal tech-talk deck — GitHub-dark, JetBrains Mono, terminal code blocks, agenda + Q&A pages. Use for engineering presentations, internal sharing sessions, conference talks, and code-heavy walkthroughs.',
    triggers: ['tech sharing', 'tech talk', '技术分享', 'engineering talk', 'conference talk', 'dev talk'],
    examplePrompt:
      '帮我用 html-ppt-tech-sharing 模板做一份 8 页的技术分享 PPT。先确认：分享主题、目标听众（同事 / 社区 / 客户）、要不要包含代码片段和 benchmark。GitHub 暗色主题 + JetBrains Mono，agenda + Q&A 页备好。',
  },
  {
    slug: 'weekly-report',
    name: 'html-ppt-weekly-report',
    title: 'HTML PPT · Weekly Report',
    scenario: 'operations',
    featured: 23,
    description:
      'Team weekly / status-update deck — corporate clarity, 8-cell KPI grid, shipped list, 8-week bar chart, next-week table. Use for 周报, business reviews, team status updates, and exec dashboards.',
    triggers: ['weekly report', '周报', 'status update', 'team report', 'business review', 'wbr'],
    examplePrompt:
      '用 html-ppt-weekly-report 模板生成一份周报（7 页）。先问我四件事：本周时间范围、3-5 个核心 KPI 数字、本周已发布 / 已完成的事项、下周计划与风险。然后用模板填好 8 周柱状图和下周表格。',
  },
  {
    slug: 'xhs-post',
    name: 'html-ppt-xhs-post',
    title: 'HTML PPT · 小红书 图文',
    scenario: 'marketing',
    featured: 24,
    description:
      '小红书 / Instagram 风 9 页 3:4 竖版图文（810×1080）— 暖色 pastel、虚线 sticker 卡片、底部页码点点。用于发小红书图文、Instagram carousel、品牌种草内容。',
    triggers: ['小红书', 'xhs', 'xhs post', 'xiaohongshu', '图文', 'instagram carousel', '种草'],
    examplePrompt:
      '帮我用 html-ppt-xhs-post 模板做一组 9 张小红书图文（3:4 竖版，810×1080）。先告诉我主题，然后帮我把封面 + 7 页内容 + 结尾 CTA 排好，每页一句标题 + 一段正文 + 关键词 sticker。',
  },
  {
    slug: 'course-module',
    name: 'html-ppt-course-module',
    title: 'HTML PPT · Course Module',
    scenario: 'education',
    featured: 25,
    description:
      'Online-course / workshop module deck — warm paper background + Playfair serif, persistent left sidebar of learning objectives, MCQ self-check page. Use for teaching modules, training materials, workshop slides.',
    triggers: ['course module', 'course slides', 'workshop', 'training deck', 'lesson', '教学', '课件'],
    examplePrompt:
      'Use the html-ppt-course-module template to build a 7-slide module deck. Confirm: module title, 3-5 learning objectives (these stick on the left rail), and the MCQ self-check question. Then assemble the deck with serif headings on warm paper.',
  },
  {
    slug: 'presenter-mode-reveal',
    name: 'html-ppt-presenter-mode',
    title: 'HTML PPT · Presenter Mode (演讲者模式)',
    scenario: 'engineering',
    featured: 26,
    description:
      '演讲者模式专用 deck — tokyo-night 默认主题，5 套主题 T 键切换，每页带 150-300 字逐字稿示例（<aside class="notes">），按 S 打开 popup（CURRENT / NEXT / SCRIPT / TIMER 四张磁吸卡片）。用于技术分享、公开演讲、课程讲解，怕忘词或要提词器的场景。',
    triggers: ['presenter mode', '演讲者模式', '逐字稿', 'speaker notes', '提词器', 'presenter view', '演讲'],
    examplePrompt:
      '用 html-ppt-presenter-mode 模板做一份带逐字稿的演讲 PPT。先确认：演讲主题、时长（每页 2-3 分钟）、目标听众。然后帮我每页写 150-300 字的口语化逐字稿（不是讲稿，是提示信号），按 S 能打开 presenter 弹窗。',
  },
  {
    slug: 'xhs-white-editorial',
    name: 'html-ppt-xhs-white-editorial',
    title: 'HTML PPT · 白底杂志风',
    scenario: 'marketing',
    featured: 27,
    description:
      '白底杂志风 deck — 纯白背景 + 顶部 10 色彩虹 bar、80-110px display 标题、紫→蓝→绿→橙→粉渐变文字、马卡龙软卡片组（粉/紫/蓝/绿/橙）、黑底白字 .focus pill、引用大块。同时适合发小红书图文 + 横版 PPT 双用。',
    triggers: ['白底杂志', '杂志风', 'xhs editorial', 'white editorial', '小红书白底', 'editorial deck'],
    examplePrompt:
      '用 html-ppt-xhs-white-editorial 模板做一份白底杂志风 PPT，中文优先。要点：80-110px display 大标题、彩虹顶部 bar、马卡龙软卡片、黑底白字 .focus pill。先告诉我主题和受众，再写 8-12 页。',
  },
  {
    slug: 'graphify-dark-graph',
    name: 'html-ppt-graphify-dark-graph',
    title: 'HTML PPT · 暗底知识图谱',
    scenario: 'engineering',
    featured: 28,
    description:
      '暗底知识图谱 deck — #06060c→#0e1020 深夜渐变 + 漂浮 blur orbs、封面 SVG 力导向图谱、彩虹渐变标题、JetBrains Mono 命令行高亮、glass-morphism 卡片。适合 dev-tool / CLI / 知识图谱 / 数据可视化的发布会，"AI-native + 科幻 + 暖色" 调子。',
    triggers: ['知识图谱', 'graph deck', 'dark graph', 'dev tool launch', 'cli launch', 'data viz launch'],
    examplePrompt:
      '用 html-ppt-graphify-dark-graph 模板做一份 dev-tool 发布会 PPT。深夜渐变背景 + 力导向图谱封面 + 彩虹标题 + JetBrains Mono 命令行。先确认：工具名、核心能力、demo 步骤；要不要现场敲 CLI。',
  },
  {
    slug: 'knowledge-arch-blueprint',
    name: 'html-ppt-knowledge-arch-blueprint',
    title: 'HTML PPT · 奶油蓝图架构',
    scenario: 'engineering',
    featured: 29,
    description:
      '奶油蓝图架构 deck — 奶油纸 #F0EAE0 底色 + 单一锈红 #B5392A 高亮、48px 蓝图网格 mask、2px 黑边硬卡片、pipeline 步骤盒（其中一个抬高）、右侧锈红 insight callout、Playfair 衬线大字、SVG 虚线反馈环。零渐变零软阴影，认真且印刷友好。',
    triggers: ['architecture', 'blueprint', 'system design', '架构图', 'data flow', 'engineering whitepaper'],
    examplePrompt:
      '用 html-ppt-knowledge-arch-blueprint 模板做一份系统架构介绍 PPT。奶油纸底 + 锈红高亮 + 蓝图网格 + pipeline 抬高一格 + 衬线大字。先告诉我系统名 + 5-7 个核心模块 + 数据流方向，再写 8-10 页。',
  },
  {
    slug: 'hermes-cyber-terminal',
    name: 'html-ppt-hermes-cyber-terminal',
    title: 'HTML PPT · 暗终端测评',
    scenario: 'engineering',
    featured: 30,
    description:
      '暗终端 honest-review deck — #0a0c10 黑底 + 56px 赛博网格 + CRT 暗角 + 扫描线、窗口红绿灯 chrome、`$ prompt` 命令行标题、薄荷绿 #7ed3a4 大字、JetBrains Mono、stroke-only 柱状图、blinking 光标、琥珀/绿/红三档 tag、暗色代码块。适合 CLI / agent / dev tool 测评（含 trace、diff、benchmark）。',
    triggers: ['terminal review', 'cli review', 'agent review', 'honest review', 'dev tool review', '测评'],
    examplePrompt:
      '用 html-ppt-hermes-cyber-terminal 模板做一份 CLI / agent 测评 PPT。深色终端风 + scanlines + 命令行标题 + benchmark 柱状图。先确认：被测评对象、3-5 个对比维度、benchmark 数据。',
  },
  {
    slug: 'obsidian-claude-gradient',
    name: 'html-ppt-obsidian-claude-gradient',
    title: 'HTML PPT · GitHub 暗紫渐变',
    scenario: 'engineering',
    featured: 31,
    description:
      'GitHub 暗紫渐变 deck — GitHub-dark #0d1117 + 紫蓝 radial 环境光 + 60px 网格 mask、居中布局、紫色 pill 标签、三色渐变标题（#a855f7→#60a5fa→#34d399）、GitHub 风代码 palette、紫色左边框高亮块。适合开发者工作流 / MCP / Agent / dev tool 教程，类似 GitHub Blog / Linear Changelog。',
    triggers: ['github dark', 'developer tutorial', 'mcp tutorial', 'agent tutorial', 'dev workflow', 'changelog deck'],
    examplePrompt:
      '用 html-ppt-obsidian-claude-gradient 模板做一份开发者教程 PPT。GitHub 暗紫渐变 + 居中布局 + 紫色 pill + 三色渐变标题 + 配置/步骤代码块。先确认：教什么、目标受众、要不要 MCP/Agent 配置示例。',
  },
  {
    slug: 'testing-safety-alert',
    name: 'html-ppt-testing-safety-alert',
    title: 'HTML PPT · 红琥珀警示',
    scenario: 'engineering',
    featured: 32,
    description:
      '红琥珀警示 deck — 顶/底 45° 红黑 hazard 条纹、红色删除线否定标题、L1/L2/L3 绿/琥珀/红 tier 卡片、圆点状态 alert box、policy-yaml 代码块（红左边框 + bad 关键词高亮）、红绿 checklist、Q1 事故堆叠柱状图。适合安全 / 风险 / 事故复盘 / 红队 / 上线前 AI 评审 / policy-as-code。',
    triggers: ['safety alert', 'incident', 'red team', 'risk review', '事故复盘', '安全评审', 'policy as code'],
    examplePrompt:
      '用 html-ppt-testing-safety-alert 模板做一份事故复盘 / 安全评审 PPT。红黑 hazard 条 + 红色删除线 + L1/L2/L3 tier 卡片 + policy-yaml 代码块。先告诉我事件时间线、根因、影响范围。',
  },
  {
    slug: 'xhs-pastel-card',
    name: 'html-ppt-xhs-pastel-card',
    title: 'HTML PPT · 柔和马卡龙慢生活',
    scenario: 'personal',
    featured: 33,
    description:
      '柔和马卡龙慢生活 deck — 奶油 #fef8f1 底 + 三个柔光 blob、Playfair 斜体衬线 display 标题混 sans 正文、28px 圆角马卡龙卡片（桃 / 薄荷 / 天 / 紫 / 柠 / 玫）、Playfair 斜体 01-04 序号、SVG donut 图、chip+page 顶栏。适合生活方式 / 个人成长 / 慢生活 / 情绪类内容，"杂志、手作、不太科技"的感觉。',
    triggers: ['pastel', 'macaron', 'lifestyle', 'slow living', '慢生活', '生活方式', '个人成长'],
    examplePrompt:
      '用 html-ppt-xhs-pastel-card 模板做一份慢生活主题图文。奶油底 + 马卡龙圆角卡片 + Playfair 斜体序号 + donut 图。先告诉我主题（休息 / 暂停 / 自我照顾…）和 5-7 个想说的点。',
  },
  {
    slug: 'dir-key-nav-minimal',
    name: 'html-ppt-dir-key-nav-minimal',
    title: 'HTML PPT · 8 色极简方向键',
    scenario: 'personal',
    featured: 34,
    description:
      '8 页极简方向键 keynote — 每页一个独立单色背景（靛 / 奶 / 绛 / 翠 / 灰 / 紫 / 白 / 炭），各自配色，160px display 标题 + 4px 短粗 accent 线分隔、箭头 → 前缀的 Mono 列表、左下 ← → kbd 提示 + 右下页码、巨大呼吸留白。适合"有话要说但没什么可看"的 keynote、launch、公开演讲。',
    triggers: ['minimal keynote', '极简', 'mono color', 'one idea per slide', 'public talk', 'launch keynote'],
    examplePrompt:
      '用 html-ppt-dir-key-nav-minimal 模板做一份 8 页极简 keynote。每页一个单色背景 + 一句 160px 大标题 + 几条箭头列表。先告诉我演讲主题，然后帮我把 8 个核心观点拍成 8 页（每页一个 idea）。',
  },
];

const SKILL_BODY = (t) => `# ${t.title}

A focused entry point into the [\`html-ppt\`](../html-ppt/SKILL.md) master skill that lands the user directly on the **\`${t.slug}\`** full-deck template.

## When this card is picked

The Examples gallery wires "Use this prompt" to the example_prompt above. When you accept that prompt, this card is the right pick if the user wants exactly the visual identity of \`${t.slug}\` (see the upstream [full-decks catalog](../html-ppt/references/full-decks.md) for screenshots and rationale).

## How to author the deck

1. **Read the master skill first.** All authoring rules live in
   [\`skills/html-ppt/SKILL.md\`](../html-ppt/SKILL.md) — content/audience checklist,
   token rules, layout reuse, presenter mode, the keyboard runtime, and the
   "never put presenter-only text on the slide" rule.
2. **Start from the matching template folder:**
   \`skills/html-ppt/templates/full-decks/${t.slug}/\` — copy \`index.html\` and
   \`style.css\` into the project, keep the \`.tpl-${t.slug}\` body class.
3. **Bring the shared runtime with the template.** The upstream
   \`index.html\` links the shared CSS/JS via \`../../../assets/...\` because it
   sits three folders deep inside \`skills/html-ppt/templates/full-decks/\`.
   Once you copy \`index.html\` into the project, those parent-relative URLs
   no longer resolve and \`base.css\`, \`animations.css\`, and \`runtime.js\`
   will 404 — meaning the deck never activates and slide navigation is
   dead. Pick one of these two recipes per project:
   - **Recipe A — copy + rewrite (preferred):** copy
     \`skills/html-ppt/assets/fonts.css\`, \`skills/html-ppt/assets/base.css\`,
     \`skills/html-ppt/assets/animations/animations.css\`, and
     \`skills/html-ppt/assets/runtime.js\` into a project-local
     \`assets/\` (with \`assets/animations/animations.css\`), then rewrite the
     four \`<link>\`/\`<script>\` tags in \`index.html\` from
     \`../../../assets/...\` to the matching project-local paths
     (\`assets/fonts.css\`, \`assets/base.css\`,
     \`assets/animations/animations.css\`, \`assets/runtime.js\`).
   - **Recipe B — inline:** read the same four files and replace each
     \`<link rel="stylesheet" href="../../../assets/...">\` with a
     \`<style>...</style>\` containing the file's contents, and the
     \`<script src="../../../assets/runtime.js">\` with a
     \`<script>...</script>\` containing \`runtime.js\`. Yields a single
     self-contained \`index.html\`.
   Either way, do not ship the upstream \`../../../assets/...\` URLs
   verbatim into a project artifact — they only work in-tree.
4. **Pick a theme.** Default tokens look fine; if the user wants a different
   feel, swap in any of the 36 themes from \`skills/html-ppt/assets/themes/*.css\`
   via \`<link id="theme-link">\` and let \`T\` cycle.
5. **Replace demo content, not classes.** The \`.tpl-${t.slug}\` scoped CSS only
   recognises the structural classes shipped in the template — keep them.
6. **Speaker notes go inside \`<aside class="notes">\` or \`<div class="notes">\`** — never as visible text on the slide.

## Attribution

Visual system, layouts, themes and the runtime keyboard model come from
the upstream MIT-licensed [\`lewislulu/html-ppt-skill\`](${UPSTREAM_URL}). The
LICENSE file ships at \`skills/html-ppt/LICENSE\`; please keep it in place when
redistributing.
`;

function frontmatter(t) {
  const triggers = t.triggers
    .map((s) => `  - "${s.replace(/"/g, '\\"')}"`)
    .join('\n');
  return [
    '---',
    `name: ${t.name}`,
    `description: ${t.description}`,
    'triggers:',
    triggers,
    'od:',
    '  mode: deck',
    `  scenario: ${t.scenario}`,
    `  featured: ${t.featured}`,
    `  upstream: "${UPSTREAM_URL}"`,
    '  preview:',
    '    type: html',
    '    entry: index.html',
    '  design_system:',
    '    requires: false',
    '  speaker_notes: true',
    '  animations: true',
    `  example_prompt: ${JSON.stringify(t.examplePrompt)}`,
    '---',
    '',
  ].join('\n');
}

let wrote = 0;
for (const t of TEMPLATES) {
  const dir = path.join(SKILLS, `html-ppt-${t.slug}`);
  await mkdir(dir, { recursive: true });
  const skillMd = frontmatter(t) + SKILL_BODY(t);
  await writeFile(path.join(dir, 'SKILL.md'), skillMd, 'utf8');
  wrote++;
}
console.log(`[scaffold] wrote ${wrote} html-ppt-* SKILL.md files`);
