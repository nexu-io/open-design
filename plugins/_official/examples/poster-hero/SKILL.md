---
name: poster-hero
zh_name: "营销海报"
en_name: "Marketing Poster"
emoji: "🖼️"
description: "竖版海报 / 朋友圈分享图, 强视觉冲击"
category: poster
scenario: marketing
aspect_hint: "1080×1920 竖版"
tags: ["poster", "海报", "朋友圈"]
example_id: sample-poster-launch
example_name: "营销海报 · 产品发布"
example_format: markdown
example_tagline: "9:16 朋友圈分享图"
example_desc: "高对比度发布海报, 含 QR 码占位 + 渐变 mesh + 噪点纹理"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「营销海报」模板把我的内容做成一份「竖版海报 / 朋友圈分享图, 强视觉冲击」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 营销海报】
- 容器 `w-[1080px] h-[1920px] mx-auto`, 全屏渐变 / mesh 背景。
- 上部 30% 留白 + 一个大 emoji 或抽象几何图形。
- 中部主标题占视觉中心 (text-8xl, font-black), 一句话副标题。
- 下部信息卡片: 3-5 条核心要点用图标 + 短句。
- 底部右下角放品牌 / 二维码 (用 SVG 占位)。
- 使用大胆的色彩: 渐变背景 (from-violet-500 via-fuchsia-500 to-indigo-500 之类), 文字白色 + 1 个对比色高亮。
- 使用 SVG 做装饰性元素 (圆 / 三角 / 波浪 / 噪点纹理)。
