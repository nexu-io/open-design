---
name: material-design-3-brand-system
description: 使用从 m3.material.io 实测增补的 Material Design 3 设计系统，构建清晰、可适配、富有表现力的 HTML 界面与原型。
user-invocable: true
---

# Material Design 3 Brand System

## What is inside

- `DESIGN.md`：颜色、字体、形状、阴影、动效、响应式姿态的规范来源。
- `BRAND.md`：语气、图像、标识、布局与交付检查。
- `brand.json`：七角色摘要、OKLCH、typography、voice、imagery、layout 与 `seed` 控制项。
- `assets/Material-Design-3/colors_and_type.css`：完整 M3 token；`md-components.css`：按钮、卡片、芯片、字段、导航等组件样式。
- `assets/Material-Design-3/preview/`：36 张聚焦预览卡片，覆盖 Brand、Color、Components、Foundations。
- `assets/Material-Design-3/ui_kits/material-web/`、`reply/`、`app/`：可运行示例与应用入口。
- `logos/`、`imagery/`、`fonts/`：随项目保存的真实来源资产。

## Source context

本系统来自 `https://m3.material.io/` 与 `material-components/material-web`。颜色、字体和布局由官网计算样式交叉测量；组件完整性由 GitHub 根目录 `all.ts` 与 `docs/components/` 取证，当前为 43 个公开元素 / 20 个家族，另有 8 个 Labs 家族。

## When to use this skill

当要创建 Material Design 3 的 Web 原型、营销页、后台、邮件、表单、幻灯片或组件示例时使用。若产品已有自身语气，保留本系统的 surface、shape、type、state 与 responsive 规则，仅替换产品文案与内容层。

## How to use

1. 读取 `DESIGN.md`、`BRAND.md`、`brand.json`；不要重新猜颜色。
2. 在 `<head>` 中载入 `assets/Material-Design-3/colors_and_type.css` 和需要的 `md-components.css`。
3. 主题色引用 `var(--md-sys-color-*)`，字号引用 `var(--md-sys-typescale-*)`，形状引用 `var(--md-sys-shape-corner-*)`，深度优先使用 surface containers。
4. 显示文字用 Google Sans，正文用 Google Sans Text，代码用 Google Sans Mono；fallback 为 `system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif`。
5. 采用 compact `<600px`、medium `600–960px`、expanded `>960px` 三段姿态；导航从底部栏过渡到 rail/drawer，不能把桌面布局硬挤到手机。
6. 先读 `assets/Material-Design-3/COMPONENTS.md`，再从 `ui_kits/material-web/` 或 `ui_kits/reply/` 复制组件；图像只从 `imagery/` 的高信号样本复制。
7. 交付前检查 48px 触控区、焦点 ring、ripple、无横向滚动、真实图片路径、中文 alt/caption 与 sentence case。

## Design system highlights

- **Color:** 默认浅色画布 `#FEFBFF`、surface-1 `#F8F1F6`、on-surface `#1C1B1D`、primary `#6442D6`、primary-container `#9F86FF`；完整暗色/Reply 角色仍在 token 文件中。
- **Type:** 官网 H1 96px/权重 475，H2 57px/64px，正文 16px/24px；字重与 optical size 走 token。
- **Shape:** 4/8/12/16/28px 与 full 形状 token；按钮常用 full，卡片常用 medium。
- **Elevation:** 先用 surface container 的色调层级，悬浮内容才使用 level 1–5 阴影。
- **Motion:** 标准 emphasized easing，短/中/长 duration；Expressive 的弹簧只用于选择、刷新等值得庆祝的时刻。
- **Imagery:** 官方组件状态、真实产品截图、动态主题和跨断点布局；网页背景图与营销封面只留作 source capture，不进入视觉样本。
- **Voice:** 清晰、平静、主动、面向实践；文案负责解释，颜色/形状/动效负责情绪。

## Preview and kit paths

从 `assets/Material-Design-3/COMPONENTS.md` 确认覆盖与稳定性；`ui_kits/material-web/index.html` 是完整官方组件目录，`ui_kits/reply/index.html` 展示自适应产品壳层，`ui_kits/app/index.html` 是轻量应用入口。

## Provenance

Formalized by Open Design from candidate b8ac01a8-87ff-4f51-b843-1ec12500a1b9.
