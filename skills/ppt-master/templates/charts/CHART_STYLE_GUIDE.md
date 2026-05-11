# Chart SVG Style Guide

> 本文档定义了 `templates/charts/` 下所有 SVG 图表模板的视觉规范。  
> 新增或修改图表时 **必须** 遵循以下标准，确保全库视觉一致性。

## 0. 上游规范引用

本文档是 **图表模板专用** 的美学与实现规范。所有图表同时必须遵守项目级通用技术约束：

> **[`references/shared-standards.md`](../../references/shared-standards.md)** — SVG 禁用特性黑名单、PPT 兼容性替代、Canvas 格式、tspan 内联规则、分组规范、阴影/叠加技术、后处理管线

以下章节摘录了 shared-standards 中与图表模板最密切相关的条目。完整细节（如 marker 条件约束、clipPath 条件约束、弧线路径计算公式等）请查阅上游文档。

---

## 1. 色彩系统 (Tailwind CSS Palette)

### 1.1 文本颜色

| 用途 | 色值 | Tailwind Token | 示例 |
|------|------|----------------|------|
| **主标题** | `#0F172A` | Slate 900 | 图表大标题 |
| **数值标签** | `#0F172A` | Slate 900 | 柱顶数值、关键指标 |
| **副标题** | `#64748B` | Slate 500 | 日期、单位说明 |
| **坐标轴标签** | `#64748B` | Slate 500 | X/Y 轴刻度值 |
| **轴标题 / 图例** | `#475569` | Slate 600 | "年薪（万元）"、图例文字 |
| **数据来源** | `#94A3B8` | Slate 400 | 页面底部来源说明 |
| **脚注 / 淡化提示** | `#CBD5E1` | Slate 300 | "各阶段可灵活调整" |

### 1.2 主题色（数据系列）

| 色名 | 主色 | 深色（渐变终点） | 用途 |
|------|------|------------------|------|
| **Blue** | `#3B82F6` | `#2563EB` | 第 1 系列（默认首选） |
| **Emerald** | `#10B981` | `#059669` | 第 2 系列 |
| **Amber** | `#F59E0B` | `#D97706` | 第 3 系列 |
| **Violet** | `#8B5CF6` | `#7C3AED` | 第 4 系列 |
| **Rose** | `#FB7185` | `#E11D48` | 第 5 系列 / 警告 |
| **Pink** | `#EC4899` | `#BE185D` | 对比组（如蝴蝶图女性） |

> 径向渐变（如气泡图）使用亮色变体：`#60A5FA`、`#34D399`、`#FBBF24`、`#A78BFA`、`#FB7185`

### 1.3 语义色

| 用途 | 色值 | 说明 |
|------|------|------|
| 达标 / 正面 | `#10B981` | Emerald 500 |
| 警告 / 中性 | `#F59E0B` | Amber 500 |
| 未达标 / 负面 | `#EF4444` | Red 500 |
| 异常值标注 | `#F43F5E` | Rose 500 |

### 1.4 UI 辅助色

| 用途 | 色值 | 说明 |
|------|------|------|
| **坐标轴线** | `#94A3B8` | Slate 400, stroke-width="2" |
| **网格线** | `#E2E8F0` 或 `#E0E0E0` | stroke-dasharray="4,4" |
| **中心分隔线** | `#CBD5E1` | 如象限十字线 |
| **卡片背景** | `#F8FAFC` / `#F8F9FA` | Slate 50 |
| **卡片描边** | `#E2E8F0` | Slate 200 |
| **行分隔线** | `#F1F5F9` | Slate 100（极淡） |
| **Tint 背景**（蓝） | `#EFF6FF` | Blue 50 |
| **Tint 背景**（绿） | `#ECFDF5` | Emerald 50 |
| **Tint 背景**（红） | `#FFF1F2` | Rose 50 |
| **Tint 背景**（黄） | `#FFFBEB` | Amber 50 |

---

## 2. 排版规范

### 2.1 字体栈

```
font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
```

- 纯英文场景可省略 `'PingFang SC', 'Microsoft YaHei'`
- **禁止** 使用 `@font-face`、外部字体、`<style>` 标签

### 2.2 字号层级

| 层级 | 字号 | font-weight | 用途 |
|------|------|-------------|------|
| H1 | `34px` | `bold` (700) | 图表主标题 |
| H2 | `22px` | `600` | 区域标题（如"详细数据"） |
| Body L | `18-20px` | `600` | 关键数值、百分比 |
| Body M | `15-16px` | `600` | 数据标签、分类名 |
| Body S | `14px` | 正常 | 副标题、图例、来源 |
| Caption | `12-13px` | 正常 | 坐标轴刻度、注释 |

