---
name: contract-trading-design-system
description: 合约(永续)交易 App 的深色移动端设计系统 —— 颜色、字体、间距、组件与真实原型证据，供生成新交易类界面或改动本产品时复用
user-invocable: true
---

# 合约产品设计系统 · Agent 使用说明

## What is inside

本包提供合约交易产品的完整可复用设计系统：`colors_and_type.css` 与 `tokens.css`（颜色/字体/间距/圆角 token）、`DESIGN.md`（9 章完整规范）、`preview/` 下 7 张聚焦审查卡片、`ui_kits/app/` 应用组件套件，以及源项目保留的全部原始 assets（`assets/app.css`、`assets/app.js`、`assets/competitors/`）与 6 个真实联动原型页面。

## Source context

来源：OpenDesign 项目「合约产品 PRD 与原型」（`1fd02365-733e-47ce-8be9-53a21cca57c0`），本体位于本地文件夹 `/Users/karp/Code/contract-product-prd`（`importedFrom: folder`）。所有 token 与组件规则均基于该项目下的真实 evidence 提炼，而非凭空设计。

## When to use this skill

当任务涉及本合约交易 App（深色移动端交易界面）的新页面、新组件、prototypes/mockups 迭代或正式 production 界面开发时使用；也适用于评估其它交易类 interfaces/artifacts 是否符合本产品既有视觉语言。

## How to use

1. 读 `DESIGN.md` 全文，重点看 §2 Color、§6 Components、§9 Anti-patterns。
2. 打开 `ui_kits/app/index.html`，从对应组件分类页面复制真实的 HTML 结构与 class 名。
3. Token 绑定：`<link rel="stylesheet" href="colors_and_type.css" />` + `<link rel="stylesheet" href="tokens.css" />`，或在源项目内新增页面时直接引用 `assets/app.css`（权威运行时源，取值一致）。
4. 审查产出时对照 `preview/` 下的卡片与 `README.md` 的 Preview Manifest。

## Design system highlights

- **Colors**：8 个基础 oklch() token（`--bg` / `--bg-elevated` / `--surface` / `--surface-2` / `--fg` / `--muted` / `--border` / `--accent`）+ 3 个语义状态色（`--long` 绿 / `--short` 红 / `--warn` 黄），accent 每屏 ≤2 次。
- **Typography**：`-apple-system` 系统字体栈 + 强制等宽数字（`.num`），22/19/18/15/14/12/9.5px 字号阶梯。
- **Spacing**：8pt 网格（4–48px），移动端安全边距 16px，卡片内边距 14px 例外。
- **Radius & Shadows**：卡片 10px、输入 6px、胶囊 999px、设备外框 12px + `0 12px 32px black/32%` 投影。
- **Layout**：390×844 固定移动端画布，statusbar → content → tabbar 骨架，`.trade-grid` 双栏交易工作台范式。
- **Icons**：描边 SVG，stroke-width 1.6–2，无 emoji。
- **Interaction**：提交类操作统一走"禁用 → spinner → 回调"节奏；弹层 `translateY` 0.22s ease 滑入。

## 硬性规则（违反即视为不合格）

- 所有价格、盈亏、数量、时间戳、订单号必须加 `.num`（等宽 + 表格数字）。
- 不引入紫色渐变、emoji 图标、左侧色条卡片——参见 `DESIGN.md` §9。
- 不要在同一份任务里混用 PRD 线框层（`contract-prototype-board.html` 的浅色 Axure 风格）与产品运行时深色界面的 token。
- 充值/提现/KYC 相关功能明确标注为"不在本期原型范围内"，除非用户提供新证据要求实现，否则不要臆造完整流程。
