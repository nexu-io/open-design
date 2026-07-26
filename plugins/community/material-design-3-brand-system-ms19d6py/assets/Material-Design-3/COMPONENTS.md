# Material Web 组件覆盖清单

来源：`material-components/material-web` 仓库 `main` 分支，2026-07-26 通过 GitHub CLI 浅克隆取证。公开组件以根目录 `all.ts` 为准；组件文档以 `docs/components/` 为准。仓库当前处于 maintenance mode，因此“Material 3 规范存在”不等于“Material Web 已实现”。

## 公开组件：43 个元素 / 20 个家族

| 家族 | 公开元素 | 主要变体与状态 | 本包入口 |
| --- | --- | --- | --- |
| Buttons | `md-elevated-button`, `md-filled-button`, `md-filled-tonal-button`, `md-outlined-button`, `md-text-button` | leading/trailing icon、disabled | `ui_kits/material-web/index.html#buttons` |
| Checkbox | `md-checkbox` | checked、indeterminate、disabled | `#selection-controls` |
| Chips | `md-assist-chip`, `md-chip-set`, `md-filter-chip`, `md-input-chip`, `md-suggestion-chip` | selected、removable、icon | `#chips` |
| Dialog | `md-dialog` | alert、actions、scrim | `#dialogs` |
| Divider | `md-divider` | full-width、inset | `#lists` |
| Elevation | `md-elevation` | level 0–5 | `#interaction-foundations` |
| FAB | `md-fab`, `md-branded-fab` | small、regular、large、extended | `#fab` |
| Field primitives | `md-filled-field`, `md-outlined-field` | label、supporting、error foundation | `#fields` |
| Focus | `md-focus-ring` | inward、outward、visible | `#interaction-foundations` |
| Icon | `md-icon` | outlined、filled via font axes | 全目录 |
| Icon buttons | `md-icon-button`, `md-filled-icon-button`, `md-filled-tonal-icon-button`, `md-outlined-icon-button` | toggle、selected、disabled | `#icon-buttons` |
| Lists | `md-list`, `md-list-item` | 1/2/3-line、leading/trailing、disabled | `#lists` |
| Menus | `md-menu`, `md-menu-item`, `md-sub-menu` | anchored、submenu、disabled | `#menus` |
| Progress | `md-circular-progress`, `md-linear-progress` | determinate、indeterminate | `#progress` |
| Radio | `md-radio` | selected、disabled、group | `#selection-controls` |
| Ripple | `md-ripple` | bounded、unbounded | `#interaction-foundations` |
| Select | `md-filled-select`, `md-outlined-select`, `md-select-option` | leading icon、supporting、error | `#selects` |
| Slider | `md-slider` | single、range、ticks、disabled | `#sliders` |
| Switch | `md-switch` | selected、icons、disabled | `#selection-controls` |
| Tabs | `md-tabs`, `md-primary-tab`, `md-secondary-tab` | primary、secondary、scrollable | `#tabs` |
| Text fields | `md-filled-text-field`, `md-outlined-text-field` | text/textarea/email/password/search、supporting、prefix/suffix、error | `#text-fields` |

## Labs：8 个组件家族

这些目录存在于仓库 `labs/`，但不在公开 `all.ts` bundle 中；本包把它们标为实验性，不伪装成稳定组件。

| 家族 | 源码目录 | 状态 |
| --- | --- | --- |
| Badge | `labs/badge/` | Labs |
| Card | `labs/card/` | Labs |
| Item primitive | `labs/item/` | Labs |
| Navigation bar | `labs/navigationbar/` | Labs |
| Navigation drawer | `labs/navigationdrawer/` | Labs |
| Navigation tab | `labs/navigationtab/` | Labs |
| Segmented button | `labs/segmentedbutton/` | Labs |
| Segmented button set | `labs/segmentedbuttonset/` | Labs |

`labs/gb/` 还包含下一代 badge、button、card、icon button、menu、split button 和新 token 体系；本包只记录其目录与稳定性，不把 Labs 当作公开 API。

## 规范有、Material Web 暂无

Material 3 网站还描述了更多模式和组件；不要把它们虚构成 `@material/web` 导出。需要这些能力时，应选择对应平台实现或在产品层自行组合，并明确标记为“非 Material Web 官方组件”。典型缺口包括完整导航套件、日期/时间选择、搜索、bottom/side sheet、tooltip、carousel、data table 与部分 M3 Expressive 新组件。

## 实现原则

1. 原型可使用 `@material/web/all.js`；生产只导入实际使用的独立组件。
2. 组件颜色、字体与形状通过 `--md-sys-*` token 绑定，不在组件内部散落 raw hex。
3. 每个可交互示例至少展示 default、hover/focus 可达、selected/active、disabled 或 error 中适用的状态。
4. 完整性以本文件、`ui_kits/material-web/index.html` 和 `../../references/material-web/all.ts` 为准；本包不提供额外的 React 包装器。
