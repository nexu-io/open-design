# Material Inbox 应用 UI Kit

这是一个应用了 Android Material 3 语义、组件状态和自适应 list-detail 结构的浏览器示例。它不是静态截图：入口会实际加载 React/Babel 组件并挂载 `App`。

## Kit structure

- `index.html`：浏览器入口；加载 `../../colors_and_type.css`、`app.css`、React、ReactDOM、Babel 和全部组件。
- `app.css`：应用壳层、组件、compact/medium/expanded 响应式规则。
- `components/App.jsx`：状态与组合根；负责筛选、选择、归档、回复、写信和 snackbar。
- `components/NavigationRail.jsx`：expanded/medium rail、compact top bar 与 bottom navigation。
- `components/MailList.jsx`：搜索、未读筛选、列表和空状态。
- `components/MessageDetail.jsx`：邮件详情、检查项、回复与归档操作。
- `components/ComposerDialog.jsx`：可编辑写信 dialog、必填校验、发送/草稿动作。
- `components/Snackbar.jsx`：短时反馈与撤销操作。

每个直接加载的 JSX 文件都通过 `window.ComponentName` 暴露组件；`App.jsx` 组合其他角色组件并赋值 `window.App`。

## Components

- 壳层：`App.jsx` + `NavigationRail.jsx`。
- 内容：`MailList.jsx` + `MessageDetail.jsx`。
- 任务与反馈：`ComposerDialog.jsx` + `Snackbar.jsx`。
- 所有组件都由 `index.html` 直接加载，并由 `App` 组合成一个可运行界面。

## Usage

Reuse 时先 import `colors_and_type.css`，再 compose 需要的 components；不要 copy 示例业务数据到不相关产品。

1. 打开 `index.html`，确认应用能挂载。
2. 在 compact、medium、expanded 宽度下分别检查导航与 list-detail 行为。
3. 使用搜索、未读筛选、邮件选择、归档/撤销、回复和写信表单。
4. 为新产品替换真实业务信息架构、数据与文案，同时保留语义 token、状态和可访问结构。
5. 若改动基础 token，先更新 `colors_and_type.css` 与 `DESIGN.md`，再更新本 kit。

## Design notes

- compact `<600px` 在列表与详情之间切换，使用 top app bar + bottom navigation；不是缩小的三栏布局。
- medium `600–839px` 保留 navigation rail，并在列表/详情单 pane 间切换；expanded `>=840px` 同时显示 list-detail。
- Filled action 只用于“回复/发送”等主要任务；归档使用 outlined 或 icon action。
- tonal surfaces 建立层级，阴影仅用于 FAB、dialog 和 snackbar。
- 48px 命中区域、可见焦点、表单错误文本和 `aria-live` snackbar 是交付的一部分。
- UI 内没有断点选择器、token 设置或 demo 元数据；这是可被替换内容的真实产品壳层。

## Source basis

- `../../DESIGN.md`
- `../../colors_and_type.css`
- `../../context/official/material-3-evidence.md`
- 官方 canonical list-detail、window size classes、navigation、text field、button 和 state guidance。

setup 没有提供真实邮件产品代码，因此这些组件是根据官方 Material 3 规则创作的 applied example，不应被描述为某个来源仓库的原始组件。
