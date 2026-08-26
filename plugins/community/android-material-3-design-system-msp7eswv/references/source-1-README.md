# Android Material 3 Design System

这是一套可被 Open Design 项目直接复用的 Material 3 设计系统包。它把官方 AndroidX baseline color roles、Material type scale、shape scale、自适应 window size classes、状态层和 motion guidance 汇总成清晰规则、CSS 令牌、聚焦预览与一个可运行的响应式 UI Kit。

## Product Overview

Material 3 是 Google 面向数字产品的开源设计系统，围绕颜色、排版、形状、组件、布局与动效建立一致的产品语言。当前 Android 实现以 Jetpack Compose Material 3 为核心，并支持 Android 12+ 动态色；Web 项目可复用同一语义角色与自适应原则，但不应冒充原生控件。

技术定位：这个 `product platform` supports Android app 与响应式 Web interface，provides 可复用主题规则，并 includes 自适应壳层、任务组件和交互状态。

本包覆盖的主要产品表面与能力来自官方 Material 3/Android 资料：

- 应用壳层：top app bar、bottom navigation、navigation rail、permanent drawer。
- 信息布局：feed、list-detail、supporting pane 三种 canonical layout。
- 任务组件：buttons、FAB、chips、cards、lists、text fields、dialogs、snackbar、progress。
- 主题能力：完整 light/dark color roles、动态色回退、15 级 type scale、shape scale、tonal elevation。
- 自适应能力：compact、medium、expanded、large、extra-large 窗口级别；按可用窗口而非设备型号切换。
- 交互能力：enabled、disabled、hover、focus、pressed、dragged 状态；standard / expressive motion；reduced motion。

来源上下文与原始快照见：

- `context/source-context.md`
- `context/evidence-inventory.md`
- `context/official/material-3-evidence.md`
- `context/official/androidx/PaletteTokens.kt`
- `context/official/androidx/ColorLightTokens.kt`
- `context/official/androidx/ColorDarkTokens.kt`
- `PROVENANCE.md`

setup 未关联产品仓库、本地代码、Figma、字体或 build/runtime 资产，因此本包不会伪造 `source_examples/`、`fonts/` 或 `build/`。若未来 intake 获得这些证据，应先保留原件，再同步更新文档和预览。

## Package contents

- `DESIGN.md`：规范的唯一规则源，包含产品语境、颜色、排版、间距、布局、组件、动效、文案与反模式。
- `colors_and_type.css`：可直接引入的 light/dark 语义颜色、字体、间距、形状、状态、阴影和动效令牌。
- `SKILL.md`：供后续 agent 使用的设计系统 skill 入口。
- `PROVENANCE.md`：来源、资产哈希与证据边界。
- `assets/`：从官方 Material 3 站点原样保存的来源识别资产。
- `preview/`：Design System 标签页可审查的聚焦预览卡。
- `ui_kits/app/`：可运行、可交互、响应式 list-detail 邮件工作台示例。
- `context/`：setup 上下文、官方资料摘要和 AndroidX token 快照。

当前没有 `build/`、`fonts/`、`source_examples/`；这是证据边界，不是缺失交付。

## Preview Manifest

| Preview path | 审查重点 | 展示的来源依据 |
|---|---|---|
| `preview/colors-primary.html` | primary / secondary / tertiary / error 角色是否按 `on-*` 成对使用 | AndroidX `PaletteTokens` 与 color role guidance |
| `preview/colors-theme-light.html` | light surface hierarchy、边界和强调层级 | `ColorLightTokens.kt` 的 surface/container roles |
| `preview/colors-theme-dark.html` | dark surface hierarchy、对比与 tonal elevation | `ColorDarkTokens.kt` 的 dark role mapping |
| `preview/typography-specimens.html` | 15 级 type scale、中文回退和真实 UI 文案 | Compose Material 3 默认 typography scale |
| `preview/spacing-tokens.html` | 4dp 网格、页面/组件间距与 48dp touch target | Material layout 与 accessibility guidance |
| `preview/spacing-radius.html` | 4/8/12/16/24/full shape scale 的组件分工 | Compose `Shapes` 默认尺度 |
| `preview/spacing-shadows.html` | tonal elevation 优先、level 0–3 阴影使用边界 | Material 3 elevation guidance |
| `preview/components-buttons.html` | Filled、tonal、outlined、text、FAB 与交互状态 | Material 3 button families、state layers |
| `preview/components-inputs.html` | filled/outlined fields、label、helper、error、validation | Material text-field roles 与可访问性要求 |
| `preview/components-navigation-adaptive.html` | compact bar、medium rail、expanded list-detail 的结构变化 | window size classes 与 canonical layouts |
| `preview/brand-assets.html` | 官方来源识别资产是否真实加载、边界是否写清 | `assets/m3-favicon.*` 与 `PROVENANCE.md` |

`preview/preview.css` 是全部预览卡共享的样式层，不是独立预览卡。

## Reuse workflow

1. 先读 `DESIGN.md`，理解语义角色、组件约束和自适应规则。
2. 在页面或原型中引入 `colors_and_type.css`；组件只引用 `--md-sys-*`，不要散落硬编码颜色。
3. 若产品有品牌来源色，用 Material Theme Builder 或实现端色彩工具生成完整 light/dark scheme，并覆盖语义 token，而不是只替换 `primary`。
4. 从 `ui_kits/app/` 复用 app shell、响应式布局与交互写法；替换为真实产品信息架构和文案。
5. 打开 `preview/` 中相关卡片做视觉对照；新增 token 或组件时同步新增/更新聚焦预览。
6. 验证 compact / medium / expanded，键盘焦点，48dp 目标，对比度，错误状态和 reduced motion。

## Theme integration

```html
<link rel="stylesheet" href="colors_and_type.css">
<main data-theme="light">…</main>
```

切换暗色时在应用根节点设置 `data-theme="dark"`。原生 Android 应使用 `MaterialTheme(colorScheme, typography, shapes, motionScheme)`；本 CSS 是 Web/Open Design 映射。

## Maintenance rules

- `DESIGN.md` 是 canonical rules；任何偏离必须有真实产品证据。
- `README.md` 的 Preview Manifest 必须与实际 `preview/*.html` 一一对应。
- 新增来源资产时记录原始路径和哈希，禁止重绘后冒充源文件。
- 只有 `context/.../files/build/...` 存在时才创建根 `build/` 并逐字节复制代表性 runtime 资产。
- 只有真实字体文件被采集时才创建 `fonts/` 并在 `colors_and_type.css` 中绑定。
- 只有 substantial source component 被采集时才创建 `source_examples/`；不要写空壳示例。
- 预览用于审核设计系统；真实 UI Kit 不得暴露断点选择器、token 面板或生成过程元数据。

## Licensing and attribution

Material Design、Android 和相关标识属于各自权利人。本包保留的 favicon 仅用于说明来源，不能被当作新产品品牌资产。AndroidX token 快照包含其原始 Apache 2.0 许可头。使用者应按官方许可和品牌指南评估生产使用。
