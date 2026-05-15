---
name: social-spotify-card
zh_name: "Spotify 正在播放卡"
en_name: "Spotify Now-Playing Card"
emoji: "🎵"
description: "Spotify Now Playing 风格卡: 专辑封面 + 进度条 + 播放控制, 适配视频叠加 / 个人主页"
category: card
scenario: personal
aspect_hint: "1280×720 或 600×200"
featured: 43
tags: ["spotify", "music", "now-playing", "card", "overlay"]
example_id: sample-social-spotify-card
example_name: "Spotify Now Playing · Lo-Fi"
example_format: markdown
example_tagline: "Spotify 经典 dark 卡"
example_desc: "Lo-Fi Beats · Chillhop 进度条 1:24 / 3:42 + 控制行"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · spotify-card"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: personal
  featured: 43
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「Spotify 正在播放卡」模板把我的内容做成一份「Spotify Now Playing 风格卡: 专辑封面 + 进度条 + 播放控制, 适配视频叠加 / 个人主页」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: Spotify Now-Playing 卡】
【意图】把一首歌、一段播客、或一段个人介绍渲染成 Spotify 正在播放卡, 适合 video overlay / 个人 about page / 创作者 hero。Inspired by hyperframes spotify-card。

【画布】两个尺寸:
- 横版视频叠加: 1280×720, 卡片居中或左下角浮动。
- 紧凑横条 widget: 600×200, 可嵌入到任何 hero。

【卡片结构】
- 外框: 圆角 12-16px; bg 用专辑封面色提取的暗渐变 (e.g. `linear-gradient(135deg, #1e3264 0%, #0d1f3d 100%)`) 或 Spotify 经典 `#121212`; 边缘有 1px subtle border。
- 左侧: **专辑封面** (CSS 渐变 + 大字 monogram 或抽象几何描绘, 不能外链图片), 圆角 6px, 60-200px 方形。
- 右侧:
  - 顶部 `NOW PLAYING` (uppercase letterspace 0.14em, 11px, 绿色 `#1DB954`)。
  - **歌名 / 标题** (Inter / Spotify Circular, 22-28px, weight 700, 白色)。
  - **艺人 / 副标** (16px, weight 400, opacity 0.7)。
  - 进度条: 4px 高, 圆角, 灰色背景 + 白色 fill (`width: 38%`); 两端时间戳 `1:24 / 3:42` (mono, 11px, 灰)。
  - 控制行: ⏮ ⏯ ⏭ icon (inline SVG, 24px, 白色 fill), shuffle / repeat icon 较小。
- 右上角: Spotify logo (内联 SVG, 绿色 `#1DB954` 圆 + 三道白色波纹)。
- 可选: 右下角小型音波动效 (3 个 bar `@keyframes`)。

【字体】
- 主: `Spotify Circular` → fallback `Inter` / `Inter Tight`, weight 400 / 700。
- 数字: 同主字体, 不用 mono 太多。

【设计细节】
- Spotify 经典 dark mode: `#121212` bg, `#1DB954` accent, `#b3b3b3` secondary text。
- 若用户输入是文本/标题 → 把 "标题" 当歌名, "副标/作者" 当艺人, 估算"时长" 3:42 默认。
- 若用户输入是音乐相关 → 直接对应。
- 严禁外链图片; 封面用 CSS 渐变 + 文字 logo / 几何描绘。
- 微动效: 音波动效用 `@keyframes`, 可被 `prefers-reduced-motion` 关闭。
- 单文件 HTML。
