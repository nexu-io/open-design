---
name: clb-design-system
description: CLB Design System — Computing Lab (CLB) 研发基础设施与环境管理平台设计系统，支持明暗双主题、简体中文、数据密集型 B 端产品
user-invocable: true
---

# CLB Design System — Agent Skill

## What is inside

从 Computing Lab (CLB) 研发基础设施与环境管理平台的工作台原型中提取的完整设计系统包：

| 文件 | 内容 |
|------|------|
| `DESIGN.md` | 9 章完整设计规范：视觉主题、颜色、字体、间距、布局、组件、动效、文案语调、反模式 |
| `colors_and_type.css` | 可直接引用的 CSS token 文件，含所有 `:root` 自定义属性 |
| `preview/` | 6 张聚焦预览卡片：颜色调色板、字体样本、间距 tokens、组件库、品牌资产、应用界面 |
| `ui_kits/app/` | 可运行的 UI Kit 展示页，从 workspace.html 源原型中提取全部 12 类组件 |
| `context/provenance.md` | 设计决策溯源：源证据文件、token 推导过程、已知缺口 |

## Source context

- **源项目**: CLB prototype (58a34454-39e4-4ee4-af30-3e179c4c9dbf) — Open Design prototype
- **产品**: Computing Lab (CLB) — 研发基础设施与环境管理平台 (服务器数字化管理系统)
- **主要原型文件**: `workspace.html` (45KB) — 完整 Shell 布局 + 全部组件实现
- **设计评分**: 4/5 (来自 critique.json) — 层次结构满分(5/5)，动效和加载态有提升空间

## When to use

- 研发基础设施与环境管理平台 (R&D infrastructure & environment management)
- 服务器数字化管理系统 / 资源池管理 Dashboard
- 基础设施运维工作台 (operations workbench)
- 企业内部数据密集型 B 端工具
- 需要简体中文 (zh-CN) 专业工程语调的产品
- Neutral Modern token 体系 + Soft Paper 布局模式组合

## How to use

### 绑定 token

```html
<link rel="stylesheet" href="colors_and_type.css" />
```

或直接复制 `:root` 块到 `<style>` 标签中。

### 布局模式

```
Sidebar (256px) | Topbar (48px) | Content (scrollable grid)
```

KPIs → 双列表格卡片 → 全宽内容卡片 — 自上而下按优先级排列。

### 核心规则（P0 强制）

1. **表面层级 > 阴影** — 用暖白堆叠(`--canvas` → `--surface-muted` → `--surface`)区分层级，而非阴影
2. **品牌色克制** — `--accent` (#2f6feb) 每屏最多出现两次
3. **语义色仅用于状态** — 绿/黄/红只用于 Pill、异常卡片、KPI 趋势
4. **全局等宽数字** — 所有计数、日期、KPI 使用 `font-feature-settings: "tnum"`
5. **中文优先** — 所有 UI 文案为简体中文，术语精确

## Design-system highlights

- **暖白表面堆叠**: canvas (#f2f2f0) → surface-muted (#fafaf9) → surface (#ffffff)，约 3% 亮度差实现柔和浮动感
- **三级圆角**: card (16px) / tile (12px) / control (8px)
- **16px 基准网格**: shell gap、card gap、KPI gap 均为 16px
- **三段式间距**: content padding 为 24px(top) 28px(horizontal) 32px(bottom)
- **系统字体栈**: PingFang SC + Microsoft YaHei + Inter — 中英文原生渲染
- **150ms ease-standard**: 所有过渡统一使用 `cubic-bezier(0.2, 0, 0, 1)`
- **明暗双主题**: `[data-theme="dark"]` + `prefers-color-scheme: dark`，暖白→冷暗堆叠，语义色和 Pill 对全适配
- **骨架屏**: `.skeleton` shimmer 动画，卡片/表格加载占位
- **入场动画**: KPI 卡片和内容卡片错峰淡入上移，尊重 `prefers-reduced-motion`

## Anti-patterns (blocking)

- 渐变背景（所有表面为纯色）
- Emoji 作为功能图标（使用 SVG symbols）
- 左侧色条装饰卡片（卡片使用均匀 border-soft）
- 浮动操作按钮（主操作在页面头部或卡片头部）
- 厚重阴影（shadow token 仅为 rgba(10,10,10,.04)）
- 品牌色的装饰性使用
