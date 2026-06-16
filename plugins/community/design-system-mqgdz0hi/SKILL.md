# 华昇影视 直播间搭建 Design System

> Category: Custom
> Surface: web
> Version: 1.0.0

华昇影视 (Huasheng Studios / 温州华昇影视文化传播有限公司) — 专业直播间搭建解决方案机构，提供直播间设计搭建、灯光调试、设备调试、画面质检、设备零售批发。

## Source Context

| Evidence | File | Content |
|----------|------|---------|
| Brand Book | `build/Huasheng-Brand-Book.pdf` | 15-page VI guideline (logo system, clear space, misuse, standard colors, typography, cover applications) |
| Brand Brief | `source_examples/brand-kit-README.md` | One-page brand summary: colors, typography, voice, marks |
| Skill Brief | `source_examples/brand-kit-SKILL.md` | Machine-readable brand instructions with component list |
| Color Spec | `assets/guideline-pages/colors.png` | Visual color swatch reference |
| Typography Spec | `assets/guideline-pages/typography-1.png`, `typography-2.png` | Visual typography reference |
| Logo Spec | `assets/guideline-pages/logo.png`, `logo-clearspace.png`, `logo-reversed.png` | Logo and clearspace rules |
| Misuse Guide | `assets/guideline-pages/logo-misuse.png` | Anti-pattern reference |
| Cover Examples | `assets/guideline-pages/cover.png`, `douyin-covers.png`, `service-covers.png` | Layout application examples |
| Production Assets | `assets/logos/` (5 files), `build/` (4 files) | Logo and runtime build assets |

---

## 1. Visual Theme & Atmosphere

> **来源:** `source_examples/brand-kit-README.md` (Brand in one line, Marks 节) + `assets/guideline-pages/cover.png`, `assets/guideline-pages/logo.png`

墨黑为底，一抹公司红。大面积浅灰页面，配以超大思源黑体 Black 900 展示字体，形成强烈视觉冲击。品牌调性: 专业、直接、落地，不堆砌装饰，用比例和留白说话。

核心视觉锚点:
- **公司红印章 (直播间设计)** — 最具辨识度的品牌符号，不可改色
- **HS 几何交叠 S 形标志** — 品牌辅助符号
- **书法体「华昇」字标** — 主 logotype
- **2px 墨线分割 + 56×3px 红色标记** — 编辑式布局标识

两种背景语境:
1. **浅色页面** — `#f0f0f0` 底，黑字，红点缀
2. **深色封面/英雄** — 近黑底，白字，红点缀

---

## 2. Color

> **来源:** `source_examples/brand-kit-README.md` (Colors 节: 公司红 `#b90005`, 公司黑 `#000000`, 公司白 `#ffffff`, 公司灰 ramp) + `assets/guideline-pages/colors.png`

### 2.1 Brand Primaries

| Token | 名称 | Hex | OKLch | 用途 |
|-------|------|-----|-------|------|
| `--brand-red` | 公司红 | `#b90005` | `oklch(44% 0.22 24)` | 唯一强调色，每屏不超过 2 处 |
| `--brand-black` | 公司黑 | `#000000` | `oklch(0% 0 0)` | 正文、标题 |
| `--brand-white` | 公司白 | `#ffffff` | `oklch(100% 0 0)` | 深色背景上的文字 |

### 2.2 Neutral Gray Ramp

| Token | Hex | OKLch | 用途 |
|-------|-----|-------|------|
| `--gray-50` | `#f0f0f0` | `oklch(95% 0 0)` | 页面底色 |
| `--gray-100` | `#dcdcdc` | `oklch(89% 0 0)` | 分割线、弱边框 |
| `--gray-200` | `#c8c8c8` | `oklch(82% 0 0)` | 卡片边框 |
| `--gray-400` | `#969696` | `oklch(65% 0 0)` | 辅助文字 |
| `--gray-600` | `#505050` | `oklch(39% 0 0)` | 次要标题 |
| `--gray-900` | `#1a1a1a` | `oklch(14% 0 0)` | 深色卡片底 |

### 2.3 Semantic Assignments

