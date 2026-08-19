# Kimi Careers 设计系统 · 实现交接 (DESIGN-HANDOFF)

> 给 AI 编码工具 / 工程师的实现契约。所有 token 实测自
> https://careers.kimi.com/ （2026-06-25）。**测量，不杜撰。**

## 1. 实现目标

复刻 careers.kimi.com 的视觉系统。它是一套**亮/暗双主题**的语义 token 体系，
招聘页默认以**暗色「复古终端」形态**呈现：纯黑画布、单一 Kimi 蓝强调、
像素签名字、发光射线（glow）而非投影。任何新页面都应只消费下表 token，
不得引入系统外硬编码色。

## 2. 来源映射 (Source Map)

| 资产 | 来源 |
|---|---|
| 站点 | https://careers.kimi.com/ (Next.js + Tailwind v4) |
| 主 token 表 | `/careers-assets/_next/static/chunks/5180814f5f83ca1d.css` |
| 招聘地图/动画 | `/careers-assets/_next/static/chunks/d1234ed065ef52a4.css` |
| 像素字 | `/assets/fonts/fusion-pixel-12px-mono-zh-hans.otf` |
| 逐 token 证据 | `source/evidence.md` |

## 3. 颜色 / 品牌契约 (Color Contract)

主题以 CSS 变量切换：亮色定义在 `:root`，暗色定义在 `.dark`。careers 页面用暗色。

| 角色 | token | 亮色 | 暗色 |
|---|---|---|---|
| 品牌主色 | `--brand` (km-blue) | `#1783ff` | `#1a88ff` |
| 主色 hover | `--brand-hover` | `#167ff7` | `#258eff` |
| 选中/焦点 | `--brand-focus` | `#1783ff33` | `#1a88ff33` |
| 成功 | `--success` | `#16c456` | `#16c456` |
| 警告 | `--warning` | `#ff9500` | `#ff9f0a` |
| 危险 | `--danger` | `#ff3849` | `#ff4756` |
| 黄 | `--yellow` | `#ffd230` | `#ffd230` |
| 霓虹绿(强调) | `--neon` | `#32ff7d` | `#32ff7d` |
| 一级文字 | `--text-1` | `#000000e6` | `#ffffffd6` |
| 二级文字 | `--text-2` | `#0009` | `#ffffff8f` |
| 三级文字 | `--text-3` | `#00000073` | `#ffffff6b` |
| 占位/禁用 | `--text-4` | `#0000004d` | `#ffffff42` |
| 页面地面 | `--bg` | `#f9fbfc` | `#161717` |
| 一级分组 | `--bg-secondary` | `#f5f5f5` | `#121212` |
| 卡片面 | `--surface-1` | `#ffffff` | `#1f1f1f` |
| 三级分组 | `--surface-2` | `#f5f5f5` | `#292929` |
| 分隔线/边框 | `--border` | `#00000021` | `#ffffff1f` |
| 浅线 | `--line` | `#0000000d` | `#ffffff14` |

**规则**
- Kimi 蓝是**唯一**品牌强调色；每屏出现不超过 2 次（链接 + 一个主 CTA/焦点）。
- 文字用**白/黑 alpha 叠加**，不要用实心灰 hex —— 这是 Kimi 体系的特征，灰阶温度随之自动正确。
- 暗色层次靠 `--bg → --bg-secondary → --surface-1` 的明度梯度 + Kimi 蓝 glow，**不要加常规投影**。

## 4. 字体契约 (Typography Contract)

```css
--font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
/* 签名像素字 */
@font-face{ font-family:"Fusion Pixel"; src:url(/assets/fonts/fusion-pixel-12px-mono-zh-hans.otf); }
```

- **正文** → sans；**代码/ID** → mono；**数字、编号、招聘地图标签** → Fusion Pixel（复古签名）。
- 字阶（实测，size / line-height）：
  - UI 界面阶：t1 18/26 · t2 16/24 · b1 15/22 · b2 14/20 · c1 12/18 · c2 10/14
  - MD 内容阶：h1 20/32 · h2 18/28 · b1 16/26 · b2 15/24 · b3 14/22
- 像素字在 10–12px 处最锐利（专为 12px 设计），用作 caption/数字最佳。

## 5. 间距 / 圆角 / 阴影契约

- **间距**：基数 `--spacing: 4px`（Tailwind v4），全部取 4 的倍数：4 / 8 / 12 / 16 / 24 / 32…
- **圆角**：`--radius-md: 6px`（实测唯一自定义值）。派生：sm 2 / lg 8 / xl 12px（Tailwind v4 默认）。
- **阴影**：来源**无**自定义 `--shadow-*` token。暗色形态用 Kimi 蓝 glow：
  `0 0 0 1px #1a88ff40, 0 0 28px #1a88ff33`。亮色如需投影，保持极轻（≤ `0 1px 2px`）。

## 6. 响应式契约 (Responsive Contract)

Tailwind v4 默认断点（8 视口验证矩阵见 manifest）：

| 名 | 阈值 |
|---|---|
| 基础 | 0 |
| sm | 640px |
| md | 768px |
| lg | 1024px |
| xl | 1280px |
| 2xl | 1536px |

要求：360 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1920 下无横向滚动；移动端为小屏重排，而非缩小桌面卡片。

## 7. 设计保真契约 (Fidelity Contract)

必须命中下面 careers.kimi.com 的签名细节，否则只是通用暗色模板：
1. 纯黑/近黑画布 `#161717`，不是蓝灰。
2. 像素字 Fusion Pixel 出现在数字与标签上。
3. Kimi 蓝**发光**（glow），不是投影。
4. 复古终端气质：可选复刻招聘地图发光射线、字符 shuffle 滚动动画
   （来源 `RecruitmentMap` / `.shuffle-char`）。

## 8. 实现顺序 (Implementation Sequence)

1. 把 `tokens`（见 manifest / 本文 §3–5）落到 `:root` 与 `.dark`。
2. 绑定字体（@font-face 像素字 + sans/mono 栈）。
3. 用 `--bg / --surface-1 / --border` 搭骨架，先灰块占位。
4. 填真实内容，Kimi 蓝只点 2 处。
5. 加一处签名动效（glow 或 shuffle）。
6. 跑 §9 自检 + 8 视口。

## 9. 自检清单

- [ ] 所有颜色来自 `var(--*)`，无系统外硬编码 hex。
- [ ] Kimi 蓝每屏 ≤ 2 次。
- [ ] 文字用 alpha 阶，不是实心灰。
- [ ] 暗色无常规投影，层次靠明度 + glow。
- [ ] 数字/编号用像素字。
- [ ] 8 视口无横向滚动。
- [ ] 无 emoji 图标（用 1.7px monoline SVG）。
