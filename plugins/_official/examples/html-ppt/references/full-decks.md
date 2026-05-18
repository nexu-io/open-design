# Full-Deck Templates

Self-contained multi-slide HTML decks under `templates/full-decks/<name>/`. Each folder contains:

- `index.html` — complete multi-slide deck (cover / section / content / code / chart or diagram / CTA / thanks, 7+ slides)
- `style.css` — scoped with `.tpl-<name>` class prefix so multiple templates can coexist
- `README.md` — short rationale, inspiration, and use guidance

All templates pull the shared `assets/fonts.css`, `assets/base.css`, and `assets/runtime.js` from the skill root. Navigate with `← →` / `space`, use `F` for fullscreen, `O` for overview.

Use these when you want a coherent, opinionated look for an entire deck — not a mix-and-match of layouts. Each template is visually distinctive enough to be identified at a glance.

---

## 1. xhs-white-editorial — 白底杂志风

- **Source inspiration:** `20260409 升级版知识库/小红书图文/v2-白底版/slide_01_cover.html` + `20260412-AI测试与安全/html/xhs-ai-testing-safety-v2.html`
- **Key visual traits:** pure-white background, top 10-color rainbow bar, 80-110px display headlines, purple→blue→green→orange→pink gradient text, macaron soft-card set (soft-purple/pink/blue/green/orange), black-on-white `.focus` pills, hero quote box.
- **When to use:** dual-purpose XHS image + horizontal deck; dense text with strong emphasis; Chinese-first audience.
- **Path:** `templates/full-decks/xhs-white-editorial/index.html`

## 2. graphify-dark-graph — 暗底知识图谱

- **Source inspiration:** `20260413-graphify/ppt/graphify.html`
- **Key visual traits:** `#06060c→#0e1020` deep-night gradient, drifting blur orbs, SVG force-directed graph overlay on cover, rainbow-shift gradient headlines, JetBrains Mono command-line glow, glass-morphism cards (warm/blue/green/purple/danger). Accent palette: amber `#e8a87c`, mint `#7ed3a4`, mist-blue `#7eb8da`, lilac `#b8a4d6`.
- **When to use:** dev-tool / CLI / knowledge-graph / data-viz launches; live-demo decks that want an "AI-native + sci-fi + warm" vibe.
- **Path:** `templates/full-decks/graphify-dark-graph/index.html`

## 3. knowledge-arch-blueprint — 奶油蓝图架构

- **Source inspiration:** `20260405-Karpathy-知识库/20260405 架构图v2.html`
- **Key visual traits:** cream paper `#F0EAE0` base, single rust accent `#B5392A`, 48px blueprint grid mask, hard 2px black border cards, pipeline step-boxes with one hero raised, right-side rust insight callout, Playfair serif big numbers, SVG dashed feedback-loop arrows. Zero gradients, zero soft shadows.
- **When to use:** system architecture diagrams, data-flow maps, engineering white-papers; you want a serious, printable, README-friendly feel.
- **Path:** `templates/full-decks/knowledge-arch-blueprint/index.html`

## 4. hermes-cyber-terminal — 暗终端 honest-review

- **Source inspiration:** `20260414-hermes-agent/ppt/hermes-record.html` + `hermes-vs-openclaw.html`
- **Key visual traits:** `#0a0c10` black, 56px cyber grid + CRT vignette + scanlines, window traffic-light chrome, `$ prompt` command-line headlines, mint-green `#7ed3a4` glow big text, JetBrains Mono throughout, stroke-only bar charts, blinking cursor, amber/green/red tag hierarchy, dark code box.
- **When to use:** reviews of CLI / agent / dev tools with trace, diff, and benchmarks; when you want the "honest technical reviewer" voice.
- **Path:** `templates/full-decks/hermes-cyber-terminal/index.html`

## 5. obsidian-claude-gradient — GitHub 暗紫渐变

- **Source inspiration:** `20260406-obsidian-claude/slides.html`
- **Key visual traits:** GitHub-dark `#0d1117`, purple+blue radial ambient plus 60px masked grid, center-aligned layout, purple pill tags, three-stop gradient text `#a855f7→#60a5fa→#34d399`, GitHub-ish code palette (`#010409` bg + purple/blue/orange/green tokens), purple-left-border highlight block.
- **When to use:** developer workflow / MCP / Agent / dev-tool tutorials; feels like GitHub Blog / Linear Changelog; config + steps heavy content.
- **Path:** `templates/full-decks/obsidian-claude-gradient/index.html`

## 6. testing-safety-alert — 红琥珀警示

