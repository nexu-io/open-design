# Material Web UI Kit

这个目录现在以 GitHub 源码为准，不再把一组手写 React 包装器当作“完整组件库”。

## 主入口

- `index.html`：直接加载固定版本 `@material/web@2.4.1/all.js`，覆盖根目录 `all.ts` 的 43 个公开元素 / 20 个组件家族，并展示适用的变体与状态。
- `../../COMPONENTS.md`：完整覆盖矩阵、公开元素名称、Labs 状态和 Material Web 暂缺能力。
- `Components.jsx`：React 原型组合使用的轻量包装器子集，不作为完整性来源。
- `Showcase.jsx`：历史应用组合示例；完整组件审查应打开 `index.html`。

## GitHub 证据

- 仓库：`material-components/material-web`
- 公开 bundle：根目录 `all.ts`
- 组件文档：`docs/components/*.md`
- 本地有界证据：`context/github/material-components-material-web.md`
- 高信号源码：`context/github/material-components-material-web/files/` 与 `source_examples/`

仓库公开 bundle 包含 Buttons、Checkbox、Chips、Dialog、Divider、Elevation、FAB、Field、Focus ring、Icon、Icon buttons、Lists、Menus、Progress、Radio、Ripple、Select、Slider、Switch、Tabs、Text fields。`labs/` 另外提供 Badge、Card、Item、Navigation bar/drawer/tab 与 Segmented buttons，但不应伪装成稳定公开 API。

## 使用

原型可以直接打开 `index.html`；生产项目不要导入整个 `all.js`，而应从 `@material/web/<family>/<element>.js` 单独导入实际使用的组件。颜色、字体、形状和状态统一通过 `--md-sys-*` token 设置。
