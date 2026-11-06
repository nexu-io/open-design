# OpenDesign UI v1

从 `~/.superset/projects/personal-video-agent` 的 OpenDesign TV 设计体系提取，2026-11-03。编辑器样式沿用 `cosmic-spur-b7e30202` 参考工作区；接入内容与结构对齐 personal-video-agent 的 `integration-hub.tsx` 和 `connect.css`。设计变量、字体和基础控件可独立复用；编辑器与接入弹框由本仓库的 React 前端实现。

源工程参考文件：`apps/web/design-system/{tokens.json,base.css,controls.css,fonts.css}`、`docs/design-system.md` 与 `docs/screenshots/opendesign-editor.jpg`。当前展示品牌统一为 OpenDesign；共享图标为本项目自绘的 24 单位线性 SVG。产品流程见 [产品架构](product/architecture.md)。

## 视觉规范

| 用途 | 浅色 | 深色 |
| --- | --- | --- |
| 工作区 | `#ededed` | `#202020` |
| 面板 | `#fafafa` | `#353535` |
| 浮层 | `#ffffff` | `#353535` |
| 输入底色 | `#f5f5f5` | `#292929` |
| 正文 | `#494949` | `#ededed` |
| 辅助文字 | `#696969` | `#c0c0c0` |
| 选中与焦点 | `#007106` | `#adf788` |
| 主操作 | `#202020` | `#ededed` |

品牌绿为 `#87ea5c`。绿色用于焦点、选中态、标题高亮与创作辅助；主要操作采用中性色。工作区以 1px 分隔线划分，界面背景保持平整。

字体继承参考项目：Albert Sans / 苹方用于界面，Georgia / 宋体用于引导标题，IBM Plex Mono 用于时间码、编号与数值。本地字体及 SIL OFL 许可保存在 `web/design-system/fonts/`。

- 正文 14px、控件 13px、说明 12px、密集标注至少 11px；标题 16 / 20 / 24 / 32px。
- 常用间距 4 / 8 / 12 / 16 / 24 / 32px；圆角 8px 控件、12px 卡片、16px 面板、24px 外壳。
- 标准控件 36px、紧凑控件 28px、图标按钮 32px；编辑器单行顶栏 52px、面板标签栏 34px。
- 常规反馈 150 / 200ms，点阵加载 1043ms；减少动态效果偏好停用循环动画。
- 编辑器沿用 Studio 原生主题开关与 `hf-studio-ui-preferences`；设计系统独立目录仍可使用 `theme.js` 的系统外观模式。

## 首页与全局导航

首页使用居中内容区、大尺寸新建入口、最近项目、分类模板与底部创作输入，沿用本仓库主题与字体。按用户反馈移除宣传标题和解释段落，仅保留功能标签。共享侧栏位于最左侧，展开 224px、收起完全隐藏；760px 以下为抽屉。主区域贴齐视口，移除全局顶栏和外层圆角容器；连接 Agent、模型设置、主题、语言收纳到侧栏。

会话与浏览器从视口顶部并列，标题栏和标签栏同为 40px、使用 `--motion-inset` 底色，以 1px 线分隔；项目工具栏属于右侧 Artifact Viewer。浏览器提供 Tabs、地址栏、新 Tab 与关闭入口。展开/恢复控件与关闭按钮固定在标签栏最右侧，顺序为展开/恢复、关闭；展开采用四角外扩图标，恢复采用内收图标，窄屏使用会话返回图标。会话默认宽 340px，可调整至 280–480px（不超过可用宽度的 42%）；可用宽度不足 900px 时切换会话/浏览器。关闭任一侧保留另一个可用区域，恢复保留宽度和 Tabs；仅隐藏编辑器时不重挂载播放器与 Dock。侧栏品牌为 OpenDesign，移除品牌旁重复收起箭头，全局导航按钮放在会话顶部，会话隐藏时放到浏览器顶部，首页使用左上角局部按钮。侧栏收起没有残留图标栏。浏览器使用紧凑标签、独立导航按钮组和圆角地址栏；选中 Tab 自动滚动到可见区域。

新建入口使用点阵底纹；项目卡片采用工程图标，避免把图标当作实际影片截图。模板使用已有真实封面，`kind=builtin` 显示「可以二次剪辑」；首页统一先选择模板，再从 Motion 模式输入框提交为会话，接入弹框保留复制指令。详情见 [首页与项目会话](project-workspace.md)。

## 文件与职责

