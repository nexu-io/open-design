---
name: frame-liquid-bg-hero
zh_name: "流体背景 Hero 帧"
en_name: "Liquid Background Hero"
emoji: "🌊"
description: "WebGL 风流体置换背景 + 顶部叠加金句, 适合视频片头 / landing hero / 海报"
category: poster
scenario: video
aspect_hint: "1920×1080 (16:9) 或 1080×1920 (9:16)"
featured: 39
tags: ["liquid", "fluid", "background", "hero", "html-in-canvas", "vfx"]
example_id: sample-frame-liquid-bg-hero
example_name: "流体背景 Hero · 金句"
example_format: markdown
example_tagline: "Aurora Violet 流体"
example_desc: "多层 radial-gradient 呼吸背景 + difference 文字"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · vfx-liquid-background"
od:
  mode: video
  surface: video
  scenario: video
  featured: 39
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「流体背景 Hero 帧」模板把我的内容做成一段「WebGL 风流体置换背景 + 顶部叠加金句, 适合视频片头 / landing hero / 海报」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 流体背景 Hero】
【意图】可作为视频片头帧、SaaS landing 顶部 hero、海报底图。WebGL 流体感, 但用 CSS / canvas 退化绘制, 确保单文件可双击打开。Inspired by hyperframes vfx-liquid-background。

【画布】1920×1080 (横) 或 1080×1920 (竖), 二选一。背景占满。

【流体背景 — 3 种实现, 按用户偏好选】
1. **CSS 多层 radial-gradient 错位呼吸** (最稳, 默认推荐):
   - 3-5 个大椭圆 `radial-gradient(...)`, 颜色取自调色板。
   - 每个椭圆套 `@keyframes` 平移 + scale + hue-rotate, 周期 8-14s, 错峰; 整个画面叠 `mix-blend-mode: screen` 或 `overlay`。
   - 顶层加 1 层 `backdrop-filter: blur(80px)` 让边缘更糊。
2. **Canvas + simple perlin noise** (中阶):
   - 80 行 inline JS, 用 `requestAnimationFrame` 画 metaballs 或 simplex noise field。
   - 性能允许时启用, `prefers-reduced-motion` 时降回静态截图。
3. **WebGL fragment shader** (高阶, 慎用):
   - 用 jsdelivr CDN 引 `regl` 或 inline plain WebGL。
   - shader 写 domain-warp noise; 单个 quad, 一个 uniform `u_time`。

【顶层文字层】
- 居中或左下: 一句巨型金句 (5-7vw, 衬线或粗 sans), 字体: `Source Serif Pro` / `Inter Tight` / `Manrope Black`。
- 文字色用 paper white `#fafaf8` 或 ink, 取决于背景明暗; 加 `mix-blend-mode: difference` 让它在任何流体颜色上都可读。
- 副标 (小 sans, opacity 0.7) 一行。
- 底部可选 CTA chip 或 hairline + 元数据 row。

【调色 — 4 选 1, 不要彩虹】
- 🌅 **Solar Peach** — `#ffb18a` + `#f78b4c` + `#d97757`, 暖橙桃。
- 🌊 **Ocean Aqua** — `#5ac8fa` + `#0a84ff` + `#1e3a8a`, 海蓝。
- 🌌 **Aurora Violet** — `#a78bfa` + `#7c5cff` + `#1e1b4b`, 极光紫。
- 🌿 **Forest Mint** — `#86efac` + `#34d399` + `#065f46`, 苔森林。

【设计细节】
- 严禁: 多色彩虹 (>4 个色相)、PowerPoint 渐变、霓虹荧光叠加。
- 字体: 中文用 `Noto Serif SC` (display) / `Noto Sans SC` (副标)。
- 严禁外链图片; 全部 CSS + SVG + 可选 canvas。
- 必须用用户提供的金句 / 标题; 如果用户输入是数据 → 提炼一句 ≤ 18 字的金句。
- 单文件 HTML, 可被 `prefers-reduced-motion` 关动效。
