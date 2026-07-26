---
name: material-design-3-brand-system-ms19d6py
description: 当用户要使用 Material Design 3 创建 HTML 原型、组件目录、表单、后台、营销页面或演示文稿时，应用这套已打包的设计规范、主题 token、完整 Material Web 公开组件清单和高信号视觉样本。
user-invocable: true
---

# Material Design 3 Brand System

## Use this plugin when

用户明确要求 Material Design、Material Design 3、Material You、M3 Expressive，或需要以 M3 的 surface、shape、type、state 与 responsive 规则构建设计产物时使用。

## Packaged resources

- `DESIGN.md`：七个注册颜色角色、字体、语气、图像和响应式姿态。
- `BRAND.md`：品牌应用与交付检查。
- `brand.json`：机器可读的颜色、字体、语气、布局和六张视觉样本清单。
- `assets/Material-Design-3/colors_and_type.css`：仅使用七个注册颜色的主题、字体、形状、深度和动效 token。
- `assets/Material-Design-3/md-components.css`：按钮、图标按钮、FAB、字段、chips、cards、switch、selection controls、导航与反馈组件样式。
- `assets/Material-Design-3/COMPONENTS.md`：以 `@material/web/all.ts` 为准的 43 个公开元素 / 20 个组件家族，以及 8 个 Labs 家族。
- `assets/Material-Design-3/ui_kits/material-web/index.html`：直接运行固定版本 `@material/web@2.4.1` 的完整公开组件目录，包含状态、变体和交互。
- `imagery/`：六张来自 Material Web Apache-2.0 仓库的组件、状态和主题样本；每张都在 `brand.json` 中说明参考问题。
- `references/material-web/all.ts`：公开 bundle 的源码证据；`SOURCE.md` 固定上游 commit 与图片路径；`LICENSE` 保留 Apache-2.0 许可。

## Workflow

1. 完整读取 `DESIGN.md`、`BRAND.md` 与 `brand.json`，不要重新猜颜色、字体或响应式断点。
2. 读取 `assets/Material-Design-3/COMPONENTS.md`；需要核对公开导出时，再读 `references/material-web/all.ts`。不要把 Labs 当成稳定 API。
3. 在 HTML 的第一个 `<style>` 之前载入 `assets/Material-Design-3/colors_and_type.css`，按需再载入 `md-components.css`。
4. 主题色引用 `var(--md-sys-color-*)`，字号引用 `var(--md-sys-typescale-*)`，形状引用 `var(--md-sys-shape-corner-*)`；不要新增未注册的颜色字面量。
5. 需要官方 Web Components 时，从 `assets/Material-Design-3/ui_kits/material-web/index.html` 复制固定版本 import map 和单个组件用法。生产代码按家族导入实际使用的元素，不要无条件导入整个 `all.js`。
6. 只在图片能回答具体组件、状态或主题问题时使用 `imagery/`；不要把营销封面、网页背景图、头像或图标当作视觉样本。
7. 显示文字用 Google Sans，正文用 Google Sans Text，代码用 Google Sans Mono；本包不再分发 Google 专有字体文件，必须保留声明的系统 fallback。
8. 在 compact `<600px`、medium `600–960px`、expanded `>960px` 三段姿态下重新组织导航与内容；不能把桌面布局硬挤到手机。
9. 交付前检查 48px 触控区、键盘焦点、交互状态、无横向滚动、相对资源路径、中文 alt/caption 与 sentence case。

## Expected output

交付完整、可运行的 HTML 产物；颜色、字体、组件、状态和响应式结构应能追溯到本包资源。若主入口使用 `@material/web`，预览环境需要联网加载固定的 `@material/web@2.4.1`，但设计规范、组件清单、样本和许可说明均随插件本地提供。

## Provenance

设计规范来自 <https://m3.material.io/> 的实测页面；组件完整性和六张视觉样本来自 `material-components/material-web` 的 Apache-2.0 源码，固定 commit 见 `references/material-web/SOURCE.md`。