| Token | Value | 用途 |
|-------|-------|------|
| `--bg` | `#f0f0f0` | 页面背景 |
| `--bg-dark` | `#0a0a0a` | 深色封面/英雄背景 |
| `--surface` | `#ffffff` | 卡片、面板底色 |
| `--surface-dark` | `#1a1a1a` | 深色卡片底色 |
| `--fg` | `#000000` | 正文颜色 |
| `--fg-inverse` | `#ffffff` | 深色背景正文 |
| `--muted` | `#969696` | 辅助文字 |
| `--muted-dark` | `#505050` | 深色模式下辅助文字 |
| `--border` | `#dcdcdc` | 默认边框 |
| `--border-dark` | `#333333` | 深色边框 |
| `--accent` | `#b90005` | 唯一强调色 |
| `--accent-hover` | `#8a0004` | 悬停/按压态 |
| `--success` | `#2e7d32` | 成功状态 |
| `--warning` | `#f57f17` | 警告状态 |
| `--error` | `#b90005` | 错误状态 (复用公司红) |

---

## 3. Typography

> **来源:** `source_examples/brand-kit-README.md` (Typography 节: 思源黑体/Noto Sans SC, Light 300–Black 900) + `assets/guideline-pages/typography-1.png`, `assets/guideline-pages/typography-2.png`

### 3.1 Font Stack

品牌字体为 **思源黑体 (Source Han Sans / Noto Sans SC)**，所有中英文排版统一使用。

