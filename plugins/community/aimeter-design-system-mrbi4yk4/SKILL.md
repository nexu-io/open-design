# Aimeter Design System

> 版本: `1.0.0-ai-optimized`  
> 来源: https://aimeter.xk-devops.com/  
> 优化时间: 2026-07-08T02:50:40Z  
> 状态: 可用于生产交付；logo/hero 图像仍需品牌方补源。

## 1. 系统判断

Aimeter 是面向 LLM 网关、配额、成本、用量、模型健康和审计的运营控制台。视觉姿态不是营销型 SaaS，而是 **技术/运营工具**：高信息密度、清晰状态、低装饰、绿色承担“安全、可用、已接入”的品牌信号。

本次优化重新抓取了入口 HTML、主 CSS/JS、Vite 分包清单，并下载了 39 个 CSS 分包、37 个 JS 分包和 7 个字体文件。结论按证据等级标注：`measured` 为源站代码实测，`inferred-from-scale` 为从已测色阶/组件规律推导。

## 2. 证据来源

- 入口: `source_examples/aimeter.xk-devops.com.html`
- 主样式: `source_examples/css/index-DY_nMfq1.css`
- 主脚本: `source_examples/js/index-BFx-b9L6.js`
- 分包样式: `source_examples/chunks/css/`
- 分包脚本: `source_examples/chunks/js/`
- 结构化证据: `context/live-extraction.json`, `context/vite-chunk-extraction.json`
- 字体资产: `fonts/Inter-*.woff2`, `fonts/JetBrainsMono-*.woff2`

限制: 未在可达 DOM/CSS 中发现可下载品牌 logo、hero 图像或产品截图资产；`/vite.svg` 返回 404。当前包保留真实字体和源码证据，不伪造品牌图形。

## 3. 色彩系统

### 亮色核心 tokens

| Token | HEX | OKLCH | 语义角色 | 证据 |
|---|---:|---:|---|---|
| `brand.primary` | `#36B34E` | `oklch(67.66% 0.1782 146.47)` | 主品牌绿：主按钮、正向状态、品牌识别 | measured |
| `brand.hover` | `#249089` | `oklch(59.34% 0.0938 188.42)` | 实测主按钮 hover/focus；偏青绿色，适合交互反馈 | measured |
| `brand.dark` | `#1F8A3B` | `oklch(55.71% 0.1495 147.53)` | Element Plus primary-dark-2 / 深色渐变端点 | measured |
| `brand.deep` | `#146C2E` | `oklch(46.70% 0.1247 148.20)` | 深绿色强调与暗色品牌底 | measured |
| `brand.light` | `#5DC370` | `oklch(73.57% 0.1521 147.85)` | 暗色模式品牌绿与浅层强调 | measured |
| `brand.tint` | `#EAF7EC` | `oklch(96.34% 0.0200 150.10)` | 品牌浅底、选中态、成功弱背景 | inferred-from-scale |
| `bg.page` | `#F8FAFC` | `oklch(98.42% 0.0034 247.86)` | 页面底色 / Slate 50 | measured |
| `bg.surface` | `#FFFFFF` | `oklch(100.00% 0.0000 89.88)` | 卡片、表格、对话框表面 | measured |
| `bg.subtle` | `#F1F5F9` | `oklch(96.83% 0.0069 247.90)` | 弱区块底色 / Slate 100 | measured |
| `fg.primary` | `#0F172A` | `oklch(20.77% 0.0398 265.75)` | 主文本 / Slate 900 | measured |
| `fg.regular` | `#334155` | `oklch(37.17% 0.0392 257.29)` | 正文 / Slate 700 | measured |
| `fg.muted` | `#64748B` | `oklch(55.44% 0.0407 257.42)` | 辅助文本 / Slate 500 | measured |
| `fg.placeholder` | `#94A3B8` | `oklch(71.07% 0.0351 256.79)` | 占位符、空状态 / Slate 400 | measured |
| `border.default` | `#E2E8F0` | `oklch(92.88% 0.0126 255.51)` | 默认边框 / Slate 200 | measured |
| `border.strong` | `#CBD5E1` | `oklch(86.90% 0.0198 252.89)` | 强边框 / Slate 300 | measured |
| `status.success` | `#0EA371` | `oklch(63.37% 0.1357 162.35)` | 用量/成功曲线与可用状态 | measured |
| `status.warning` | `#F59E0B` | `oklch(76.86% 0.1647 70.08)` | 用量警告与成本提示 | measured |
| `status.danger` | `#E74C3C` | `oklch(63.07% 0.1940 29.44)` | 危险动作、错误提示 | measured |
| `status.info` | `#3B82F6` | `oklch(62.31% 0.1880 259.81)` | 信息态、图表蓝 | measured |
| `chart.input` | `#36B34E` | `oklch(67.66% 0.1782 146.47)` | 输入 token / 品牌同色 | measured |
| `chart.output` | `#0EA371` | `oklch(63.37% 0.1357 162.35)` | 输出 token / 成功绿 | measured |
| `chart.cache` | `#06B6D4` | `oklch(71.48% 0.1257 215.22)` | 缓存命中 / 青色 | measured |
| `chart.cost` | `#C7900A` | `oklch(68.89% 0.1404 80.90)` | 成本 / 金色 | measured |
| `chart.reason` | `#8B5CF6` | `oklch(60.56% 0.2189 292.72)` | 推理 token / 紫色 | measured |

