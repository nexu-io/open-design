# Design System Inspired by Discord

> Category: 效率与 SaaS
> 语音 / 聊天平台。深蓝紫主色调，深色优先界面，偶有活泼的强调色点缀。

## 1. Visual Theme & Atmosphere

Discord 的产品专为夜间游戏、团队副本和多人语音而生，因此整个界面以深色为主。默认画布采用深邃的"背景主色"（浅色主题为 `#313338`，深色主题为 `#1e1f22`），聊天栏在略浅或略深的色阶之上层叠，用以区分频道、话题和侧边栏。标志性的**蓝紫色**（`#5865f2`）专用于品牌标志、主要操作按钮、@提及以及"当前用户"的标识——用量克制，使其在灰调中层显眼。

字体为 **gg sans**（Discord 定制的 Whitney 替代字体），用于正文与界面文字。其圆润的几何形态亲切友好，同时在聊天客户端所需的小字号下仍保持良好的可读性。标题级差适中；聊天行距紧凑（消息组之间仅 4–8px），使长时间滚动历史记录也便于扫读。

形状语言圆润但不失挺括：卡片圆角为 8px，输入框为 4px，状态徽章和标签为全圆药丸形。服务器头像为 48px 的圆角方形，悬停时变为圆形——这一微小的动效已成为品牌标识的一部分。

**Key Characteristics:**
- 深色优先界面：`#1e1f22` / `#2b2d31` / `#313338`（三层深度）
- 蓝紫色 `#5865f2` 是聊天界面中唯一的高饱和强调色
- gg sans（Whitney 风格）统一用于所有文字——亲切、几何、中性
- 圆角方形服务器头像（圆角半径 16px），悬停时过渡为圆形
- 聊天行距紧凑，侧边栏内边距宽松
- 状态指示点：绿色在线、黄色空闲、红色免打扰、灰色离线
- 低不透明度的细微半白色 1px 像素对齐分割线

## 2. Color Palette & Roles

### Primary
- **Blurple** (`#5865f2`): 品牌主色、主操作按钮、@提及高亮。
- **Blurple Hover** (`#4752c4`): 蓝紫色的悬停 / 激活态。
- **Blurple Soft** (`#7289da`): 旧版蓝紫色，营销场景中的次级强调色。

### Surface（深色主题——默认）
- **Background Tertiary** (`#1e1f22`): 服务器列表轨道，最深背景层。
- **Background Secondary** (`#2b2d31`): 频道侧边栏、设置侧边栏。
- **Background Primary** (`#313338`): 聊天区域、消息列。
- **Background Floating** (`#111214`): 浮动弹出层、提示框、自动补全。
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): 行悬停遮罩。
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): 激活行。

### Surface（浅色主题）
- **Light Bg Primary** (`#ffffff`): 浅色主题下的聊天区域。
- **Light Bg Secondary** (`#f2f3f5`): 浅色主题下的侧边栏。
- **Light Bg Tertiary** (`#e3e5e8`): 浅色主题中最深的表面层。

### Text
- **Header Primary** (`#f2f3f5`): 深色主题下的频道标题和模态框标题。
- **Header Secondary** (`#b5bac1`): 次级标题，视觉减弱。
- **Text Normal** (`#dbdee1`): 深色主题正文——比纯白略偏冷。
- **Text Muted** (`#949ba4`): 时间戳、服务器名称、次要元数据。
- **Text Link** (`#00a8fc`): 消息中的超链接——天蓝色，有别于蓝紫色。
- **Channels Default** (`#80848e`): 侧边栏中未激活的频道名称。

### Status & Semantic
- **Status Online** (`#23a55a`): 在线状态点、成功状态。
- **Status Idle** (`#f0b232`): 空闲状态点、离开。
- **Status DND** (`#f23f43`): 免打扰，同时作为破坏性操作的红色。
- **Status Streaming** (`#593695`): "直播中"紫色。
- **Status Offline** (`#80848e`): 离线灰色。
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): @提及行的柔和蓝紫色底色。

### Border & Divider
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): 深色主题下的标准分割线。
- **Border Subtle** (`#3f4147`): 卡片的实线边框。

