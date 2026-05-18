# Minimal Mono 设计系统 (Phantom v11 规范)

核心理念：**克制、灰阶、基于 Alpha 的层级、1px 物理精度。**

---

## 1. 颜色令牌 (Color Tokens)

禁止使用固定灰度值（如 `#ccc`），必须使用基于前景色 (`--foreground`) 的透明度阶梯。

| Role | Token | 用途 |
|---|---|---|
| Surface | `bg-white` | 编辑器面板、Toolbar、浮层背景 |
| Canvas | `bg-[#fafaf9]` | 工作区底色，与面板形成极细微对比 |
| Text Primary | `text-foreground` | 标题、激活状态、关键数值 |
| Text Secondary | `text-foreground/70` | 默认文字、图标 |
| Text Label | `text-foreground/40` | 分组标签（Uppercase, 10px） |
| Border | `border-foreground/10` | 容器边框、分割线 |
| Hover | `bg-foreground/[0.04]` | 按钮悬停态 |

---

## 2. 视觉组件规范 (Components)

### 2.1 面板 (Panels)
- **圆角**: `rounded-xl` (12px)
- **边框**: 1px `border-foreground/10`
- **阴影**: 双层系统
  - 近层: `shadow-[0_2px_12px_rgba(0,0,0,0.04)]`
  - 远层: `shadow-[0_8px_32px_rgba(0,0,0,0.06)]`

### 2.2 操控按钮 (Ghost Buttons)
- **形态**: 无背景，hover 时出现 `bg-foreground/[0.04]`。
- **图标**: Lucide-React，尺寸 `w-3.5 h-3.5`。
- **文字**: `text-[13px]`。

### 2.3 数字展示 (Tabular Numbers)
- **字体**: 必须添加 `tabular-nums` class。
- **交互**: 鼠标悬停在数值上时显示 `ew-resize` 光标，支持拖拽改变数值（Scrubbing）。

---

## 3. 混合动力桥接 (The Bridge)

- **舞台隔离**: `stage.html` 中的所有样式必须独立于编辑器样式。
- **通信**: 编辑器 UI 发送 `POST_MESSAGE`，舞台层 GSAP 接收并执行 `to()` 动画。
- **同步**: 舞台层播放进度实时反馈给编辑器的 Timeline 组件。