> **最小字号下限：12px**。所有文本不得小于 12px。

### 2.3 tspan 规范

所有 `<text>` 元素的文本内容 **必须** 包裹在 `<tspan>` 中：

```xml
<!-- 正确 -->
<text x="60" y="80" font-size="34" fill="#0F172A">
    <tspan>图表标题</tspan>
</text>

<!-- 错误 -->
<text x="60" y="80" font-size="34" fill="#0F172A">图表标题</text>
```

### 2.4 内联格式化规则（shared-standards SS4）

**单逻辑行 = 单 `<text>`**。同一行内需要多色/多粗细时，用内联 `<tspan>` 实现，**不要**用多个并排 `<text>`：

```xml
<!-- 正确：一个 text frame，三个 run -->
<text x="100" y="200" font-size="24" fill="#333333">
  实现<tspan fill="#3B82F6" font-weight="bold">10倍</tspan>效率提升
</text>

<!-- 错误：三个独立 text frame，PPT 中无法作为一行编辑 -->
<text x="100" y="200">实现</text>
<text x="160" y="200" fill="#3B82F6">10倍</text>
<text x="240" y="200">效率提升</text>
```

> 内联 tspan **不得** 携带 `x` / `y` / `dy`，否则后处理会将其拆分为独立 text frame。`dx` 可用于微调字距。

### 2.5 数据高亮默认行为

图表中的关键数据文本应默认高亮：
- **数值结果** — 百分比、倍数、金额 → `<tspan fill="主题色" font-weight="bold">`
- **对比项** — 增/减、达标/未达标 → 语义色（绿/红）
- **不高亮** — 连接词、普通动词、结构性文字（轴标签、图例、页码）

---

## 3. 阴影滤镜

统一使用 `feFlood` 方案，**禁止** 使用 `feComponentTransfer`：

```xml
<filter id="chartShadow" x="-15%" y="-15%" width="130%" height="130%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2-4"/>
    <feOffset dx="0" dy="1-3" result="offsetBlur"/>
    <feFlood flood-color="#0F172A" flood-opacity="0.08-0.15" result="shadowColor"/>
    <feComposite in="shadowColor" in2="offsetBlur" operator="in" result="shadow"/>
    <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
    </feMerge>
</filter>
```

### 参数参考

| 场景 | stdDeviation | dy | flood-opacity |
|------|-------------|-----|---------------|
| 重型元素（箭头、卡片） | 4-6 | 2-4 | 0.12-0.15 |
| 中型元素（柱子、箱体） | 2-3 | 1-2 | 0.10-0.15 |
| 轻型元素（底部卡片） | 4-6 | 2-4 | 0.06-0.08 |

### 禁用列表

- `flood-color="#000000"` → 必须用 `#0F172A`
- `feComponentTransfer` → 用 `feFlood` 替代
- `flood-opacity > 0.20` → 阴影过重，最大 0.15-0.20

### 阴影使用原则（shared-standards SS6）

> **阴影是美学成分，不是默认处理。** 克制而非丰富才能产生"经过设计"的感觉。 "阴影被感知而非被看见" 是高端美学标准。

**应加阴影**：浮在照片/彩色面板上方的卡片、唯一的主 CTA、叠加层（tooltip、callout）

**不应加阴影**：背景面板/分隔条、网格中平等的同级卡片、已有描边/渐变的容器、正文段落容器、装饰线/图标、深色背景上（黑色阴影不可见）

**每页预算**：最多 2-3 个带阴影元素。第 4 个需要阴影时，先移除现有某个的阴影。

**统一光源**：同页所有 `feOffset` 的 `dx`/`dy` 方向必须一致（默认 `dx=0, dy=正值`，光从上方来）。

**两级高度上限**：

| 层级 | 场景 | dy | stdDeviation | flood-opacity |
|------|------|----|--------------|---------------|
| 地面（无阴影） | 背景、同级网格卡片、分隔线、正文容器 | — | — | — |
| 静止 | 照片/面板上的卡片、次级 callout | 2-4 | 4-8 | 0.06-0.10 |
| 抬升 | 主 CTA、焦点/推荐卡片、覆盖层 | 6-10 | 10-16 | 0.12-0.20 |

**不要堆叠**：阴影 + 描边 + 圆角 + 渐变填充同时出现 = 模板感。容器的"看我"预算很小，选其一即可。

---