- **Source inspiration:** `20260412-AI测试与安全/html/xhs-ai-testing-safety-v2.html`
- **Key visual traits:** top and bottom 45° red-black hazard stripes, red strike-through negation headlines, L1/L2/L3 green/amber/red tier cards, alert-box with circular status dot, policy-yaml code block with red left border and `bad` keyword highlighting, red/green checklist, Q1 incident stacked bar chart.
- **When to use:** safety / risk / incident post-mortem / red-team / pre-launch AI review / policy-as-code; when the audience needs to feel "this is serious, don't skim".
- **Path:** `templates/full-decks/testing-safety-alert/index.html`

## 7. xhs-pastel-card — 柔和马卡龙慢生活

- **Source inspiration:** `20260412-obsidian-skills/html/xhs-obsidian-skills.html` + pastel patterns shared with `20260409` v2-白底版
- **Key visual traits:** cream `#fef8f1` base, three soft blurred blobs, Playfair italic serif display headlines mixed with sans body, full-color 28px rounded macaron cards (peach / mint / sky / lilac / lemon / rose), italic Playfair `01-04` numerals, SVG donut chart, chip+page topbar.
- **When to use:** lifestyle / personal-growth / slow-living / emotional content; when you want a "magazine, handmade, not-so-techy" feel; themes like rest, pause, softness.
- **Path:** `templates/full-decks/xhs-pastel-card/index.html`

## 8. dir-key-nav-minimal — 方向键 8 色极简

- **Source inspiration:** `20260405-Karpathy-知识库/20260405 演示幻灯片【方向键版】.html`
- **Key visual traits:** 8 slides each on its own mono background (indigo / cream / crimson / emerald / slate / violet / white / charcoal), each with its own accent color, 160px display headline + 4px stubby accent line divider, arrow `→` prefixed Mono list, bottom-left `← →` kbd hint plus bottom-right page label, huge breathing negative space.
- **When to use:** keynote-style minimalist talk where you have something to say and not much to show; one idea per slide; talks / launches / public presentations.
- **Path:** `templates/full-decks/dir-key-nav-minimal/index.html`

---

## Scenario decks (generic, reusable)

These are not extracted from a single source — they are generic scaffolds for the most common presentation jobs. Each is visually distinctive and content-rich out of the box.

| # | Name | Slides | Feel | When to use |
|---|---|---|---|---|
| 9  | `pitch-deck`       | 10 | White + blue→purple gradient, YC/VC vibe, big numbers, traction chart | Fundraising, startup pitch, investor meeting |
| 10 | `product-launch`   | 8  | Dark hero + light content, warm orange→peach, feature cards, pricing tiers, CTA | Announcing a product, launch keynote |
| 11 | `tech-sharing`     | 8  | GitHub-dark, JetBrains Mono, terminal code blocks, agenda + Q&A | 技术分享, internal tech talk, conference talk |
| 12 | `weekly-report`    | 7  | Corporate clarity, 8-cell KPI grid, shipped list, 8-week bar chart, next-week table | 周报, team status update, business review |
| 13 | `xhs-post`         | 9  | **3:4 @ 810×1080**, warm pastel, dashed sticker cards, page dots | 小红书 图文 post, Instagram carousel |
| 14 | `course-module`    | 7  | Warm paper + Playfair serif, persistent left sidebar of learning objectives, MCQ self-check | 教学模块, online course, workshop module |
| 15 | `presenter-mode-reveal` 🎤 | 6  | **演讲者模式专用** · tokyo-night 默认 · 5 主题 T 键切换 · 每页带 150–300 字逐字稿示例 | **技术分享/演讲/课程**—需要按 S 键看逐字稿的场景 ✨ |

Each folder: `index.html`, scoped `style.css` (prefixed `.tpl-<name>`), `README.md`. The `xhs-post` template overrides the default `.slide` box to fixed `810×1080` for 3:4 portrait.

> 🎤 **任何演讲场景（技术分享 / 课程 / 路演）都推荐用 `presenter-mode-reveal`**，或者参考 [presenter-mode.md](./presenter-mode.md) 指南给其他模板加 `<aside class="notes">` 逐字稿。

---

## Authoring notes

- Every template scopes its CSS under `.tpl-<name>` so two or more templates can load on the same page without collisions.
- Swap demo content, but keep the structural classes — they are what gives each template its identity.
- The shared runtime (`assets/runtime.js`) provides keyboard nav, fullscreen, overview grid, theme cycling — you don't need to add any JS.
- Charts are hand-rolled SVG (no CDN dependency). Feel free to replace with chart.js / echarts if you need interactive data.
