# KaTeX 数学公式实时渲染引擎

> 融合自 AetherViz Master 的 KaTeX 公式渲染能力，适配 Phantom Motion 幻灯片体系。
> 适用场景：技术/科学主题路演中需要展示数学公式、物理定律、化学方程式。

---

## 核心思想

在 Phantom Deck 幻灯片中，直接用 LaTeX 语法书写公式，由 KaTeX 在浏览器中实时渲染为高保真矢量公式。比截图贴入的优势：

1. **无限缩放不模糊**（矢量渲染）
2. **可配合 GSAP 做逐行公式推导动画**
3. **适配亮/暗色主题**（CSS 变量控制颜色）

---

## CDN 引入

```html
<!-- KaTeX CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">

<!-- KaTeX JS -->
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>

<!-- 自动渲染扩展（扫描 DOM 中的 $...$ 和 $$...$$ 语法） -->
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
```

---

## 自动渲染初始化

```javascript
// 页面加载完成后，自动扫描所有幻灯片中的 LaTeX 语法并渲染
document.addEventListener('DOMContentLoaded', () => {
    renderMathInElement(document.body, {
        delimiters: [
            { left: '$$', right: '$$', display: true },   // 块级公式
            { left: '$', right: '$', display: false },     // 行内公式
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
    });
});
```

---

## 在幻灯片中使用

```html
<!-- 行内公式 -->
<p>爱因斯坦的质能方程 $E = mc^2$ 揭示了质量与能量的等价关系。</p>

<!-- 块级公式（居中显示） -->
<div class="formula-block">
    $$F = G \frac{m_1 m_2}{r^2}$$
</div>

<!-- 多行推导 -->
<div class="formula-derivation" style="opacity: 0;">
    $$\begin{aligned}
    \nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
    \nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \epsilon_0 \frac{\partial \mathbf{E}}{\partial t}
    \end{aligned}$$
</div>
```

---

## GSAP 公式推导动画

```javascript
// 逐行公式淡入推导效果
function animateFormulas(slideTimeline) {
    const formulas = document.querySelectorAll('.formula-derivation');

    formulas.forEach((formula, index) => {
        slideTimeline.from(formula, {
            opacity: 0,
            y: 20,
            duration: 0.8,
            ease: "power2.out"
        }, index * 1.2 + 0.5);
    });
}
```

---

## 公式样式适配

```css
/* 公式块居中 + 上下留白 */
.formula-block {
    text-align: center;
    margin: 1.5rem 0;
    font-size: 1.4em;
}

/* 暗色主题适配 */
.phantom-slide .katex { color: inherit; }

/* 新拟物主义主题：凹陷公式框 */
.neu-formula {
    display: inline-block;
    padding: 16px 28px;
    border-radius: 12px;
    box-shadow: inset 4px 4px 8px var(--shadow-dark),
                inset -4px -4px 8px var(--shadow-light);
    margin: 1rem 0;
}

/* 赛博朋克主题：霓虹公式 */
.cyber-formula .katex {
    color: #22D3EE;
    text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}

/* 极简学术主题：衬线体公式 */
.academic-formula .katex {
    color: #1a1a2e;
}
```

---

## 与 3D 标注联动

可将 KaTeX 渲染结果放置在 SVG Overlay 的 `foreignObject` 中，从而实现公式跟随 3D 模型旋转：

```javascript
function attachFormulaToModel(svgOverlay, camera, container, worldPos, latex) {
    const pos = projectToScreen(worldPos, camera, container);
    if (!pos.visible) return;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', pos.x + 20);
    fo.setAttribute('y', pos.y - 30);
    fo.setAttribute('width', '250');
    fo.setAttribute('height', '80');

    const div = document.createElement('div');
    div.style.cssText = 'background: rgba(0,0,0,0.7); border-radius: 8px; padding: 8px 12px;';
    katex.render(latex, div, { throwOnError: false, displayMode: false });

    fo.appendChild(div);
    svgOverlay.appendChild(fo);
}
```

---

## 与 Phantom Deck 集成要点

1. **按需加载**：仅当模板或用户主题涉及数学/科学公式时，才在 `<head>` 中引入 KaTeX CDN，避免不必要的网络请求。
2. **编辑兼容**：双击公式区域后，应显示原始 LaTeX 源码供用户编辑，编辑完成后重新调用 `katex.render()` 渲染。
3. **导出保留**：导出 HTML 时，KaTeX 渲染后的 DOM 结构会被完整保留，即使离线也能正常显示公式（因为 KaTeX CSS 已 inline）。
