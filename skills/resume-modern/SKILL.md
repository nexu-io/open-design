---
name: resume-modern
zh_name: "极简简历"
en_name: "Modern Resume"
emoji: "📄"
description: "现代极简简历, A4 单页, 适合打印或导出 PDF"
category: resume
scenario: personal
aspect_hint: "A4 (210×297mm)"
recommended: 12
tags: ["resume", "cv", "简历"]
example_id: sample-resume-frontend
example_name: "极简简历 · 前端工程师"
example_format: markdown
example_tagline: "A4 单页, 可打印 / 导出 PDF"
example_desc: "高级前端工程师简历, 两栏布局, 数字成就高亮"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: personal
  featured: 12
  upstream: "https://github.com/nexu-io/html-anything"
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "用「极简简历」模板把我的内容做成一份「现代极简简历, A4 单页, 适合打印或导出 PDF」。保持模板的视觉签名，使用真实内容和数据，避免 lorem ipsum 和占位图片。"
---

【模板: 现代极简简历】
- 容器宽度模拟 A4: `w-[210mm] min-h-[297mm] mx-auto`, 内边距 16-20mm。
- 顶部姓名巨大 (text-4xl), 底下一行 contact (邮箱 / 电话 / 城市 / GitHub / LinkedIn), 中间用细竖线分隔。
- 主体两栏可选: 左 60% 主线（经历/项目/教育）, 右 40% 副线（技能/语言/获奖）。
- 章节标题: small caps 风格, 上方一条短 accent 线 (w-8 h-0.5)。
- 经历每条: 公司 + 职位 + 时间区间 (右对齐), 下方 1-3 条 bullet 用动词开头。
- 不使用花哨颜色, 黑白灰 + 1 个 accent (深蓝 / 墨绿)。
- 添加 @media print 样式, 隐藏不必要的元素, 颜色保留。
