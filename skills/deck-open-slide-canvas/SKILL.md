---
name: deck-open-slide-canvas
zh_name: "1920 画布自由 Deck"
en_name: "Open-Slide 1920 Canvas Deck"
emoji: "🎨"
description: "锁死 1920×1080 画布, React 组件级自由组合, 不绑模板"
category: slides
scenario: design
aspect_hint: "1920×1080 (16:9)"
featured: 35
recommended: 9
tags: ["canvas", "open-slide", "freeform", "1920", "react"]
example_id: sample-deck-open-slide-canvas
example_name: "1920 自由画布 · Sea Indigo"
example_format: markdown
example_tagline: "锁死 1920×1080 + 自由组合"
example_desc: "Sea Indigo 调色 + 一页大字 question + 角标"
example_source_url: "https://github.com/1weiho/open-slide"
example_source_label: "1weiho/open-slide"
od:
  mode: deck
  surface: web
  scenario: design
  featured: 0.17
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「1920 画布自由 Deck」模板把我的内容做成一套「锁死 1920×1080 画布, React 组件级自由组合, 不绑模板」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 1920 画布自由 Deck】
【意图】不想被模板束缚的场景 (个人作品集、奇特演讲、艺术 / 设计课 deck)。给一个固定 1920×1080 画布 + 极强的类型 / 调色约束, 让 agent 像写 React 组件一样按内容自由排布每一页。Inspired by 1weiho/open-slide。

【硬性技术规格】
- 画布: 每页严格 `width: 1920px; height: 1080px;` 用 `transform: scale(...)` 适配视窗 (默认 `scale(0.7)` 居中)。
- **绝对禁止 overflow**: 每页内容必须 fit in 1920×1080, 不许滚动条出现。
- 字号 type scale (px): `2xs:18 · xs:22 · sm:28 · md:36 · lg:48 · xl:64 · 2xl:88 · 3xl:120 · 4xl:160 · 5xl:220`。
- 边距 padding: 96 / 128 / 160 三档之一。
- 每页有 `<section class="slide" data-slide-id="<n>">`。

【调色板 — 每个 deck 选 1 套, 全程不改】
- 🌫 **Ash & Lime** — bg `#f1efea`, ink `#161616`, accent `#c5e803`。
- 🌌 **Sea Indigo** — bg `#0a0e1a`, ink `#f5f5f7`, accent `#5ac8fa`。
- 🧉 **Mate Mocha** — bg `#1a1411`, ink `#f5e9d6`, accent `#d97757`。
- 🌸 **Pearl Rose** — bg `#fdf6f3`, ink `#1a1015`, accent `#ff5d8f`。

【布局自由度 — 这是核心】
- 不强制模板, 每页根据**内容性质**自选布局: cover / question / quote / image-text / 三列 / 五列 / 列表 / 数据卡 / 满版图。
- 但每页**必须遵守一条规则**: 视觉重心 (visual hierarchy) 只有 1 个 — 一句金句、一个数字、一张图, 不要"什么都强调"。
- 不许塞两段平等的文字; 真要并列就上 3 列等权重网格。

【字体】
- 西文: `Inter Tight` (display) + `Inter` (body); 或 `Source Serif Pro` (editorial 风时)。
- 中文: `Noto Sans SC` (sans 风) 或 `Noto Serif SC` (editorial 风); 不混 sans + serif。
- mono: `JetBrains Mono` 给数据 / 时间戳。

【设计细节】
- 严禁 emoji 装饰 (内容里的允许); 严禁多色彩虹; accent 只用一个色。
- 严禁 SVG icon 套用 lucide / feather 等通用库 (自己写 inline SVG)。
- 加键盘 ← / → 切换 + hash 同步; 角标固定: 右下 `№N/M`, 左下 deck title。
- 必须用用户的真实内容; 严禁 lorem ipsum。
- 单文件 HTML; Tailwind CDN; 不要外链图片。