### 暗色核心 tokens

| Token | HEX | OKLCH | 语义角色 |
|---|---:|---:|---|
| `dark.bg.page` | `#0F172A` | `oklch(20.77% 0.0398 265.75)` | 暗色页面底 |
| `dark.bg.surface` | `#1E293B` | `oklch(27.95% 0.0368 260.03)` | 暗色卡片表面 |
| `dark.bg.subtle` | `#263242` | `oklch(31.35% 0.0332 255.77)` | 暗色弱底 / hover |
| `dark.border.default` | `#334155` | `oklch(37.17% 0.0392 257.29)` | 暗色默认边框 |
| `dark.fg.primary` | `#F1F5F9` | `oklch(96.83% 0.0069 247.90)` | 暗色主文本 |
| `dark.fg.regular` | `#CBD5E1` | `oklch(86.90% 0.0198 252.89)` | 暗色正文 |
| `dark.fg.muted` | `#94A3B8` | `oklch(71.07% 0.0351 256.79)` | 暗色辅助文本 |
| `dark.brand.primary` | `#5DC370` | `oklch(73.57% 0.1521 147.85)` | 暗色品牌主色 |

### 使用规则

- `brand.primary` 只用于主操作、可用状态、品牌识别和关键正向数据；一个屏幕内不应同时把绿色用于 3 种无关含义。
- `status.info`/Element Plus 蓝用于信息、链接、次级操作；不要覆盖主品牌绿。
- 成本、输入、输出、缓存、推理 token 的图表色必须固定，避免跨页认知漂移。
- 深色模式提升品牌绿亮度到 `#5DC370`，背景保持 Slate/Navy，不使用暖米色或泛紫渐变。

## 4. 字体与排版

- Display/Body: `Inter`, fallback 到 `PingFang SC`、`Microsoft YaHei` 和系统 sans。
- Mono: `JetBrains Mono`, `SFMono-Regular`, `Fira Code`, `Cascadia Code`, Consolas。
- 默认正文 14px；表格/元信息 12–13px；页面标题 20px/700；仪表盘 KPI 28px/900 + tabular numerics。
- 标题 tracking 可略收紧 `-0.02em`；业务正文保持 1.5–1.6 行高。

## 5. 布局与密度

- 页面最大宽度约 1280px；后台 shell 倾向 240px 左侧导航 + 顶部工具栏 + 内容卡片。
- 内容卡用 24px padding、24px 圆角；表格和表单内部使用 12–16px 间距。
- 数据页优先让筛选、汇总、表格在首屏同场出现；不要用大 hero 挤压真实运营信息。
- 响应式断点: 1200px 从 6 列降 3 列，900px 降 2 列，600px 单列，480px 紧凑间距。

## 6. 组件规范

### App Shell

左侧导航固定信息架构；内容区由页面标题、筛选工具栏、汇总指标、主表格/图表组成。导航和工具栏使用细边框，不使用大面积阴影。

### Metric Card

白底或 `bg.subtle`，12px 圆角，数字使用 mono/tabular，附带趋势或健康点。hover 可以轻微 `translateY(-2px)`，但只用于可点击卡片。

### Data Table

高密度是功能。表头 12px/600，行高 44–52px，底边线用 `border.default` 或 `border.light`。行 hover 使用 `bg.subtle`，不要做重斑马纹。

### Button

主按钮为 `brand.primary`，hover/focus 实测出现 `#249089`；登录按钮可使用品牌绿渐变。危险操作必须使用 danger 并配确认文案。

### Status Badge

胶囊形，弱背景 + 强文本。P0/P1/P2/P3、firing/resolved/manual-resolved、health ok/warn/critical/idle 必须保持一致映射。

### Login Surface

登录/统一入口可以使用绿色渐变标题、毛玻璃卡片、视频/渐变遮罩和盾牌类安全隐喻。该视觉不应扩散到高密度管理页。

## 7. 交互与动效

- 常规 hover/focus: 150–200ms ease。
- 进度环/用量动画: 600ms–1s `cubic-bezier(.4,0,.2,1)`。
- Critical 状态允许 pulse；正常页面不要让多处元素持续闪烁。
- 表单 focus 必须改变边框色并保持可见轮廓。

## 8. 文案语气

中文为主，中英混排。偏“系统状态 + 操作结果”的清晰表达，例如“今日调用量”“成本趋势”“手动解除”“配额豁免”。避免“颠覆式、10×、革命性”等无来源营销词。

## 9. 可访问性底线

- 绿色小字号正文不得直接压在白底上；用深绿、加粗或浅绿底承载。
- 交互控件高度后台桌面不少于 36px，移动触控不少于 44px。
- 状态不能只靠颜色表达，必须有文字、图标或标签。
- 深色模式边框和文本对比要重新指定，不直接反转亮色 token。

## 10. 包文件清单

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

## Provenance

Formalized by Open Design from candidate f699dd45-e5ea-4be1-b341-c059b36f3d80.
