---
name: doc-kami-parchment
zh_name: "Kami 羊皮纸文档"
en_name: "Kami Parchment Document"
emoji: "📜"
description: "暖羊皮纸底 (#f5f4ed) + 墨蓝单色 accent (#1B365D) + 单一衬线字体, 编辑级排印"
category: doc
scenario: personal
aspect_hint: "A4 / Letter 长页"
featured: 48
recommended: 3
tags: ["kami", "parchment", "serif", "editorial", "report", "letter", "one-pager"]
example_id: sample-kami-parchment
example_name: "Kami 羊皮纸 · One-Pager"
example_format: markdown
example_tagline: "暖羊皮纸 + 墨蓝单色 + 单一衬线"
example_desc: "一页 Open Design Studio Issue №26 编辑级 one-pager"
example_source_url: "https://github.com/tw93/kami"
example_source_label: "tw93/kami"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: personal
  featured: 0.04
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「Kami 羊皮纸文档」模板把我的内容做成一份「暖羊皮纸底 (#f5f4ed) + 墨蓝单色 accent (#1B365D) + 单一衬线字体, 编辑级排印」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: Kami 羊皮纸文档】
【意图】严肃排版文档: one-pager / 长报告 / 信函 / 简历 / 财报 / changelog / portfolio。Inspired by tw93/kami。强调"写得像被排过版的纸", 不是 dashboard, 不是网页。

【硬性视觉签名 — 不许改】
- **画布**: 暖羊皮纸 `#f5f4ed` (永远不用纯白 `#fff`)。次级背景 `#efeee5`。
- **墨色**: 主文字 `#1f1d18` (近黑暖灰, 不用纯黑 `#000`)。次文字 `#6b665b`。
- **唯一色彩**: 墨蓝 `#1B365D` ——所有 accent (链接、tag 描边、重点数字、引用左 rule) 只能用这一个色, 严禁多色。
- **字体**: 一种语言一种衬线, 全文不混用:
  - 英文: `Charter` (fallback: `Source Serif Pro`, `Iowan Old Style`)
  - 中文: `TsangerJinKai02 W04` (fallback: `Noto Serif SC`)
  - 日文: `YuMincho` (fallback: `Noto Serif JP`)
  - Body 400, Heading 500 (不要 700/800/900)。
- **行高**: 标题 1.1–1.3, 紧凑正文 1.4–1.45, 阅读型正文 1.5–1.55。
- **绝不**: drop-shadow / blur / 圆角 ≥ 8px / 渐变 / 霓虹色 / rgba (用 solid hex)。
- **细节**: tag 用 solid hex 背景方块 (因为 WeasyPrint 不渲染 rgba 好); 单线几何 icon; 边缘 1px hairline `#d4d1c5` rule, 长度受控不到边。

【可选文档类型 — 按用户内容判断】
- **One-Pager** — 顶 logotype (Charter italic) + 标题 + lede + 3 列要点 + 底脚 metadata。
- **Long Doc** — 封面页 (大标题 + 副标 + 作者 + 日期) → 目录 (kicker + page no.) → 章节 (folio 顶角 + section rule + body) → 注释脚注 + 文末 colophon。
- **Letter** — 抬头地址 + 日期 + 收件人 + 正文 (左对齐, 段间空 1.5em) + 署名 + 签名占位线。
- **Portfolio** — 项目 hero (大标题 + sub) + 1 张全幅图 (用 CSS 块绘制占位) + 项目描述 + 角色 / 时间 / stack 元数据 row。
- **Resume** — 顶部姓名 (大字) + tagline 一行 + contact row + 主要 section: experience (公司 / 时间 / 职位 / bullets) + skills + education。
- **Slides** — keynote 风, 页数由【用户内容】决定 (短内容 6 页起步, 长内容应更多), 每页满铺羊皮纸, 大标题 + lede + 角标 page no., 简洁到只有"被印出来"的感觉。
- **Equity Report** — 公司名 + ticker + Q × 年份 + key metrics row (revenue / margin / yoy) + body 分析 + 图表 (SVG 单色折线)。
- **Changelog** — 版本号 (Charter italic 大字) + 日期 + 改动列表 (Added / Changed / Fixed), 单 rule 分隔。

【设计准则】
- "Composed pages, not dashboards." 不要堆 KPI 卡, 不要堆 emoji 图标, 不要 hero gradient。
- "Ring or whisper only, no hard drop shadows." 阴影只能是 `0 0 0 1px #d4d1c5` 这种 hairline 描边。
- 文字层级靠**衬线对比 + 字号 + 留白**, 不靠颜色。
- 单文件 HTML, 用 Tailwind CDN; 全文中英混排时加盘古之白; 不要外链图片, 占位用 paper-tint 色块 + 1px ink 描边。
