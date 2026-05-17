---
name: deck-swiss-international
zh_name: "瑞士国际主义 Deck"
en_name: "Swiss International Deck"
emoji: "🟦"
description: "16 列网格 + 单一饱和 accent + 22 个锁死版面 (Klein Blue / Lemon / Mint / Safety Orange)"
category: slides
scenario: marketing
aspect_hint: "16:9 横向翻页"
featured: 1
recommended: 1
tags: ["swiss", "grid", "international", "ikb", "editorial", "facts"]
example_id: sample-swiss-international
example_name: "Swiss International · 产品路线"
example_format: markdown
example_tagline: "Klein Blue IKB + 16 列网格"
example_desc: "S01 Cover + S06 KPI Tower 两页预览, IKB 全屏标题 + 4 柱状 KPI"
example_source_url: "https://github.com/op7418/guizang-ppt-skill"
example_source_label: "op7418/guizang-ppt-skill"
od:
  mode: deck
  surface: web
  scenario: marketing
  featured: 0.001
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「瑞士国际主义 Deck」模板把我的内容做成一套「16 列网格 + 单一饱和 accent + 22 个锁死版面 (Klein Blue / Lemon / Mint / Safety Orange)」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 瑞士国际主义 Deck (Swiss International)】
【意图】事实、产品、分析、方法论表达。极度冷静、理性、学院派, 没有任何手绘 / 噪点 / 装饰。Inspired by op7418/guizang-ppt-skill Style B。

【主题】**只能从下面 4 套二选一, 不许混用、不许改 hex**:
- 🔵 **Klein Blue (IKB)** — accent `#002FA7`, paper `#fafaf8`, ink `#0a0a0a`. 商业 / AI / 设计场景。
- 🟡 **Lemon Yellow** — accent `#FFD500`, paper `#f7f5ee` (淡奶油), ink `#0a0a0a`. 年轻 / 零售 / 体育。文字必须用黑色 (不能白色)。
- 🟢 **Lemon Green / Neon** — accent `#C5E803`, paper `#f7f5ee`, ink `#0a0a0a`. 可持续 / 科技初创 / Gen-Z 品牌。文字必须用黑色。
- 🟠 **Safety Orange** — accent `#FF6B35`, paper `#f7f5ee`, ink `#0a0a0a`. 工业 / 汽车 / 紧急消息。文字用白色 + bold ≥ 600。

【布局 — 22 个可复用版式池, 不许新增或改造版式; **数量由内容决定**, 把【用户内容】完整覆盖完为止 (短内容 6-10 张起步, 长内容应远超此范围, 同一版式可在不同章节重复使用)】
- **S01 Cover** — 全屏 accent + ASCII 呼吸点阵 + 反白标题 + 元数据 chrome (date / № / topic)。
- **S02 Vertical Timeline** — 左侧虚线轴 + 圆点; 右侧节点 = 年份 + KPI + 描述。
- **S03 Statement** — 9.6vw 居中巨字 + 左侧大段留白 + 底部 hairline + 注释。
- **S04 Six Cells** — 2×3 网格, 每格: icon + 编号 + 短标题 + 单行描述。
- **S05 Three Sub-cards** — 左侧 hero 标题 + 右侧 3 张水平堆叠的灰色卡。
- **S06 KPI Tower** — 4 列变高蓝色柱状; 柱顶 icon; 柱底大数字 + 标签。
- **S07 H-Bar Chart** — 水平排名横条, 宽度反映数据, 末端标数字。
- **S08 Duo Compare** — 垂直分割线; 左 Before / 右 After。
- **S09 Closing Manifesto** — 左 IKB 块 + ASCII 点阵 + 宣言; 右白底 + 3 条要点。
- **S10 Dot Matrix Statement** — 居中宣言 + 角落几何点矩阵 / 圆环矩阵。
- **S11 Horizontal Timeline** — 顶部 headline, 中部 hairline 轴, 等距节点, 节点下方步骤名。
- **S12 Manifesto + Ink Banner** — 上半 headline + 解释; 下半全宽黑色横幅 + 反白小字。
- **S13 Three Forces Cards** — 左 ink hero 块; 右 3 张灰色卡, 每卡: 大数字 + 文本。
- **S14 Loop Diagram** — 左编号步骤; 右 SVG 同心环; 中心 "LOOP" 标签。
- **S15 Image Matrix + Hero Stat** — 4×3 等高卡片 (12 项) + 底部 summary 大数字 + 标签。
- **S16 Multi-card Brief** — 3×2 微卡; 主文左上, 注脚右下, 单卡 accent 高亮。
- **S17 System Diagram** — 左 headline + 3 段描述; 右 SVG 三同心圆 + 外部标签。
- **S18 Why Now** — 3 列, 每列: category label + headline + 描述 + 底部数字 (最后一列 accent)。
- **S19 Four Cards** — 顶部 accent hairline + headline + 4 张等宽卡 (元数据 / 标题 / 正文)。
- **S20 Stacked KPI Ledger** — 垂直行 + hairline 分隔; 左大数字 / 中标签 / 右 icon。
- **S21 Tech Spec Sheet** — 左标题块 / 中 3 个 KPI hairline / 右变高柱 / 底数据。
- **S22 Image Hero** — 上 60% 全宽图 + 白色标题块覆盖; 下 40% 解释 + 3 列 KPI。

【设计细节 — 绝对铁律】
- **只用直角**: 全程 `border-radius: 0`。圆角 = 立刻违反。
- **1px hairline borders**, 黑色或 accent; 严禁阴影 / 渐变 / blur。
- **16 列网格**: `grid-template-columns: repeat(16, 1fr); gap: 0`。
- **字体**: Inter Tight (Latin display) / Inter (body) / Noto Sans SC (中文) / JetBrains Mono (数据); 严禁衬线、严禁装饰字体。
- **字号极端反差**: cover 用 9.6vw display, body 14-16px, label 11px uppercase letterspacing 0.08em。
- **键盘 ← / → 切换 + hash 同步**; 角标固定: `№N/N` 右下, topic 标签左下。
- **不许编造**: 数字必须来自用户输入, 图表柱高 = 真实数据按比例。
- 输出单文件 HTML, 不用任何外部图片 URL; 装饰几何 (ASCII 矩阵 / 同心圆) 用纯 CSS 或内联 SVG。
