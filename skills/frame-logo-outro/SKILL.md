---
name: frame-logo-outro
zh_name: "品牌 Logo 收尾帧"
en_name: "Logo Outro Frame"
emoji: "🎬"
description: "Logo 分块组装入场 + glow bloom + tagline 揭示, 适合视频片尾 / 品牌闭幕"
category: video
scenario: video
aspect_hint: "1920×1080 (16:9)"
featured: 40
recommended: 8
tags: ["logo", "outro", "branding", "end-card", "frame"]
example_id: sample-frame-logo-outro
example_name: "品牌 Logo 收尾 · HTML Anything"
example_format: markdown
example_tagline: "Midnight Indigo + glow bloom"
example_desc: "Logo 装配 + 品牌名 + tagline + CTA, 视频片尾用"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · logo-outro"
od:
  mode: video
  surface: video
  scenario: video
  featured: 0.16
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「品牌 Logo 收尾帧」模板把我的内容做成一段「Logo 分块组装入场 + glow bloom + tagline 揭示, 适合视频片尾 / 品牌闭幕」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: Logo 收尾帧 (Logo Outro)】
【意图】视频结尾的品牌 reveal 帧 —— logo 分块拼装 + glow bloom + tagline 上浮 + CTA。Inspired by hyperframes logo-outro。

【画布】1920×1080, 黑色 `#08090c` 或品牌深色背景; 加微妙 vignette `radial-gradient(...)` 让中心更亮。

【布局】
- **中心 Logo**: 用 CSS / 内联 SVG 绘制; 由 4-8 个几何块 (圆 / 方 / 三角 / hairline) 组成。
  - 入场动画: 每个块从屏幕外滑入 (±100px 不同方向) + scale 1.4→1.0 + opacity 0→1, 错峰 80ms; 总时长 1.2s。
  - 入场完成后, 整个 logo 加 glow bloom: `filter: drop-shadow(0 0 24px <accent>40)`; 同时一道 shimmer `mask-image` 横扫 logo (500ms)。
- **品牌名**: logo 下方 6-8% 位置, 大字 (Inter Tight / SF Pro Display, 48-72px, weight 700, letter-spacing -0.02em), 入场: typewriter or fade-up after logo bloom (1.4s 开始)。
- **Tagline**: 品牌名下方一行 (24-28px, weight 400, opacity 0.7), fade in (1.8s)。
- **底部 CTA + 元数据**: 双行底部 row, 例如 `htmlanything.dev · @htmlanything · 2026`, 11px uppercase letter-spacing 0.16em, 颜色 opacity 0.4, hairline 分隔。

【调色 — 4 选 1, 不混用】
- 🌌 **Midnight Indigo** — bg `#08090c`, accent `#7c5cff` (霓虹紫蓝 glow)。
- 🌅 **Solar Amber** — bg `#0e0a08`, accent `#ffb547` (暖琥珀)。
- 🌿 **Forest Mint** — bg `#0a1410`, accent `#5fb38a` (薄荷绿)。
- ⚪ **Bone & Ink** — bg `#f1efea`, accent `#0a0a0b` (无 neon, 走 editorial 风, glow 改成阴影)。

【设计细节】
- **绝不**: 用外链 logo 图片; logo 必须用纯 CSS / 内联 SVG 几何绘制。
- 入场动画用 `@keyframes` + `animation-delay`; 可被 `prefers-reduced-motion` 关闭。
- 字体: 西文 `Inter Tight` / `SF Pro Display` / `Manrope`; 中文 `Noto Sans SC` weight 700。
- 必须用用户提供的品牌名 + tagline; 若没有, 跑 fallback "HTML Anything" / "Anything → beautiful HTML"。
- 单文件 HTML; 整个动画完成后 freeze (不要 loop, 这是视频结尾帧)。
- 顶部可选 5px ribbon (accent 色) 增加品牌识别。
