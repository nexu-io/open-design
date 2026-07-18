# 受 Slack 启发的设计系统

> Category: 生产力与 SaaS
> 职场通讯平台。以深茄紫为主色，多色调 Logo 调色板，明亮界面搭配深色侧边栏，温暖而亲切。

## 1. 视觉主题与氛围

Slack 的品牌形象建立在"工作也可以充满人情味，甚至有点趣味"的理念之上。标准界面是**明亮**的——白色内容区搭配深茄紫（`#4A154B`）侧边栏——与深色优先工具形成反差。这种对比是刻意为之：侧边栏是沉稳、始终存在的导航锚点，而内容区则明亮开阔。

Logo 调色板——蓝、绿、黄、红——主要出现在井号图标和营销场景中，而非散落于整个 UI。在产品本身中，Slack 使用克制、专业的配色系统，以茄紫色作为唯一的品牌锚点。

**核心特征：**
- 明亮优先的内容界面：白色 `#FFFFFF` 与近白色 `#F8F8F8`
- 深茄紫 `#4A154B` 侧边栏——品牌最具辨识度的 UI 元素
- 四种 Logo 强调色（蓝、绿、黄、红）仅少量用作高亮
- 标题使用 Larsseit（营销场景），UI 使用系统无衬线字体
- 圆润但不卡通：大多数组件圆角为 4–8px
- 紧凑而透气：消息行紧密，线程层级清晰
- 温暖对话的语调——表情符号、回应和插图是一等公民

---

## 2. 色彩规范与用途

### 品牌主色
| 变量 | Hex | 用途 |
|---|---|---|
| `--color-aubergine` | `#4A154B` | 侧边栏背景，品牌主色 |
| `--color-aubergine-dark` | `#350d36` | 茄紫界面上的悬停状态 |
| `--color-aubergine-light` | `#611f69` | 侧边栏活跃项高亮 |

### Logo 强调色（少量使用——仅用于高亮、图标、营销）
| 变量 | Hex | 名称 | 用途 |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | 天蓝 | 频道图标、链接、信息状态 |
| `--color-green` | `#2EB67D` | 青绿 | 在线状态、成功状态 |
| `--color-yellow` | `#ECB22E` | 金黄 | 离开状态、警告、高亮 |
| `--color-red` | `#E01E5A` | 宝石红 | 通知、错误、提及徽章 |

### 界面背景色
| 变量 | Hex | 用途 |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | 主消息区、弹窗 |
| `--bg-secondary` | `#F8F8F8` | 线程面板、次级界面 |
| `--bg-tertiary` | `#F1F1F1` | 输入框背景、悬停状态 |
| `--bg-sidebar` | `#4A154B` | 左侧边栏（茄紫色） |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | 侧边栏项悬停 |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | 活跃侧边栏项 |
| `--bg-message-hover` | `#F8F8F8` | 消息行悬停 |

### 文字颜色
| 变量 | Hex | 用途 |
|---|---|---|
| `--text-primary` | `#1D1C1D` | 主要正文（近黑色） |
| `--text-secondary` | `#616061` | 时间戳、静音标签 |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | 侧边栏频道名 |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | 侧边栏未激活项 |
| `--text-link` | `#1264A3` | 消息内联链接 |
| `--text-mention` | `#1264A3` | @提及文字颜色 |

### 语义色
| 变量 | Hex | 用途 |
|---|---|---|
| `--color-success` | `#2EB67D` | 成功提示、积极状态 |
| `--color-warning` | `#ECB22E` | 警告状态 |
| `--color-danger` | `#E01E5A` | 错误状态、破坏性操作 |
| `--color-info` | `#36C5F0` | 信息性高亮 |

### 边框与分隔线
| 变量 | Hex | 用途 |
|---|---|---|
| `--border-default` | `#DDDDDD` | 标准分隔线、卡片边框 |
| `--border-subtle` | `#F1F1F1` | 行间微妙分隔线 |
| `--border-focus` | `#1264A3` | 焦点环颜色 |

---

## 3. 排版规则

### 字体
| 用途 | 官方字体 | 网页回退 |
|---|---|---|
| 展示 / 营销标题 | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / 正文 / 框架 | Slack Lato（定制） | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| 代码 / 等宽 | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack 营销标题使用 **Larsseit**，产品内 UI 使用定制版 Lato。网页使用时，`system-ui` 是最安全的回退方案。

### 字号层级

| 层级 | 大小 | 字重 | 行高 | 字间距 | 用途 |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | 营销主视觉标题 |
| Display L | 36px | 700 | 1.15 | -0.5px | 区块主视觉 |
| Heading 1 | 28px | 700 | 1.25 | normal | 弹窗标题、页面标题 |
| Heading 2 | 22px | 700 | 1.3 | normal | 卡片标题、设置区块 |
| Heading 3 | 18px | 700 | 1.35 | normal | 子区块标题 |
| Body L | 16px | 400 | 1.5 | normal | 消息文本、描述 |
| Body | 15px | 400 | 1.46667 | normal | 默认 UI 文字（Slack 基础字号） |
| Body SM | 13px | 400 | 1.38462 | normal | 次要元数据 |
| Caption | 12px | 400 | 1.33 | normal | 时间戳、提示 |
| Code | 12px | 400 | 1.5 | normal | 行内代码、代码块 |

