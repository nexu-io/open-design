---
name: frame-light-leak-cinema
zh_name: "胶片漏光电影帧"
en_name: "Light-Leak Cinematic Frame"
emoji: "🎞️"
description: "胶片漏光 + 颗粒噪点 + 16:9 letterbox + 衬线大字, 电影感开场 / 章节卡"
category: video
scenario: video
aspect_hint: "2.39:1 letterbox (1920×800) 或 16:9 (1920×1080)"
featured: 36
tags: ["cinema", "film", "light-leak", "grain", "letterbox", "frame"]
example_id: sample-frame-light-leak-cinema
example_name: "胶片漏光 · REEL 03"
example_format: markdown
example_tagline: "暖橙漏光 + 35mm 颗粒"
example_desc: "2.39:1 letterbox + 衬线斜体大字 + 胶片齿孔"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · light-leak"
od:
  mode: video
  surface: video
  scenario: video
  featured: 36
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「胶片漏光电影帧」模板把我的内容做成一段「胶片漏光 + 颗粒噪点 + 16:9 letterbox + 衬线大字, 电影感开场 / 章节卡」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 胶片漏光电影帧】
【意图】纪录片 / 个人短片 / 视频章节卡的开场单帧 —— 暖橙漏光 + 35mm 颗粒 + 衬线大字, 古典胶片质感。Inspired by hyperframes light-leak。

【画布】
- **2.39:1 letterbox** (推荐): 1920×800, 上下黑边各 140px (`#000`)。
- 或 16:9: 1920×1080, 无 letterbox。

【背景】
- 底层: 深暖色 (深红棕 `#1a0d08` / 墨绿 `#0a1410` / 蓝紫 `#0d0e1a`) 或场景描绘 (CSS gradient 模拟天空 / 室内 / 室外)。
- **胶片漏光 (Light Leak)**: 2-3 个大 `radial-gradient(ellipse at top right, #ffb547 0%, transparent 50%)` + 1 个底部 `linear-gradient(to top, #d97757 0%, transparent 30%)`; 颜色取暖橙 / 桃 / 玫红 / 暗黄, **不要冷蓝**。
- **35mm Grain**: 全屏覆盖 SVG turbulence noise 图层, opacity 14%, `mix-blend-mode: overlay`; 也可用 `background-image: url("data:image/svg+xml,...feTurbulence...")`。
- 可选: 1 道 `feDisplacementMap` 模拟胶片摆动 (慎用)。

【文字】
- 中央或左下: 大字衬线 (Source Serif Pro / Playfair Display / EB Garamond) 5-8vw, weight 500 italic; 颜色暖白 `#f5e9d6` 或 cream。
- 副标 (24-28px) 一行, opacity 0.7, 同样衬线。
- 角落 caption (uppercase letterspace 0.18em, 10-11px, mono, opacity 0.5): "REEL 03 · CH I · 1985"。
- 底部 timecode + 拍摄地 + 日期 (mono, opacity 0.4)。

【可选附加】
- "胶片划痕": 几条 1-2px 竖向白线, opacity 0.2, 不规则间距 (用 `box-shadow` 多重 inset 或多个 `<div>`)。
- "胶片齿孔": letterbox 黑边内, 等距小白方块 (CSS repeating-linear-gradient)。
- 入场动效: 整画面从 underexposed (brightness 0.3) → normal, 800ms 内; 漏光位置缓慢漂移 12s 一个周期。

【设计细节】
- 颜色绝不超过 4 个色相 (深背景 + 2 个暖漏光色 + 文字 cream)。
- 严禁: 蓝紫漏光 (违反胶片质感)、emoji、霓虹色、几何 dashboard 装饰。
- 中文: `Noto Serif SC` italic 不存在 → 用 `Noto Serif SC` regular + 字距加大。
- 必须用用户提供的标题; 自动估算合理"年份 / 章节 / 地点" 元数据 (但来源用户内容)。
- 单文件 HTML, 用 `prefers-reduced-motion` 关动效。
