# 应用组件套件（ui_kits/app）

可直接复用的合约交易产品组件集合，全部绑定 `../../colors_and_type.css` + `../../tokens.css`（提炼后的可移植 token）与 `../../assets/app.css`（真实运行时源，权威取值一致），交互逻辑复用 `../../assets/app.js`，而非重新实现的近似组件。

## Structure

- `index.html` — 套件总览（App 入口），加载 token 样式表并链接下列 5 个分类组件页面，同时内嵌源项目 6 个真实页面作对照。这个 App 目录本身没有拆分独立的 `components/` 子目录——本产品是原生 HTML/CSS/JS 原型（无组件框架证据），因此组件以"每类一个可交互 HTML 页面"的形式组织，而不是虚构不存在的 `components/*.jsx` 文件。
- `buttons-and-forms.html` — 可交互下单表单（价格/数量/比例滑杆联动预计保证金）、杠杆滑块、分段控件、开关、步进器。
- `cards-and-lists.html` — 账户权益卡、历史记录三态切换、保证金占用列表。
- `navigation-and-tabs.html` — 可点击切换的底部 Tab Bar、顶栏、pill/tag 全部语义变体。
- `trading-widgets.html` — 订单簿深度可视化、持仓/委托/策略三态联动面板。
- `overlays.html` — 可打开关闭的底部半高弹层、空状态、提示条、骨架屏。

每张分类页面内部按功能分区（Header / Composer 式的订单输入区 / 列表区），每个功能分区顶部都用 `.group-label` 标注对应的真实来源页面，等效于 Claude Design 风格的 `PreviewCard` 标签组织方式，方便逐块复制。

## Usage

新增交易类页面时：

1. 从最接近的分类页面 copy HTML 结构（class 名保持不变）。
2. `<link rel="stylesheet" href="../../colors_and_type.css" />` + `<link rel="stylesheet" href="../../tokens.css" />` 引入可移植 token；如页面就放在源项目根目录（与 `app-home.html` 同级），改用 `assets/app.css` 一步 import 全部 token 与组件样式。
3. 如需交互（弹层开关、Tab 切换、比例滑杆、提交反馈），`<script src="../../assets/app.js"></script>` 引入共享函数：`openSheet` / `closeSheet` / `setSegment` / `setUnderlineTab` / `initPctSlider` / `simulateSubmit`，可直接 build 在现有函数之上，不必重新 create 一套交互逻辑。

## Design Notes

本套件的布局与视觉全部 based on 源项目已验证过的真实页面（`app-home.html` / `market-list.html` / `contract-workbench.html` / `position-detail.html` / `history.html` / `assets.html`），colors、typography、spacing、圆角/阴影 token 与 `DESIGN.md` §2–§4 完全一致，不额外新增视觉变体。

## 边界

本套件只封装"已被源项目验证过"的组件——即在 6 个真实页面中真实出现过的 UI。不新增源项目未覆盖的组件猜测（例如充值/提现/KYC 流程，PRD 已明确标注不在本期范围）。