## 4. 渐变规范

### 4.1 线性渐变（柱状/条形图）

```xml
<linearGradient id="barGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" />
    <stop offset="100%" style="stop-color:#2563EB;stop-opacity:1" />
</linearGradient>
```

- 方向：从亮到深（顶到底 或 左到右）
- 每个渐变 ID 应语义化：`barGrad1`、`leftGrad`、`actualBarBlue`

### 4.2 径向渐变（气泡图）

```xml
<radialGradient id="bubbleGrad1" cx="30%" cy="30%">
    <stop offset="0%" style="stop-color:#60A5FA;stop-opacity:0.9" />
    <stop offset="100%" style="stop-color:#2563EB;stop-opacity:0.7" />
</radialGradient>
```

- 高光偏左上方 (`cx="30%" cy="30%"`)
- 边缘 opacity 降低至 0.7，制造通透感

---

## 5. 结构规范

### 5.1 层级分组（shared-standards SS4 Grouping）

使用 `<g id="...">` 进行语义分组，便于 PPT 中逐个操作/动画：

```xml
<g id="chartArea">        <!-- 图表主体 -->
    <g id="bar-1">...</g>  <!-- 每个数据元素独立分组 -->
    <g id="bar-2">...</g>
</g>
<g id="legend">            <!-- 图例区域 -->
    <g id="legend-high">...</g>
</g>
<g id="detailList">        <!-- 详情面板 -->
    <g id="list-items">
        <g id="item-1">...</g>
    </g>
</g>
```

**分组单元参考**（来自 shared-standards）：

| 分组单元 | 包含内容 |
|---------|---------|
| 卡片/面板 | 背景 rect + 阴影（如适用）+ 图标 + 标题 + 正文 |
| 流程步骤 | 编号圆 + 图标 + 标签 + 描述 |
| 列表项 | 圆点/编号 + 图标 + 标题 + 描述 |
| 图标-文字组合 | 图标元素 + 相邻标签 |
| 页头 | 标题 + 副标题 + 装饰 |
| 装饰集群 | 相关装饰形状（环、球、点） |

**命名约定**：使用描述性 `id`（如 `card-1`、`step-discover`、`header`、`footer`）。

> 只有 `<g opacity="...">` 被禁止（见 SS2）。纯结构 `<g>` 是必需的。

### 5.2 viewBox

固定为 `0 0 1280 720`（PPT 16:9），不可修改。

### 5.3 背景

首行始终为白色全屏背景：
```xml
<rect width="1280" height="720" fill="#FFFFFF"/>
```

### 5.4 数据来源

位于页面底部，固定格式：
```xml
<text x="60" y="695" font-family="..." font-size="14" fill="#94A3B8">
    <tspan>数据来源: XXX</tspan>
</text>
```

---

## 6. SVG 禁用特性与兼容性（shared-standards SS1-2）

### 6.1 绝对禁止

| 禁用特性 | 替代方案 |
|---------|---------| 
| HTML 命名实体（`&nbsp;` `&mdash;` `&copy;` `&ndash;` `&reg;` `&hellip;` `&bull;` …） | 直接写原生 Unicode 字符（`—` `–` `©` `®` `→` NBSP …） |
| 文本/属性值中裸写 `& < > " '` | 必须写成 XML 实体 `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` |
| `<style>` / `class` | 内联属性（`id` 在 `<defs>` 内合法） |
| `<foreignObject>` | `<text>` + `<tspan>` |
| `mask` | 叠加遮罩矩形 / gradient overlay |
| `<symbol>` + `<use>` | 直接写出完整元素 |
| `textPath` | 手动排列 `<text>` |
| `@font-face` | 系统字体栈 |
| `<animate*>` / `<set>` | 无（PPT 侧处理动画） |
| `<script>` / event 属性 | 无 |
| `<iframe>` | 无 |

### 6.2 PPT 兼容性替代

| 禁止语法 | 正确替代 |
|---------|----------|
| `fill="rgba(255,255,255,0.1)"` | `fill="#FFFFFF" fill-opacity="0.1"` |
| `<g opacity="0.2">...</g>` | 在每个子元素上单独设置 `fill-opacity` / `stroke-opacity` |
| `<image opacity="0.3"/>` | 在 image 后叠加 `<rect fill="背景色" opacity="0.7"/>` |

### 6.3 条件允许

