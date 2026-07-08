# Aimeter Design System Package

这是对 `https://aimeter.xk-devops.com/` 程序化提取结果的 AI Optimize 版本，直接在当前设计系统项目内更新，没有创建重复系统。

## 快速使用

1. 在 HTML 原型中引入 `system/variables.css`。
2. 使用 `brand.json` 或 `system/theme.json` 读取机器可读 token。
3. 从 `system/kit.html` / `system/kit.dark.html` 复制组件结构与状态。
4. 新页面先遵循 `DESIGN.md` 的布局、组件、文案和可访问性规则。

## 主要文件

- `DESIGN.md`
- `README.md`
- `SKILL.md`
- `BRAND.md`
- `brand-spec.md`
- `brand.json`
- `brand.html`
- `system/variables.css`
- `system/theme.json`
- `system/index.html`
- `system/kit.html`
- `system/kit.dark.html`
- `context/evidence-summary.md`
- `context/audit-report.md`
- `examples/starter-dashboard.html`
- `source_examples/`
- `fonts/`

## 证据质量

- 已测量: 入口 HTML、主 CSS/JS、39 个 CSS 分包、37 个 JS 分包、7 个字体文件。
- 已保存: Inter 400/500/600/700 和 JetBrains Mono 400/500/600 woff2。
- 未发现: 可下载 logo、产品截图、hero 图像。不要伪造这些资产。

## 维护规则

- 更新 token 时同步 `brand.json`、`system/theme.json` 和 `system/variables.css`。
- 更新组件规范时同步 `DESIGN.md`、`SKILL.md` 和 kit 文件。
- 新增真实资产时写入对应目录，并更新 `brand.json.assets` 与本 README。