### 排版规则
- Slack 基础正文字号为 **15px**——比 16px 略小，以提高密度
- 未读频道：字重 700——粗体是主要的未读指示器
- 时间戳：12px `--text-secondary`，仅悬停时显示
- 代码块：背景 `#F8F8F8`，边框 `1px solid #DDDDDD`，圆角 4px
- 不使用 12px 以下的字号
- 营销标题：大展示尺寸使用字间距 `-1px`

---

## 4. 组件样式

### 按钮

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### 输入框
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### 侧边栏频道项
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### 未读徽章
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### 消息附件 / 卡片
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### 回应
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. 布局原则

### 三栏布局
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### 间距系统（基础单位 4px）
| 变量 | 数值 | 用途 |
|---|---|---|
| `--space-1` | 4px | 紧凑间隙 |
| `--space-2` | 8px | 组件内边距 |
| `--space-3` | 12px | 输入框内边距 |
| `--space-4` | 16px | 标准内边距 |
| `--space-6` | 24px | 卡片内边距 |
| `--space-8` | 32px | 区块间距 |

### 侧边栏结构
```
[工作区名称 ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### 消息编辑器
- 固定在消息区底部
- `border: 1px solid #DDDDDD`，`border-radius: 8px`，`margin: 0 16px 16px`
- 工具栏：表情、附件、格式化、发送按钮

---

## 6. 深度与层级

Slack 在明亮界面上使用轻柔阴影：

| 层级 | 用途 | 阴影 |
|---|---|---|
| 扁平 | 消息行、侧边栏项 | none |
| 低 | 卡片、输入框 | `0 1px 3px rgba(0,0,0,0.08)` |
| 中 | 下拉菜单、弹出层 | `0 4px 12px rgba(0,0,0,0.12)` |
| 高 | 模态框、对话框 | `0 8px 24px rgba(0,0,0,0.15)` |
| 遮罩 | 模态背景遮罩 | `rgba(0,0,0,0.5)` |

---

## 7. 应该与不应该

### ✅ 应该
- 侧边栏使用茄紫色 `#4A154B`——这是 Slack 最标志性的 UI 元素
- 保持主内容区白色和明亮
- 所有正文使用 `#1D1C1D`（近黑色），而非纯黑
- 用粗体频道名表示未读状态——字重是指示器
- 四种强调色仅用于语义角色（成功、警告、危险、信息）
- 消息附件和嵌入内容使用 `border-left: 4px`
- 仅在悬停时显示时间戳
- 链接和焦点状态使用 `#1264A3`
- 侧边栏项保持紧凑：高度 28px，圆角 6px

### ❌ 不应该
- 不要使用深色主内容区——Slack 是明亮优先的
- 不要将蓝/绿/黄/红作为装饰性强调色散落各处
- 不要使用纯黑 `#000000` 作为文字颜色
- 不要使用气泡——消息是扁平行
- 不要将按钮做成大圆角——4px 是标准
- 不要永久显示时间戳
- 不要将频道名全大写
- 不要使用 12px 以下的字号

---

## 8. 响应式行为

### 断点
| 断点 | 宽度 | 布局 |
|---|---|---|
| 移动端 | < 768px | 单面板，侧边栏作为左抽屉 |
| 平板 | 768–1024px | 侧边栏 + 仅消息区 |
| 桌面端 | > 1024px | 完整三栏布局 |

### 移动端适配
- 侧边栏：左抽屉，向右滑动打开
- 底部标签栏：首页、私信、动态、我
- 线程面板：全屏覆盖层
- 编辑器：固定在键盘上方
- 频道列表项：44px 触摸目标高度
- 移动端保留茄紫色顶部标题栏

---

## 9. Agent 提示指南

生成 Slack 风格设计时，遵循以下方法：

**颜色应用：**
> 将 `background: #FFFFFF` 设为主画布。侧边栏使用 `#4A154B`（茄紫色）。所有主要文字使用 `#1D1C1D`。链接和焦点环使用 `#1264A3`。四种 Logo 颜色——`#36C5F0`、`#2EB67D`、`#ECB22E`、`#E01E5A`——仅作语义用途：信息、成功、警告、危险。

**排版：**
> 所有 UI 使用 `system-ui, -apple-system, sans-serif`。基础字号为 15px。未读频道：字重 700。正文：字重 400。时间戳：12px `#616061`，仅悬停显示。代码：`Monaco, Menlo, monospace`，12px，背景 `#F8F8F8`。

**布局：**
> 三栏：240px 茄紫色侧边栏 + 弹性白色消息区 + 可选 400px 线程面板。侧边栏项：高度 28px，圆角 6px，未读时加粗。编辑器：固定底部，`border: 1px solid #DDDDDD`，`border-radius: 8px`。

**组件：**
> 按钮：圆角 4px，高度 36px，茄紫色主按钮。输入框：`1px solid #DDDDDD` 边框，`#1264A3` 焦点环。消息行：扁平，无气泡，36px 圆形头像。回应：胶囊形 `border: 1px solid #DDDDDD`，`border-radius: 24px`。

**语调：**
> Slack 是温暖、专业且充满人情味的。空状态使用友好插图。行动号召直接明确："Send message"、"Get started"。错误信息清晰且有帮助。绝不令人感到警觉。

**需要避免的反模式：**
> 不要深色内容区。不要气泡。不要纯黑文字。不要散落的多色强调。不要全大写频道名。不要低于 12px 的字号。不要大圆角按钮。
