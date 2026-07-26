---
name: "Material Design"
category: Brands
surface: web
colors:
  m3-background: "#fefbff"
  surface-1: "#f8f1f6"
  on-surface: "#1c1b1d"
  on-surface-variant: "#4d4256"
  surface-4: "#e6e1e3"
  primary: "#6442d6"
  primary-container: "#9f86ff"
---

# Material Design

> Category: Brands

> Surface: web

*Google’s open-source design system*

Material Design 3 - Google's open-source design system, provides comprehensive guidelines, styles, & components to create user-friendly interfaces.

## Color Palette

| Role | Name | Hex | Usage |
| --- | --- | --- | --- |
| background | M3 Background | `#fefbff` | 官网主画布；实测 --mio-theme-color-background |
| surface | Surface 1 | `#f8f1f6` | 卡片与分层表面；实测 --mio-theme-color-surface-1 |
| foreground | On surface | `#1c1b1d` | 正文与标题；实测 --mio-theme-color-on-background / on-surface |
| muted | On surface variant | `#4d4256` | 次级文本与导航文字；实测 --mio-theme-color-on-surface-variant |
| border | Surface 4 | `#e6e1e3` | 分隔线与低强调边界；实测 --mio-theme-color-surface-4 |
| accent | Primary | `#6442d6` | 主操作与链接；实测 --mio-theme-color-primary |
| accent-secondary | Primary container | `#9f86ff` | 强调容器与高亮表面；实测 --mio-theme-color-primary-container |

## Typography
- **Display:** Google Sans — weights 400, 475, 500, 700 — fallbacks: system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif (官网计算样式实测；显示级使用 Google Sans，标题权重常为 475。)
- **Body:** Google Sans Text — weights 400, 500, 700 — fallbacks: system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif (官网计算样式实测；正文 16px/24px，导航和标签使用 500。)
- **Mono:** Google Sans Mono — weights 400, 500 — fallbacks: ui-monospace, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace (官网 token --mio-theme-mono-font-family；代码和代码片段使用。)

## Voice & Tone

- **Adjectives:** 清晰, 克制, 指导性, 自适应, 富有表现力
- **Tone:** 平静、讲解式、面向实践；用简单的现在时主动句帮助人们开始构建，同时允许 M3 Expressive 在颜色、形状和动效中传达情绪。

### Messaging pillars
- Foundations、styles、components 三部分组织方式
- Personal、adaptive、expressive experiences
- Design guidance、specs 与 open-source code
- M3 Expressive：用情绪增强可用性与产品欲望

### Vocabulary
- **Use:** Get started, Explore, Design, Develop, Foundations, Styles, Components, adaptive, expressive, open-source
- **Avoid:** Click here, 空泛的营销夸张语, 产品 chrome 中使用 Title Case, emoji 作为界面图标

## Imagery

- **Style:** 以真实产品界面、组件状态和自适应布局为主；图像必须能回答组件如何组合、状态如何变化、布局如何跨尺寸迁移。
- **Subjects:** 移动与大屏产品界面, Material Web 公开组件与状态, 动态主题在真实产品中的应用, 紧凑、medium、expanded 自适应产品布局
- **Treatment:** 优先使用官方文档 hero、真实产品截图和跨断点对照；每张图都标明所证明的组件、状态或布局规则。
- **Avoid:** 只有颜色和形状、却不能指导界面设计的网页背景图, 把营销封面或 OG 图片当作组件参考, 图标、头像、精灵图和跟踪像素作为主图

## Layout

- **Radius:** 8px default；4px–28px token scale，满圆 9999px
- **Border weight:** 1px
- **Spacing:** 8px baseline grid，允许 4px half-step

### Posture rules
- 浅色画布使用 #FEFBFF，surface-1 至 surface-4 逐级建立层次；优先 tonal surface，少用阴影。
- 导航与内容按 compact <600px、medium 600–960px、expanded >960px 自适应；大屏内容保持约 1200px 上限。
- 标题使用 Google Sans（官网实测 display 96px/72px/57px，常用权重 475），正文使用 Google Sans Text 16px/24px。
- 交互元素至少 48px 触控区域；官网实测搜索按钮 56×56px、主导航项约 80×60px。
- 界面文案使用 sentence case、主动动词与短句；把表现力放在颜色、形状与动效而不是口号上。
