---
name: mockup-device-3d
zh_name: "iPhone × MacBook 立体展架"
en_name: "Device 3D Showcase"
emoji: "📱"
description: "iPhone + MacBook 仿 GLTF 静态展架, 屏幕内嵌真实 HTML 内容, 玻璃镜头折射, 360° 转盘构图"
category: poster
scenario: product
aspect_hint: "1920×1080 (16:9)"
featured: 47
tags: ["device", "mockup", "iphone", "macbook", "html-in-canvas", "product"]
example_id: sample-mockup-device-3d
example_name: "iPhone × MacBook 立体展架"
example_format: markdown
example_tagline: "HTML-in-Canvas 设备秀"
example_desc: "iPhone 屏幕 + MacBook 屏幕都嵌入真实 UI 内容, 玻璃镜头折射"
example_source_url: "https://hyperframes.heygen.com/catalog"
example_source_label: "hyperframes · vfx-iphone-device"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: product
  featured: 47
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「iPhone × MacBook 立体展架」模板把我的内容做成一份「iPhone + MacBook 仿 GLTF 静态展架, 屏幕内嵌真实 HTML 内容, 玻璃镜头折射, 360° 转盘构图」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 设备 3D 展架 (Device 3D Showcase / HTML-in-Canvas)】
【意图】产品发布、App 演示、设计稿展示。把用户提供的 UI 内容真实渲染到 iPhone / MacBook "屏幕"里, 周围用 CSS 3D transform 模拟 GLTF 模型的玻璃 / 高光 / 折射。Inspired by hyperframes vfx-iphone-device。

【硬性构图】
- **画布**: 1920×1080, 暖灰渐变背景 `radial-gradient(#1a1a1f → #0a0a0f)`, 底部反射地面 (mirror gradient)。
- **iPhone 15 Pro 模型**: 左侧 / 中部, `transform: rotateY(-12deg) rotateX(4deg) translateZ(40px)`; 边框钛金属银 `#a8a8ad` (实心 4px) + 屏幕圆角 56px; 屏幕内嵌 iframe-like div, 真实渲染用户的 HTML 内容 (mobile viewport 375×812)。
- **MacBook Pro 14"** (可选第二台): 右侧, 略小, `rotateY(8deg)`; 上盖屏幕嵌入桌面 viewport 内容 (1440×900 缩放); 底座键盘 + trackpad 用 CSS 阴影线条绘制 (不画键帽细节)。
- **玻璃 / 镜头光斑**: 顶部加 2-3 个 `radial-gradient(ellipse, rgba(255,255,255,0.4) 0%, transparent 60%)` 的椭圆 highlight, 模拟 morphing glass lens。
- **地面反射**: 设备下方 `transform: scaleY(-1)` + `mask-image: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 70%)`。

【屏幕内容来源】
- 用户提供的是文本/数据 → 自动渲染为一个 mock app 界面 (顶部 status bar + 标题 + body + 底部 tab bar 或 home indicator)。
- 用户提供的是 HTML → 原样嵌入屏幕 div 内 (注意缩放 transform 让它适配屏幕宽高)。
- 屏幕内 UI 用 Tailwind, 字号要按 mobile 真实尺寸 (text-sm / text-base, 不要 text-9xl)。

【可选附加元素】
- 右下角 "product slug" 角标: 大 logo + 一行 tagline + 副标 hairline。
- 顶部一行 caption (英文 sans, 字号小, 透明 0.6): 产品 codename / 日期 / 版本。
- 加 8s 自动 CSS 转盘: `@keyframes turntable` rotateY -12 ↔ 12, ease-in-out infinite alternate; 可被 `prefers-reduced-motion` 关闭。

【设计细节】
- **绝不**: 用外部 mockup 图片 URL (任何 unsplash / dribbble link), 全部用 CSS / SVG 绘制设备。
- 字体: 设备外的 caption / logo 用 `Inter Tight` / `SF Pro` 风格; 设备内根据用户内容自适应。
- 背景可选 4 套调色: charcoal / pearl / midnight blue / mocha; 不要彩虹渐变。
- 单文件 HTML; iframe 不要用 srcdoc 嵌套 (容易出问题), 用 `<div class="screen">` + Tailwind 渲染内容。
- 必须用用户真实数据填充屏幕内容, 严禁 lorem ipsum 或 "Your text here"。