| 特性 | 条件 | 转换结果 |
|------|------|----------|
| `marker-start` / `marker-end` | `<marker>` 在 `<defs>` 中，`orient="auto"`，形状为三角/菱形/圆 | DrawingML `<a:headEnd>` / `<a:tailEnd>` |
| `clipPath` on `<image>` | `<clipPath>` 在 `<defs>` 中，单子元素，**仅用于 image** | DrawingML `<a:prstGeom>` / `<a:custGeom>` |
| `stroke-dasharray` | 使用预设值 `4,4` / `2,2` / `8,4` / `8,4,2,4` | PPTX `<a:prstDash>` |
| `text-decoration` | `underline` / `line-through` | PPTX 原生文本格式 |
| `transform="rotate(...)"` | 所有元素类型均支持 | PPTX `<a:xfrm rot="...">` |

> 完整条件约束见 [`shared-standards.md`](../../references/shared-standards.md) SS1.1（marker 约束）和 SS1.2（clipPath 约束）。

### 6.4 虚线预设对照

| SVG 值 | PPTX 预设 | 适用场景 |
|--------|-----------|---------|
| `4,4` | Dash | 通用虚线、分隔线 |
| `2,2` | Dot (sysDot) | 占位轮廓、细边框 |
| `8,4` | Long dash | 时间线连接、流程箭头 |
| `8,4,2,4` | Long dash-dot | 技术图纸、尺寸线 |

---

## 7. 旧色映射速查表

在维护旧模板时，使用以下映射快速替换：

| 旧色 (Material/Flat) | → | 新色 (Tailwind) | 角色 |
|----------------------|---|-----------------|------|
| `#2C3E50` | → | `#0F172A` | 主文本 |
| `#7F8C8D` | → | `#64748B` | 副文本 |
| `#5D6D7E` | → | `#475569` | 图例文本 |
| `#95A5A6` | → | `#94A3B8` | 数据来源 |
| `#BDC3C7` | → | `#CBD5E1` | 淡化元素 |
| `#2196F3` / `#1976D2` | → | `#3B82F6` / `#2563EB` | 蓝色系列 |
| `#4CAF50` / `#388E3C` | → | `#10B981` / `#059669` | 绿色系列 |
| `#FF9800` / `#F57C00` | → | `#F59E0B` / `#D97706` | 橙色系列 |
| `#E91E63` | → | `#F43F5E` | 异常值 |
| `#000000` (shadow) | → | `#0F172A` | 阴影底色 |

---

## 8. 占位内容规范 (Placeholder Content Strategy)

既然这些 SVG 文件是供 AI 后续调用的“模板”，它们的核心价值在于展示 **图形结构、排版约束与视觉空间**，而不是传递真实的业务数据。因此，写入模板的文本内容应遵循以下“占位原则”：

### 8.0 全英文原则 (English-Only Rule)
**强制要求**：所有图表模板中的占位文本（包括标题、副标题、坐标轴、图例、数据节点、详情描述及底部来源说明）**必须全部使用英文编写**。
- **目的**：确保后续自动化管线中的 LLM 能够更精准地进行语义理解和结构化内容映射，同时英文单词的天然长度特征更易于在模板中展示排版时的换行逻辑与空间边界。

### 8.1 结构边界演示
- **展示最大宽度/换行逻辑**：刻意使用典型长度的字符串（如两到三个词的短语、多行 `tspan`）来明确展示文本框的边界。这样能确保 AI 填入真实文本时有直观的参考，防止溢出。
- **展示数据格式**：使用能体现完整格式特征的占位数值（如 `$1,234.5M`、`98.5%`）而不仅是简单的 `10`，以验证符号和字符宽度是否适配。

### 8.2 通用性与中立性
- 使用通用、专业的商业占位符，避免过于垂直或具象的特定业务数据（除非该模板本身具有强烈的行业属性）。
- **推荐做法**：使用 `Category A`、`Q1 Revenue`、`Strategic Objective`、`Phase 01`。
- **避免做法**：使用具体的长篇现实数据（如“某某品牌2023年特种设备销量分析”）。

### 8.3 视觉平衡
- 占位文本应当在视觉上保持图表的平衡性（例如蝴蝶图左右文本长度应大致相等，列表文本应长短错落有致），以便让人一眼看清图表的布局设计意图。

---

## 9. 注册到 charts_index.json

新增 SVG 模板后，**必须** 在 [`charts_index.json`](./charts_index.json) 中登记，否则 Strategist 选型时不会发现它。

### 9.1 登记位置

