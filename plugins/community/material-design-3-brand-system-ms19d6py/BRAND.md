# Material Design 3 品牌指南

这套设计系统来自 [m3.material.io](https://m3.material.io/)，以官网 2026-07-26 的真实计算样式、源码快照和页面资产为证据。它不是单一产品品牌，而是一套可以落到 Android、Flutter、Web 与大屏体验的设计语言。

## 一句话系统

用接近白色的动态表面、Google Sans 字体、8px 节奏与一枚克制的紫色主色，把清晰的指导、可适配的结构和有情绪的 Expressive 视觉放在同一个系统里。

## 角色与 token

- 画布 `#FEFBFF`，卡片起始层 `#F8F1F6`。
- 标题与正文 `#1C1B1D`，次级文字 `#4D4256`。
- 分隔线使用 `#E6E1E3`，主操作使用 `#6442D6`，高亮容器使用 `#9F86FF`。
- 生产实现优先引用 `colors_and_type.css` 的 `--md-sys-color-*`，不要把角色转成散落的硬编码颜色。

## 字体

显示级用 `Google Sans`，正文用 `Google Sans Text`，代码用 `Google Sans Mono`。官网实测 H1 为 96px、权重 475，H2 为 57px/64px；正文为 16px/24px。缺少 webfont 时回退到 `system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif`。

## 语气

像一位耐心、清楚的同事：先解释，再给动作。使用主动语态、现在时和 sentence case；按钮以动作开头，通常 1–3 个词。可以说“开始构建”“探索组件”“查看指南”，不要说“点击这里”或用空泛的超级lative。界面 chrome 不使用 emoji。

## 图像

只保留能指导界面设计的样本：官方组件状态、主题应用和组件层级。网页背景图、营销封面、OG 图片、头像和无法确认再分发权的截图不进入视觉样本模块。

## 布局与交互

采用 8px baseline grid（可用 4px half-step），大屏内容约束在 1200px。compact `<600px`、medium `600–960px`、expanded `>960px` 时切换导航、列数和图像裁切。所有控件至少 48px 触控区域；`md-components.css` 对按钮、图标按钮和 FAB 提供 48px 盒子，对 chip、switch、checkbox、radio 提供 hit-slope；checkbox/radio 放进 `.md-control-label` 标签或 `.md-touch-target` 包装器。交互采用 state layer、ripple、2px focus ring，深度首先来自 surface containers，其次才是阴影。

## 资产目录

- `imagery/`：Material Web Apache-2.0 源码仓库中的六张组件、状态和主题样本；确切来源见 `references/material-web/SOURCE.md`。
- 本插件不分发 Google Sans 字体或 Material logo 文件；使用品牌名称时只作来源标识，并保留系统 fallback。
- `assets/Material-Design-3/COMPONENTS.md`：43 个公开元素 / 20 个家族，以及 8 个 Labs 家族的完整覆盖矩阵。
- `assets/Material-Design-3/`：七角色 token、组件目录和 Material Web UI kit。

## 交付前检查

1. 所有颜色来自七个品牌角色或完整 M3 token，不写新的随机 hex。
2. 显示/正文/等宽字体绑定正确，字号与 line-height 不把内容挤出容器。
3. 在 360、600、960、1200、1920px 检查无横向滚动与意外遮挡。
4. 图像使用相对路径、具备中文 alt/caption，避免把图标或头像当 hero。
5. 交互控件满足 48px 触控尺寸、键盘焦点可见、文案为 sentence case；自定义小尺寸控件使用 `.md-touch-target` 或内置 hit-slope，不直接缩小命中区域。
