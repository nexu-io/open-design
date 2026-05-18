# 质量检查清单 (Editorial Checklist for Phantom Motion)

本清单萃取自 Monocle 杂志级 PPT 的真实迭代踩坑经验，适配 Phantom Motion 的 WebGL + GSAP 动态引擎。按重要性排序，生成前通读一遍，生成后逐项自检。

---

## 🔴 P0 · 一定不能犯的错

### 0. 类名必须在 CSS 中有定义

**现象**：直接把 layouts-editorial.md 的骨架粘到 HTML，样式全部丢失——大标题变成非衬线、数据卡片字体小得像正文、pipeline 糊成一坨。

**做法**：生成 HTML 前，**确认 `<style>` 块里有以下类的定义**：
`h-hero / h-xl / h-sub / h-md / lead / kicker / meta-row / stat-card / stat-label / stat-nb / stat-unit / stat-note / pipeline-section / pipeline-label / pipeline / step / step-nb / step-title / step-desc / grid-2-7-5 / grid-2-6-6 / grid-2-8-4 / grid-3-3 / grid-6 / grid-3 / frame / frame-img / img-cap / callout / callout-src`

如果某个类缺了，**在 `<style>` 里补上**，不要在每页 inline 重写。

### 1. 不要用 emoji 作图标

**现象**：在杂志风格里用 emoji（🎯 💡 ✅）会立刻破坏格调。

**做法**：用 Lucide 图标库。常用：`target / compass / search-check / share-2 / crown / check-circle / x-circle / arrow-right`

### 2. 图片只裁底部，左右和顶部绝对不能切

**做法**：图片容器用 `object-fit:cover` + `object-position:top center`。网格内用**固定 height + overflow hidden**，**不要用 `aspect-ratio`**（会在网格中撑破容器）。

### 3. 大标题字号双约束

**做法**：所有大字号必须 `font-size: min(Xvw, Yvh)`，且 **Y ≥ X × 1.6**。
- `h-hero`：`min(11.6vw, 19vh)` → 只用 vw 会在 16:9 屏缩水 20%
- `h-xl`：`min(7vw, 12vh)`
- 中文大标题 ≤ 5 字且 `nowrap`（避免 1 字 1 行）

### 4. 字体三级分工

| 层级 | 字体 | 用途 |
|------|------|------|
| 衬线 | Playfair Display / Noto Serif SC | 标题、重点 quote、数字大字 |
| 非衬线 | Inter / Noto Sans SC | 正文、描述、pipeline 步骤 |
| 等宽 | IBM Plex Mono / JetBrains Mono | kicker、meta、foot 标签 |

**严禁混用**。如果大标题是非衬线，99% 是类名未定义。

### 5. 图片不要 `align-self:end` 贴底

**做法**：图文混排**必须用 grid**；右列图片保持 `align-items:start` 贴顶。要让左列 callout 贴底，给**左列**加 `flex column + justify-content:space-between`，不要动右列。

### 6. 图片只用标准比例

**做法**：无论原图什么比例，固定用 **16:9 / 16:10 / 4:3 / 3:2 / 1:1 / 21:9**。图片自动 cover + top，只裁底部。

### 7. 画布对齐法则

**做法**：如果外容器已有 `padding:5vh 5vw`，内部主体不要再加 `padding:5vw`，否则双倍内缩。主体用 `padding:0`，只靠 grid gap 控垂直间距。

### 8. kicker 在大标题上方（不要左右排）

**做法**：kicker 和大标题用 `flex-direction:column`，不要用 `grid-template-columns:auto 1fr`。

---

## 🟡 P1 · 排版节奏

### 9. 主题节奏硬规则

- ❌ 连续 3 页以上同主题 = 不允许
- ❌ 8 页以上没有 ≥1 `hero dark` + ≥1 `hero light` = 不允许
- ❌ 全是 `light` 正文页没有 `dark` = 视觉平淡
- ✅ 每 3-4 页插入 1 个 hero 页
- 生成前画主题节奏表，生成后确认交错

### 10. Hero 页和非 hero 页交替

连续 2 页以上 hero 会让人疲劳，连续 4 页以上 non-hero 会让节奏死。

### 11. chrome 和 kicker 不要写同一句话

chrome 是杂志页眉（跨页稳定），kicker 是本页引导句（每页不同）。一个描述栏目，一个描述这一页。

### 12. 动效标记完整性

每页**至少给 kicker / 主标题 / lead / callout / stat-card / figure 加 `data-anim`**。生成后检查，平均每页 ≥ 3 个标记。

### 13. 底部内容预留导航空间

导航组件在 ~97vh，内容收尾不要过 93vh。需要贴底时用安全区机制。

---

## 🟢 P2 · 视觉打磨

### 14. WebGL 背景遮罩透明度

| 类型 | 遮罩 |
|------|------|
| dark hero | 12-15%（WebGL 明显透出） |
| light hero | 16-20%（隐约可见，不抢字） |
| 普通页 | 92-95%（几乎不透） |

### 15. Light hero 的 shader 不能有强中心点

禁止 Spiral Vortex、径向涟漪。用 FBM 域扭曲无中心流动。

### 16. 标题与正文间距

两段式布局（标题 + 内容），中间留 `margin-top:6vh ~ 8vh`。

### 17. 图片不要加厚边框/阴影

最多极淡圆角 + 底噪。不要 `box-shadow`，不要粗 `border`。

### 18. 中文大标题字号分档

| 形态 | 字号 |
|------|------|
| 1 行 ≤ 8 字 | `min(6.4vw, 11.2vh)` |
| 2 行 每行 ≤ 8 字 | `min(5.8vw, 10.2vh)` |
| 2 行 任一行 9-12 字 | `min(5.2vw, 9.2vh)` |

---

## 🔵 P3 · 操作细节

### 19. 术语用法统一

同一个词全篇 1 个写法。术语优先英文单词（Skills / Pipeline / Workflow），别硬翻译。

### 20. 不要用 `height:100vh`，用 `min-height:80vh`

`100vh` 在浏览器工具栏会溢出。用 `min-height:80vh + align-content:center` 更稳。

### 21. 页码格式统一

chrome 用 `XX / 总页数`（如 `05 / 27`）。

---

## 🧪 最终自检清单

```
预检（生成前）
  □ 已确认 <style> 里有所有需要的类
  □ 已决定每页用哪个 Layout（1-10）
  □ 已画出主题节奏表：每页明确 hero dark / hero light / light / dark
  □ 节奏表满足硬规则
  □ 字号都用了 min(Xvw, Yvh) 双约束，Y ≥ X × 1.6

内容
  □ 没有使用 emoji 作图标
  □ 术语用法统一
  □ 每页的 kicker + 标题 + 正文 三级信息清晰
  □ chrome 和 kicker 没有写同一句话

排版
  □ 大标题没有出现 1 字 1 行
  □ 图片网格用 height:Nvh 而非 aspect-ratio
  □ 图片只裁底部，顶部和左右完整
  □ 衬线/非衬线/等宽字体分工正确
  □ 底部内容不超过 93vh

视觉
  □ hero 和非 hero 页交替
  □ WebGL 背景在 hero 页可见
  □ 没有沉重的阴影和边框
  □ 粒子主色跟随 --accent 变量

动效
  □ 每页 ≥3 个 data-anim 标记
  □ 翻页时内容逐个淡入
```