| 角色 | 字体 | Fallback |
|------|------|----------|
| Display | Noto Sans SC Black 900 | `'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| Heading | Noto Sans SC Bold 700 | 同上 |
| Body | Noto Sans SC Regular 400 | 同上 |
| Caption | Noto Sans SC Light 300 | 同上 |

字体权重映射: Light 300 / Regular 400 / Medium 500 / Bold 700 / Black 900

### 3.2 Type Scale (web — 16px base)

| 层级 | Size | Weight | Line-height | Letter-spacing | 用途 |
|------|------|--------|-------------|----------------|------|
| Display XL | 120px | 900 | 1.1 | -0.02em | 首页大标题 |
| Display L | 72px | 900 | 1.15 | -0.01em | 封面/章节标题 |
| Display M | 48px | 700 | 1.2 | 0 | 页面标题 |
| Heading L | 36px | 700 | 1.3 | 0 | 区块标题 |
| Heading M | 28px | 700 | 1.35 | 0 | 卡片标题 |
| Heading S | 22px | 500 | 1.4 | 0.05em | 小标题/标签 |
| Body L | 18px | 400 | 1.6 | 0 | 正文 |
| Body M | 16px | 400 | 1.6 | 0 | 正文 (default) |
| Body S | 14px | 400 | 1.5 | 0 | 辅助说明 |
| Caption | 12px | 300 | 1.5 | 0.01em | 标注/脚注 |
| Eyebrow | 13px | 500 | 1.4 | 0.22em | 英文眉标/分类标签 |
| Rule | n/a | n/a | n/a | n/a | 2px 墨线分割 + 56×3px 红色标记 |

---

## 4. Spacing

> **来源:** 从品牌规范页推演 — `assets/guideline-pages/cover.png` 展示的留白关系 + `assets/guideline-pages/douyin-covers.png` 的封面版式节奏

### 4.1 Scale (4px base)

| Token | Value | 用途 |
|-------|-------|------|
| `--space-xs` | 4px | 最小间距 |
| `--space-sm` | 8px | 图标文字间距 |
| `--space-md` | 16px | 组件内间距 |
| `--space-lg` | 24px | 区块内间距 |
| `--space-xl` | 32px | 区块间间距 |
| `--space-2xl` | 48px | 节间距 |
| `--space-3xl` | 64px | 大区块间距 |
| `--space-4xl` | 96px | 页面级间距 |
| `--space-5xl` | 128px | 英雄区上下留白 |

### 4.2 Radius

| Token | Value | 用途 |
|-------|-------|------|
| `--radius-none` | 0 | 品牌标识/分割线 |
| `--radius-sm` | 2px | 输入框、标签 |
| `--radius-md` | 4px | 按钮、卡片 |
| `--radius-lg` | 8px | 大卡片、面板 |
| `--radius-full` | 9999px | 药丸标签、头像 |

### 4.3 Shadows

品牌使用柔和中性投影，哑光表面。

| Token | Value | 用途 |
|-------|-------|------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)` | 卡片悬浮 |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | 弹窗、下拉 |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.05)` | 模态框 |

### 4.4 Layout Rhythm

- 基础网格: 8px 栅格对齐
- 最大内容宽度: 1200px (营销页面)、1400px (工具界面)
- 章节间距: `--space-3xl` (64px) 到 `--space-5xl` (128px)
- 暗色封面之间用 `<hr>` 或 2px 墨线过渡

---

## 5. Layout & Composition

> **来源:** `assets/guideline-pages/cover.png` (英雄区布局) + `assets/guideline-pages/service-covers.png` (封面网格) + `assets/guideline-pages/douyin-covers.png` (抖音封面版式)

### 5.1 Page Structure

```
┌─────────────────────────────────┐
│         全局导航 (1200px)        │
├─────────────────────────────────┤
│         英雄/封面区               │
│     (全宽 / 深色底)              │
├─────────────────────────────────┤
│      章节区域 (1200px)           │
│   ┌───┬───┬───┐                │
│   │   │   │   │  3 列卡片       │
│   └───┴───┴───┘                │
├─────────────────────────────────┤
│    CTA / 页脚 (1200px)          │
└─────────────────────────────────┘
```

### 5.2 Key Layout Rules

- **编辑式区块头** — 左侧 2px 竖线 + 分类眉标 + 大标题 + 红色标记
- **卡片网格** — 3 列为主 (服务/案例展示), 2 列为辅 (详细对比)
- **暗亮交替** — 浅灰页面为主，关键转化区用深色封面打断
- **大留白** — 区块标题上下至少保留 `--space-2xl` 间距
- **单栏正文** — 长文本限制 56ch 行宽，居中或左对齐

### 5.3 Responsive

| 断点 | 宽度 | 布局变化 |
|------|------|----------|
| Mobile | < 768px | 单列堆叠，标题缩减，导航改为汉堡菜单 |
| Tablet | 768–1024px | 2 列卡片，标题保持，侧边栏折叠 |
| Desktop | ≥ 1025px | 3 列卡片，完整导航，最大宽度约束 |

---

## 6. Components

> **来源:** `source_examples/brand-kit-SKILL.md` (Components 节: Button, Tag, Badge, Card, SealStamp, SectionHeader, Input, Select) + `assets/guideline-pages/logo-clearspace.png`, `assets/guideline-pages/logo-misuse.png`

### 6.1 Button

| Variant | BG | Text | Border | Hover |
|---------|-----|------|--------|-------|
| Primary | `--accent` | `--fg-inverse` | none | `--accent-hover` |
| Secondary | transparent | `--accent` | `--accent` 2px | `--accent` bg 10% |
| Ghost | transparent | `--fg` | none | `--gray-100` bg |
| Dark | `--bg-dark` | `--fg-inverse` | none | `--gray-900` bg |

- Radius: `--radius-md` (4px)
- Padding: 12px 24px
- 最小点击区域: 44×44px (mobile)
- Transition: 200ms ease

### 6.2 Card

```
┌─────────────────────┐
│                     │
│     [Image Area]    │
│                     │
├─────────────────────┤
│  Eyebrow / Tag      │
│  Card Title         │
│  Description text   │
│  ── CTA →           │
└─────────────────────┘
```

- BG: `--surface`
- Border: 1px `--border`
- Radius: `--radius-lg` (8px)
- Shadow: `--shadow-sm` → `--shadow-md` (hover)
- Padding: `--space-lg` (24px)
- Transition: 240ms ease

### 6.3 Section Header (编辑式区块头)

```html
<div class="section-header">
  <div class="section-header__bar"></div>       <!-- 2px × 40px 竖线 -->
  <span class="section-header__eyebrow">SERVICES</span>  <!-- 眉标 -->
  <h2 class="section-header__title">核心服务</h2>  <!-- 大标题 -->
  <div class="section-header__tick"></div>      <!-- 56px × 3px 红色标记 -->
