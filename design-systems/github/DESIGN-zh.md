# 受 GitHub 启发的设计系统

> Category: 开发者工具
> 以代码为核心的平台。功能密度高，蓝白配色精准，基于 Primer 规范。

## 1. 视觉主题与氛围

GitHub 的界面是工程化的，而非装饰性的。每一个像素都在传达一种立场：这是一款为在乎 diff、构建和 pull request 的人而生的工具。页面背景是干净的 `#ffffff`（浅色模式）或 `#0d1117`（深色模式），内容排布在密集的矩形面板上，面板之间用细线边框分隔，而非留白。信息密度即品牌——列表行、代码行、仓库标题和通知卡片紧密排列，让有经验的用户无需滚动即可浏览上百条内容。

标志性的强调色是用于链接和主要操作的 **Primer 蓝** (`#0969da`)，以及用于合并状态、成功提示和合并按钮的 **GitHub 绿** (`#1a7f37`)。与消费品的蓝绿色相比，两者都略显低调——饱和度足以在密集的灰色文字中清晰可辨，又克制到足以在同一视口中出现多次时不显突兀。

排版使用覆盖整个产品的 **system-ui** 字体栈，确保文字在所有操作系统上清晰渲染，搭配 **SFMono / Menlo / Consolas** 用于代码。没有编辑类展示字体；GitHub 的声音就是你正在使用的系统本身的声音。

**关键特征：**
- 纯白画布（`#ffffff`）或深海军蓝黑（`#0d1117`）——无暖调，无色调倾向
- 细线灰色边框（`#d0d7de`）定义每个面板
- Primer 蓝（`#0969da`）用于链接/主要操作；GitHub 绿（`#1a7f37`）用于成功/合并
- system-ui 用于正文；SFMono 用于代码——无自定义字体
- 内边距极小的密集列表行；留白稀少
- 16px / 24px 的 Octicon 图标——单描边、几何形态、风格统一
- 具有强色彩语义的胶囊状状态徽章

## 2. 色彩调色板与角色

### 主色
- **Canvas Default**（`#ffffff`）：浅色主题主页面背景。
- **Canvas Subtle**（`#f6f8fa`）：次级表面、侧边栏、输入框背景、顶栏区域。
- **Canvas Inset**（`#eaeef2`）：代码块背景、深内嵌表面。
- **Fg Default**（`#1f2328`）：主文本、标题、正文。
- **Fg Muted**（`#656d76`）：次级文本、说明文字、文件路径。

### 品牌强调色
- **Primer Blue**（`#0969da`）：链接、主要 CTA、焦点圆环基色——通用交互色。
- **Primer Blue Hover**（`#0550ae`）：主蓝色的悬停/按下状态。
- **Accent Subtle**（`#ddf4ff`）：用于标注、信息横幅的柔和蓝色表面。

### 语义色
- **Success / Merge Green**（`#1a7f37`）：已合并 PR、成功徽章、合并按钮。
- **Success Subtle**（`#dafbe1`）：成功状态的表面色调。
- **Open Green**（`#1a7f37`）：Issue/PR 的"Open"状态。
- **Closed / Danger Red**（`#cf222e`）：已关闭 PR、破坏性操作、验证错误。
- **Danger Subtle**（`#ffebe9`）：错误横幅表面。
- **Attention / Warning Yellow**（`#9a6700`）：琥珀色表面上的警告文字。
- **Attention Subtle**（`#fff8c5`）：警告横幅表面。
- **Done Purple**（`#8250df`）：已合并并归档、"done"状态、高级徽章。
- **Sponsor Pink**（`#bf3989`）：赞助心形图标、GitHub Sponsors 品牌色。

### 边框与分割线
- **Border Default**（`#d0d7de`）：标准细线边框、面板轮廓。
- **Border Muted**（`#d8dee4`）：面板内部分割线。
- **Border Subtle**（`#eaeef2`）：隐约的表格行分割线。

### 深色主题
- **Dark Canvas**（`#0d1117`）：深色页面背景。
- **Dark Surface**（`#161b22`）：侧边栏、顶栏、次级表面。
- **Dark Border**（`#30363d`）：标准深色模式边框。
- **Dark Fg**（`#e6edf3`）：深色背景上的主文本。

## 3. 排版规则

### 字体系列
- **正文 / UI**：`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **代码 / 等宽**：`ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**：`"Apple Color Emoji", "Segoe UI Emoji"`

### 层级

| 角色 | 字体 | 字号 | 字重 | 行高 | 字距 | 备注 |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | 仓库标题、营销首屏 |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | 页面标题 |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | 区域标题 |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | 子区域、面板标题 |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | 默认文本尺寸——非 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | 说明文字、文件元数据 |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | 代码块、diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | 行内 `code` 段 |

### 原则
- **正文 14px，非 16px**：GitHub 的文字密度是其标识。产品以 14px 阅读，以便在视口中容纳更多行。
- **字重二元化**：默认全部 400；标题和强调用 600。无 500，无 700。
- **始终使用系统字体**：绝不为界面加载网络字体——文字必须在慢网络下即时渲染。

## 4. 组件样式

### 按钮

**主要按钮（绿色）**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- 用途："Create repository"、"Merge pull request"

**默认按钮**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`，border `#d0d7de`

**轮廓按钮（蓝色链接风格）**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`，text `#ffffff`

**危险按钮**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`，text `#ffffff`，border `#a40e26`

### 卡片 / 盒子
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px（标题）+ 16px（正文）
- 标题区有 `#f6f8fa` 底色带下边框。

### 输入框
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: border `#0969da`，ring `0 0 0 3px rgba(9,105,218,0.3)`

### 状态徽章（Issue / PR）
- **Open**：background `#1a7f37`，文字白色，padding 4px 10px，radius 9999px。
- **Closed**：background `#cf222e`，文字白色。
- **Merged**：background `#8250df`，文字白色。
- **Draft**：background `#6e7781`，文字白色。

### 标签（Issue/PR 上的标签）
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- 背景色和文字颜色由程序计算（标签颜色→文字颜色按对比度计算）。

## 5. 间距与布局

- **基础单位**：4px。间距比例：4, 8, 12, 16, 24, 32, 40, 48。
- **页面最大宽度**：1280px（`Container-xl`）。
- **侧边栏**：桌面端 296px，低于 1012px 时折叠。
- **行内边距**：水平 16px，垂直 12px（列表天生密集）。

## 6. 动效

- **时长**：悬停 80ms；菜单/弹出层展开 200ms。
- **缓动**：展开用 `ease-out`，关闭用 `ease-in`。
- **刻意回避**：页面加载动画、视差效果、持续的微交互。元素直接出现，不表演。

## 7. 使用护栏

- 密集列表、带边框的盒子和系统字体需搭配使用；单独使用绿色按钮不足以营造 GitHub 风格的产品界面。
- 绿色用于建设性仓库操作，蓝色用于链接和焦点，红色/紫色/灰色仅用于 Issue、PR 和工作流状态。
- 优先选择低调的界面装饰、明确的边框和紧凑的间距，而非装饰性阴影或大型营销风格卡片。
