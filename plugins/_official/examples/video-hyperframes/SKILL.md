---
name: video-hyperframes
zh_name: "Hyperframes 视频脚本"
en_name: "Hyperframes Video"
emoji: "🎞️"
description: "Hyperframes / Remotion 兼容的连续帧动画, 可自动播放"
category: video
scenario: video
aspect_hint: "1920×1080 (16:9)"
recommended: 5
tags: ["video", "hyperframes", "remotion", "视频"]
example_id: sample-hyperframes-workflow
example_name: "Hyperframes · AI workflow 视频"
example_format: markdown
example_tagline: "8 帧自动播放, 含进度条 + 元数据"
example_desc: "电影感动画脚本, 可直接喂给 Remotion 做成 mp4"
example_source_url: "https://github.com/heygen-com/hyperframes"
example_source_label: "heygen-com/hyperframes"
od:
  mode: video
  surface: video
  scenario: video
  featured: 0.13
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「Hyperframes 视频脚本」模板把我的内容做成一段「Hyperframes / Remotion 兼容的连续帧动画, 可自动播放」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: Hyperframes 视频帧】
- 输出 N 个连续 `<section class="frame">`, 每个 `w-[1920px] h-[1080px]`; N 由【用户内容】信息密度决定 (短脚本 6-10 帧起步, 长脚本应更多, 每帧只承载一个镜头/概念)。
- 每帧表达一个镜头/概念: 文字 + 视觉构图 (中央构图 / 黄金分割 / 三分法)。
- 每帧底部隐藏标记 `<!-- frame:N duration:3000 transition:fade -->` 供后续 Remotion / Hyperframes 渲染脚本读取。
- 顶部加一段 JavaScript 自动播放: 每 3 秒切换到下一帧, 也支持点击 / 方向键控制; 角落显示进度条。
- 第 1 帧是 hook (一个数据 / 一个反常识 / 一个问题), 第 2-N 是论证, 最后是结论 + CTA。
- 字号巨大 (text-9xl), 一句话即可, 不要堆砌。
- 配色统一一套电影感 (深色背景 + 1 个霓虹强调色)。
- 输出最后包含一段简短注释 `<!-- HYPERFRAMES_META: ... -->`, 包含每帧 duration / transition / sceneSummary 的 JSON 元数据, 用于后续转 Remotion。