```text
web/design-system/
  tokens.json     唯一设计变量源，双主题与提取来源
  tokens.css      从 JSON 生成，不手工修改
  ui.css          可移植样式入口
  fonts.css       本地字体声明
  base.css        作用域基础样式、焦点、减少动态效果
  controls.css    按钮、输入、标签、空态、进度、加载
  icons.svg       共享线性图标
  theme.js        可选的整页外观控制器
  index.html     可交互组件目录 /design-system
  catalog.*      组件目录布局与交互
  fonts/         字体与授权文件
studio/src/motion/theme.css             编辑器布局、主题和细节
studio/src/motion/workspace.css         首页、共享侧栏、创作会话、模板卡片与窄屏适配
studio/src/motion/MotionStudioHost.tsx  顶栏品牌、工程、MCP 与模板插槽
studio/src/motion/ConnectionDialog.tsx  MCP 与模板统一弹框
web/connect.*                          接入页面、配置下载与指南
web/template-gallery.*                 成片卡片、预览、出处、分类与热度
shared/integration.ts                  客户端配置与 Agent 指引
```

`tokens.json` 以 `motion.ui-tokens@1` 标识版本。`shared` 定义跨主题变量，`themes` 定义同名的亮暗变量，统一生成 `--motion-*`。原参考项目的 `--mc-*` 改为独立命名空间；保留编辑器与接入内容需要的变量。错误与警告底色是本次补充，正文及状态文字对比度通过 4.5:1 检查。

MCP 与模板入口使用同一个原生 `dialog`，保留编辑器上下文。完整指南和视频预览在弹框内展开，Escape 优先关闭当前子弹框；作者出处可跳转外部原帖，配置可直接下载。模板卡片突出真实视频，在下方显示作者、分类、有来源的热度和“一键复刻”；悬停热度可查看精确值与同步日期。切换 Agent 不改变 URL。旧 `/connect` 地址重定向到编辑器的 `?panel=connections` 深链接，`?templates=1` 直接定位画廊。详细数据规则见 [模板目录](template-catalog.md)。

## 复用

整体复制 `web/design-system/`，保留目录结构，无需运行原参考项目。

```html
<link rel="stylesheet" href="./design-system/ui.css">
<section data-motion-ui data-theme="light">
  <label class="ui-field">标题
    <input class="ui-input" placeholder="写一句，让人记住的话">
  </label>
  <button class="ui-button ui-button--primary">开始创作</button>
</section>
```

Tokens、基础规则和控件全部限定在 `[data-motion-ui]` 内，不重置外部宿主元素。主题由根容器的 `data-theme="light|dark"` 控制；没有该属性时按系统外观回退。宿主集成应直接设置容器属性。Studio 的 `[data-motion-studio]` 适配层按原生 `data-theme="paper"` 映射浅色，无该属性映射暗色。`theme.js` 用于本项目整页运行，操作 `document.documentElement`，移植到其他路径时同步调整其中的图标地址，嵌入其他应用时可不加载。

通用控件：`.ui-button` 支持 `--primary`、`--ghost`、`--accent`、`--danger`、`--sm`、`--icon`；`.ui-field` 与 `.ui-input` 用于原生表单；`.ui-badge` 表达状态；`.ui-empty`、`.ui-loader`、`.ui-progress` 提供空态与进度。图标用 SVG `use` 引用 `icons.svg#icon-*`，控制按钮须提供可读标签。

UI 主题不修改 Hyperframes 工程的 HTML、CSS 或 GSAP 动画。影片由工程源文件渲染，编辑器外观不会影响导出。

## 开发与验证

时间轴的素材操作栏是随选择出现的上下文入口，侧栏模型设置管理工作区能力（嵌入视图保留编辑器内入口），二者职责不同。操作栏复用 `--motion-*` 变量和原生时间轴状态；生成面板承载常用参数、候选与采用动作。完整的触发、隐藏、关闭/重开、时间参数和「交给 Agent」语义见 [时间轴交互设计](product/media-generation-design.md#时间轴交互规则及原因)。参考产品的价格或模型卡片不能直接成为本产品的收费与可用性说明。

```sh
npm run design:tokens   # 修改 tokens.json 后生成 CSS
npm run design:check    # 检查生成同步、主题完整性、变量和文字对比度
npm run check          # 已包含设计检查
npm test
npm run test:studio
npm run typecheck:studio
npm run build:studio
npm run package:plugin
```

本地服务的 `/design-system` 为组件目录，可切换主题、查看真实色值、操作控件并下载 JSON / CSS 变量。

插件打包包含编辑器源码、构建产物、设计系统和字体许可。编辑器依赖本地 Hyperframes 服务，不再提供旧 Canvas 预览的单文件离线构建。

面板由原版 Dock 管理；1040px 以下顶栏允许换行，650px 以下模板库为单列。MCP、模板库、撤销/重做、历史、预览与布局入口均在顶栏对齐。预览关闭后可一键恢复；布局菜单提供面板显示、预设和重置，版本历史也是可拖动面板。面板边界使用连续 1px 分隔线，滑条使用 2px 轨道与 6px 滑块。验收覆盖深浅主题、键盘焦点、窄屏、原生编辑保存与撤销、版本恢复、布局恢复、模板切换、MCP 配置和真实 MP4 导出。
