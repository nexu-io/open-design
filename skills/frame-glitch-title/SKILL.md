---
name: frame-glitch-title
zh_name: "故障艺术标题帧"
en_name: "Glitch Title Frame"
emoji: "⚡"
description: "数字故障 / 像散偏移 / 数据腐败标题, 适合视频转场 / cyberpunk hero"
category: video
scenario: video
aspect_hint: "1920×1080 (16:9)"
featured: 37
recommended: 6
tags: ["glitch", "cyberpunk", "title", "transition", "vfx", "frame"]
example_id: sample-frame-glitch-title
example_name: "故障标题 · SIGNAL_LOST"
example_format: markdown
example_tagline: "cyan / magenta 像散 + CRT 扫描线"
example_desc: "巨大标题 + 数据腐败伪影 + 角落 ASCII 噪点 chunks"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · glitch"
od:
  mode: video
  surface: video
  scenario: video
  featured: 0.14
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「故障艺术标题帧」模板把我的内容做成一段「数字故障 / 像散偏移 / 数据腐败标题, 适合视频转场 / cyberpunk hero」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 故障艺术标题帧 (Glitch Title)】
【意图】单帧 hero / 视频转场 / cyberpunk 风格标题。Inspired by hyperframes glitch。

【画布】1920×1080, 背景 `#070708` 近黑或 CRT 暗灰 `#0d0e10`; 加 56px 网格 (透明 5%) + scanlines 横线 (透明 8%, 2px 间隔)。

【主标题】
- 居中, 6-9vw, weight 800/900, 字体 `Space Grotesk Bold` / `Inter Tight Black` / `JetBrains Mono Bold`。
- 颜色: 主层 `#f5f5f7`; 后面套 2 层伪影:
  - cyan `#00f0ff` translate(`-3px`, `1px`)。
  - magenta `#ff2bd6` translate(`3px`, `-1px`)。
- 整层加 clip-path 切片 5-8 段, 每段 `@keyframes` 随机 translateX -10px → 10px, 持续 80-160ms, 错峰播放, 营造 "data corruption" 像散。
- 每隔 1.5s 触发一次"重故障" — 整个标题被 horizontal smear 1 frame, 用 `filter: url(#displacementFilter)` 或简单 CSS 平移。

【附加层】
- 顶部一行 caption (uppercase mono, 11px, opacity 0.6): `>> SIGNAL_LOST · CH-04 · 14:32:08`。
- 标题下面 1 行副标 (24-28px, mono, opacity 0.7), 偶发被 ` ̶▒̶` 字符替换 (假乱码)。
- 角落随机点缀 `█▓▒░` ASCII 噪点 chunks。
- 底部 timecode (mono, opacity 0.4)。
- 整画面叠 noise grain 层 `background-image: url("data:image/svg+xml,...turbulence...")`, opacity 6%, mix-blend-mode overlay。

【SVG 滤镜 (可选)】
- 定义 `<filter id="rgbShift">` 用 `feColorMatrix` + `feOffset` + `feMerge` 把 R/G/B 三通道偏移; 整层 `filter: url(#rgbShift)` 在故障瞬间应用。

【设计细节】
- 颜色仅用: 黑 / 白 / cyan / magenta / 一点 amber 警告色; 严禁全彩虹。
- 字体: 西文 `Space Grotesk` 或 `JetBrains Mono` Bold; 中文 `Noto Sans Mono CJK SC` 或 `Noto Sans SC` Bold。
- 严禁 lorem ipsum; 必须用用户的标题 + 副标。
- 动效用 `@keyframes`, 可被 `prefers-reduced-motion` 关闭 (退回静态 chromatic split)。
- 单文件 HTML。
