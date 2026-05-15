---
name: vfx-text-cursor
zh_name: "VFX 文字光标"
en_name: "VFX Text Cursor"
emoji: "✨"
description: "光标拖光 + 彩色像散射线 + 定向光斑, 适合视频片头逐字揭示金句"
category: video
scenario: video
aspect_hint: "1920×1080 (16:9)"
featured: 38
recommended: 7
tags: ["vfx", "text", "cursor", "chromatic", "reveal", "frame"]
example_id: sample-vfx-text-cursor
example_name: "VFX 光标 · 开场金句"
example_format: markdown
example_tagline: "逐字揭示 + chromatic 拖光"
example_desc: "光标打字 hot pink + cyan 像散, 视频开场用"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · vfx-text-cursor"
od:
  mode: video
  surface: video
  scenario: video
  featured: 0.15
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「VFX 文字光标」模板把我的内容做成一段「光标拖光 + 彩色像散射线 + 定向光斑, 适合视频片头逐字揭示金句」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: VFX 文字光标 (Text Cursor)】
【意图】视频开场/Hero 帧 —— 光标在画布上"打字", 文字逐字浮现, 后面拖着彩色像散尾迹 + 定向光斑。Inspired by hyperframes vfx-text-cursor。

【画布】1920×1080, 背景 `#06070a` 暗哑黑 或 `#0a0d12` (有暖偏蓝); 加微妙 vignette。

【内容】
- 一句金句 (中英不限), 居中, 字号 6-8vw, weight 700, 字体 `Inter Tight` / `Source Sans 3` / `Noto Sans SC`。
- 逐字揭示, 每个字符 80ms 间隔; 当前字符后面跟着一个 cursor `▍` (或细 vertical bar)。
- 已揭示文字默认白色 `#f5f5f7`, opacity 1; 即将揭示位置加 chromatic ghost: 一份 `text-shadow: 2px 0 #ff3b6f, -2px 0 #00d4ff` 在 reveal 瞬间, 200ms 内收敛回正常。
- 光标本身: 16px 宽矩形, 颜色 = accent (取 1: hot pink `#ff3b6f` / cyan `#00d4ff` / amber `#ffb547`), 闪烁 `@keyframes` 1.0s 周期; 后面拖一条 60-120px 的 motion blur trail (径向渐变到透明)。

【光斑 / 射线】
- 在打字位置附近随机生成 3-5 道**定向光斑** (light leak): 用 `linear-gradient(45deg, transparent, accent20, transparent)` 的细长矩形 + `mix-blend-mode: screen`, 不规则角度。
- 当文字打完, 整段文字加 0.5s shimmer sweep (光带横扫)。

【字段】
- 顶部 caption (uppercase letterspace 0.18em, 11px, opacity 0.5): "FRAME 01 · OPENING"。
- 文字底下副标 (24-28px, opacity 0.6): 来源 / 章节。
- 右下角 timecode (`00:03:21` mono)。

【设计细节】
- **绝不**: 多色彩虹 chromatic (只用 1 个 hot pink + cyan 这种二元像散, 不要 R/G/B 全色)。
- 字体: 西文 `Inter Tight` Bold; 中文 `Noto Sans SC` Bold; 严禁衬线。
- 动效用 `@keyframes` + JS 计时器 (`setTimeout` 逐字), 可被 `prefers-reduced-motion` 关闭 (直接显示所有字)。
- 必须用用户提供的金句; 不要捏造。
- 单文件 HTML, 不要外链字体以外的资源。