</div>
```

### 6.4 Tag / Badge

- Pill shape (`--radius-full`)
- BG: `--accent` 10% opacity | Text: `--accent`
- Font: Caption (12px), Medium 500

### 6.5 Seal Stamp (印章)

- 独立组件，不可改色
- 使用 `assets/logos/mark-red.png`
- 尺寸: 48–80px 见方
- 通常固定于卡片/封面的右下角或标题旁

### 6.6 Input

- Border: 1px `--border`, focus: `--accent` 2px
- Radius: `--radius-sm` (2px)
- BG: `--surface`
- Height: 44px (mobile minimum)
- Padding: 8px 12px

### 6.7 Select

- 同 Input 样式
- 自定义下拉箭头 (6px 旋转三角形)

---

## 7. Motion & Interaction

> **来源:** `source_examples/brand-kit-README.md` (calm fades ≤360ms, no bounce)

| 场景 | Duration | Easing | 说明 |
|------|----------|--------|------|
| Hover (color) | 200ms | ease | 按钮/链接颜色过渡 |
| Hover (card lift) | 240ms | ease-out | 卡片上浮 + 阴影加深 |
| Fade in | 300ms | ease-out | 区块/页面渐入 |
| Slide in | 360ms | ease-out | 侧边栏/抽屉滑入 |
| Page transition | 300ms | ease-in-out | 页面切换 |

所有动效不超过 360ms。无弹跳 (bounce) 效果。

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Focus

- 默认: `outline: 2px solid var(--accent); outline-offset: 2px;`
- 键盘导航可见，鼠标点击隐藏 (`:focus-visible`)

### Loading

- 骨架屏 (skeleton): `--gray-100` 底，pulse 动画 1.5s
- Spinner: 2px `--accent` 环，旋转动画

---

## 8. Voice & Brand

> **来源:** `source_examples/brand-kit-README.md` (Voice 节: direct, concrete, peer-to-peer, Chinese-led, no emoji; Slogan: 抱素怀光，昭及四方。)

### 8.1 Copy Style

- **直接、具体、对等** — 说「直播间搭建」「灯光调试」「调色滤镜」，不说空话
- **中文主导** — 正文全部中文，英文仅用于眉标/标签 (spaced caps)
- **不堆砌形容词** — 不写「极致体验」「无与伦比」等空洞修饰
- **不使用 emoji** — 永远不用

### 8.2 Terminology

| 使用 | 不使用 |
|------|--------|
| 直播间搭建 | 演播室构建 |
| 灯光调试 | 照明调节 |
| 画面质检 | 画质检测 |
| 设备调试 | 装备调试 |

### 8.3 Slogan

**抱素怀光，昭及四方。**

(拥抱朴素，心怀光芒，照耀四方。)

---

## 9. Anti-patterns

> **来源:** `assets/guideline-pages/logo-misuse.png` (Logo 误用示例) + `source_examples/brand-kit-README.md` (Brand in one line, Marks 节: red seal never recolor)

### 禁止项

- ❌ 除公司红 `#b90005` 之外的任何强调色
- ❌ 紫色/蓝紫渐变 → 品牌不涉及任何紫色系
- ❌ emoji 作为图标或装饰
- ❌ Inter / Roboto / Arial 作为展示字体 (正文除外)
- ❌ 圆角卡片 + 左侧彩色边框强调 → 品牌使用编辑式 2px 竖线 + 红色标记
- ❌ 暖色调米色/桃色/粉色页面背景 → 品牌底色为 `#f0f0f0` 纯灰
- ❌ 多色大纲、七彩标签、竞赛式对比色
- ❌ 弹跳 (bounce) 动画
- ❌ 过度阴影 → 品牌投影克制 (`--shadow-sm` 为主)
- ❌ 大面积渐变覆盖 → 品牌底色为纯色
- ❌ 行距松散的大段正文 → 正文最多 1.6 倍行距
- ❌ 把红色印章 (mark-red) 改色为其他颜色

## Provenance

Formalized by Open Design from candidate a4d40cec-4af5-4849-890a-1288b40221ae.