| 位置 | 是否必填 | 作用 |
|------|---------|------|
| `charts.<key>` | **必填** | 模板自身的元数据（label / summary / keywords） |
| `categories.<group>.charts[]` | **必填** | 归入一个语义类别（comparison / trend / strategy 等） |
| `quickLookup.<intent>[]` | 视情况 | 当模板能服务于某个高频意图时挂入对应桶（ranking / kpi / journey 等） |

### 9.2 字段规范

```json
"<key>": {
  "label": "<人类可读名称>",
  "summary": "Pick for <内容形态 + 规模>. Skip if <反例 → 替代模板>.",
  "keywords": ["<同义词 / 中英文别名 / 行业术语>"]
}
```

- **`key`** = SVG 文件名去掉 `.svg`，下划线小写（如 `bullet_chart`）
- **`summary`** 是**选型句**，不是描述句。语法见 `meta.summaryGrammar`：先说什么时候选它，再用 `Skip if ... (use <other_key>)` 指向最容易混淆的兄弟模板
- **`keywords`** 用于关键词匹配，覆盖中英文别名与典型业务场景词

### 9.3 反例

❌ 只写"是什么"：`"summary": "Bidirectional comparison chart for two datasets"`
✅ 写"何时选"：`"summary": "Pick for two mirrored datasets sharing a common axis (age pyramid, A/B). Skip for >2 sides (use grouped_bar_chart)."`

❌ 只放进 `charts.<key>` 而忘记 `categories` —— 这样模板会"孤儿化"，Strategist 浏览类别时看不到它。

---

## 10. 检查清单

新增或修改图表后，逐项检查：

### 基础校验
- [ ] `xmllint --noout` 通过
- [ ] viewBox 为 `0 0 1280 720`
- [ ] 首行为白色背景 `<rect width="1280" height="720" fill="#FFFFFF"/>`

### 色彩
- [ ] 无旧色残留（`grep` 验证，见下方命令）
- [ ] 阴影 `flood-color` 为 `#0F172A`，opacity 小于等于 0.20
- [ ] 数据来源用 `#94A3B8`

### 排版
- [ ] 无 `font-size < 12` 的文本
- [ ] 所有 `<text>` 内容包裹 `<tspan>`
- [ ] 同一行多格式用内联 `<tspan>`，**非**多个并排 `<text>`
- [ ] 内联 `<tspan>` 不携带 `x` / `y` / `dy`
- [ ] 标题 34px、副标题 18px、来源 14px

### 结构
- [ ] 主要元素有语义化 `<g id="...">`
- [ ] 无 `<style>`、`class`、`<foreignObject>`、`mask`、`rgba()`
- [ ] `<g>` 标签无 `opacity` 属性
- [ ] 文本字符为原生 Unicode（`—` `©` `→` NBSP 等），无 HTML 命名实体（`&nbsp;` `&mdash;` `&copy;` 等）；裸 `& < >` 已转义为 `&amp; &lt; &gt;`

### 阴影
- [ ] 使用 `feFlood` 方案（非 `feComponentTransfer`）
- [ ] 同页阴影 `dx`/`dy` 方向一致
- [ ] 每页带阴影元素不超过 3 个

### 注册（仅新增模板时）
- [ ] `charts_index.json` 的 `charts.<key>` 已登记 label / summary / keywords
- [ ] `summary` 写成选型句（`Pick for ... Skip if ... (use <other>)`），不是描述句
- [ ] 已加入 `categories.<group>.charts[]` 中合适的类别
- [ ] 若服务于高频意图，已加入 `quickLookup.<intent>[]`

### 坐标校准标记（calculator-supported 图表必填）
- [ ] 矩形坐标系图表（bar / horizontal_bar / grouped_bar / stacked_bar / line / area / stacked_area / scatter / waterfall / pareto / butterfly）包含 `<!-- chart-plot-area: x_min,y_min,x_max,y_max -->` 标记
- [ ] Pie / donut / radar 图表包含 `<!-- chart-plot-area: <type> | center: cx,cy | radius: r -->` 标记
- [ ] 标记位于 `<g id="chartArea">` 内、坐标轴之后、数据元素之前
- [ ] 坐标值与轴线的实际 SVG 坐标一致

### 验证命令
```bash
# 一键校验
f="your_chart.svg"
xmllint --noout "skills/ppt-master/templates/charts/$f" && echo "XML OK" || echo "XML FAIL"
echo "Old colors:" && grep -c '#2C3E50\|#7F8C8D\|#95A5A6\|#5D6D7E\|#000000' "skills/ppt-master/templates/charts/$f"
echo "Small fonts:" && grep -c 'font-size="[0-9]"' "skills/ppt-master/templates/charts/$f"
```
