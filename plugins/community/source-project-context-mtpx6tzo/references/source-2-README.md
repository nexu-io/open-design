# 合约产品设计系统（Contract Trading Product Design System）

## Product Overview

这是一款 USDT 本位永续合约交易 App 的设计系统包，源自 OpenDesign 项目「合约产品 PRD 与原型」。该产品面向个人加密货币衍生品交易者，includes（核心能力）：行情浏览与自选、限价/市价/冰山三种下单模式的合约工作台（含订单簿深度可视化与杠杆/保证金模式设置）、持仓与仓位详情管理、历史仓位/委托/成交/策略/资金流水查询，以及账户资产总览。界面为深色移动端（390×844），支持底部弹层与近全屏抽屉两种交互模式。产品目前明确不包含充值/提现/身份认证功能。

## Source Context

来源：OpenDesign 项目「合约产品 PRD 与原型」（`1fd02365-733e-47ce-8be9-53a21cca57c0`），originally imported from local folder `/Users/karp/Code/contract-product-prd`。全部 token 与组件规则直接取自该 repository 下的真实交付物（`assets/app.css` 运行时样式表、6 个联动原型页面、PRD 文档），详见 `context/source-context.md` 与 `context/provenance.md` 逐条出处记录。

## Package Contents

```
DESIGN.md               完整设计规范（9 章：主题/色彩/字体/间距/布局/组件/动效/文案/反模式）
SKILL.md                给 AI Agent 的使用说明（含 Claude 风格 frontmatter）
colors_and_type.css      可移植基础层：颜色 + 字体 token（从 assets/app.css 提炼，含 sRGB 回退色值）
tokens.css               间距 / 圆角 / 阴影 / 动效 token
context/
  source-context.md      来源项目元数据
  provenance.md           每条视觉结论对应的源文件出处
preview/                 7 张聚焦审查卡片
ui_kits/app/             应用组件套件（index.html + 5 个分类组件页 + README.md）
assets/                  preserved runtime source assets (只读，不要覆盖)
  app.css                【保留】原型运行时共享样式表（真实来源，只读）
  app.js                  【保留】原型交互脚本
  competitors/            【保留】OKX / UEEX / Binance 竞品截图（118 张）
```

以下为源项目原始交付物，完整保留在根目录，供追溯与复用：`app-home.html`、`market-list.html`、`contract-workbench.html`、`position-detail.html`、`history.html`、`assets.html`（6 个真实联动页面）、`contract-prototype-board.html` / `contract-prototype-board-v2.html`（评审平铺画布）、`index.html` / `okx.html` / `ueex.html` / `binance.html`（竞品调研站）、`brand-spec.md`（Axure 线框视觉规范）、`contract-product-prd-draft.md` / `contract-product-prd-draft-1.md`（PRD 全文）、`ueex-competitor-architecture.md`、`image.png` / `image-1.png` / `image-2.png`（源项目截图证据）。

## Preview Manifest

| 文件 | 内容 |
|---|---|
| `preview/colors-primary.html` | 8 个基础色 + 3 个语义状态色 + soft 派生态 |
| `preview/typography-specimens.html` | 字体栈、字号阶梯、`.num` 等宽数字规则 |
| `preview/spacing-tokens.html` | 间距阶梯、卡片内边距例外、触控目标 |
| `preview/radius-shadows.html` | 圆角 token、设备投影、遮罩阴影 |
| `preview/components-buttons.html` | 按钮全变体 + 表单控件（输入框/滑杆/杠杆/开关/步进器/分段控件）|
| `preview/components-cards.html` | 持仓卡、列表行、下划线 Tab、订单簿、空状态、提示条 |
| `preview/brand-assets.html` | 应用内图标集、设备外框、竞品截图（标注非本产品品牌）|
| `preview/applied-ui-surfaces.html` | 6 个真实联动页面内嵌预览 |

## Review Workflow

1. 先 open `preview/applied-ui-surfaces.html` 看真实界面整体效果，再逐张 review 其余 6 张 token/组件卡片。
2. 需要 reuse 组件时，start with `ui_kits/app/index.html`，从对应分类页面 copy HTML 结构，load `colors_and_type.css` + `tokens.css`（或源项目内直接 `assets/`）获取全部 token。
3. 新增/改动页面前先 inspect `DESIGN.md` §9 反模式，避免重复已知问题。
4. 不要修改 `assets/app.css` 与 6 个已联动的 App 页面——它们是只读源证据，扩展应新建文件。

## 已知缺口

未发现浅色模式、reduced-motion、产品 Logo/品牌字体、桌面端断点的证据，详见 `DESIGN.md` 末尾"未解决事项"一节。这些不是遗漏，而是如实标注为待补充信息，避免虚构。