## 3. Typography Rules

### Font Family
- **正文 / UI / 标题**: `gg sans`，备用字体：`"Helvetica Neue", Helvetica, Arial, sans-serif`
- **展示字体（旧版 / Whitney）**: `Whitney`，备用字体：`gg sans`
- **代码 / 等宽**: `"gg mono"`，备用字体：`Consolas, Andale Mono, Courier New, Courier, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | 营销主视觉 |
| Page Heading | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | 设置 / 个人资料标题 |
| Channel Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`、频道标题 |
| Message Body | gg sans | 16px (1rem) | 400 | 1.375 | normal | 标准聊天文字 |
| Username | gg sans | 16px (1rem) | 500 | 1.25 | normal | 消息作者 |
| Timestamp | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "今天 16:32" |
| Sidebar Channel | gg sans | 16px (1rem) | 500 | 1.25 | normal | 频道列表行 |
| Server Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | 服务器标题 |
| Caption / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | 状态文字、已编辑标签 |
| Code Inline | gg mono | 0.875em | 400 | inherit | normal | 行内 `code` |
| Code Block | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | ```triple-fenced``` 代码块 |

### Principles
- **友好的几何形态**：gg sans 以圆润末端替代 Whitney 的 a/g/s 字形——品牌追求亲切感，同时不牺牲可读性。
- **字重对比优于颜色对比**：层级通过 400→500→600→700→800 的字重递进来体现；表面色调保持中性。
- **正文 16px**：聊天消息字号不低于 16px。信息密度通过行高（1.375）控制，而非缩小字号。

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#5865f2`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- 用途：主操作按钮，如"继续"、"加入服务器"

**Secondary**
- Background: `#4e5058`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**Tertiary / Subtle（链接样式）**
- Background: transparent
- Text: `#dbdee1`
- Hover: 文字加下划线，背景不变

**Danger**
- Background: `#da373c`
- Text: `#ffffff`
- Hover: `#a12d2f`

### Inputs
- Background: `#1e1f22`
- Text: `#dbdee1`
- Border: 1px solid `#1e1f22`
- Radius: 4px
- Padding: 10px 12px
- Focus: border `#5865f2`

### Server Avatars
- Size: 48×48px
- Radius: 默认 16px（圆角方形）；悬停和激活时过渡为 50% 圆形。
- 激活状态：图标列左侧边缘显示 4px 白色药丸形指示条。

### Status Dots
- Size: 10×10px
- Border: 3px solid background-tertiary（形成"缺口"效果）
- Position: 头像右下角。

### Cards / Embeds
- Background: `#2b2d31`（深色）或 `#f2f3f5`（浅色）
- Left border: 4px solid，颜色为嵌入内容的强调色。
- Radius: 4px
- Padding: 8px 16px

### Mention Pill
- Background: `rgba(88, 101, 242, 0.3)`
- Text: `#c9cdfb`
- Padding: 0 2px
- Radius: 3px

## 5. Spacing & Layout

- **基础单位**：4px。刻度：4、8、12、16、20、24、32、40。
- **服务器轨道**：固定宽度 72px。
- **频道侧边栏**：宽度 240px。
- **成员列表**：桌面端宽度 240px。
- **聊天列**：自适应宽度，最小 380px。

## 6. Motion

- **时长**：悬停 200ms；头像圆形变形 350ms；提示框淡入淡出 80ms。
- **缓动**：头像变形使用 `cubic-bezier(0.215, 0.61, 0.355, 1)`（快速入场后平稳落定）。
- **未读通知脉冲**：@提及指示器采用 1.4s ease-in-out 无限循环动画。

## 7. Usage Guardrails

- 保持深色外壳、紧凑密度与蓝紫色操作层级三者并用；若将蓝紫色置于浅色营销风格的布局中，Discord 的产品质感将被破坏。
- 导航密集型界面应围绕轨道、侧边栏和聊天列来组织，而非孤立的装饰性卡片。
- 代表人物、服务器或在线状态时，应使用圆角方形头像和状态指示点语言。
