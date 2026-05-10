# 混合渲染引擎：Three.js + SVG Overlay 坐标同步架构

> 融合自 AetherViz Master 的混合渲染理念，适配 Phantom Motion 的 GSAP 时间轴体系。
> 适用场景：当幻灯片同时需要展示 3D 模型 **和** 2D 数据标注/图表/公式时。

---

## 核心思想

在 Three.js 的 WebGL Canvas **上方**叠加一层透明的 SVG/DOM 层，通过 `camera.project()` 实现 3D 世界坐标到 2D 屏幕坐标的实时映射。这样可以：

1. 在旋转的 3D 产品模型旁，浮出精确的参数标注（如"重量: 453g"）
2. 在 3D 图表的柱体顶端，实时显示 SVG 数据标签
3. 将 KaTeX 公式定位到 3D 物体的表面锚点

---

## 架构模式

```javascript
// ========== 混合渲染层级结构 ==========
//
// ┌────────────────────────────────┐
// │  DOM Layer (z-index: 30)       │  ← KaTeX 公式、交互面板
// ├────────────────────────────────┤
// │  SVG Overlay (z-index: 20)    │  ← D3 图表、标注箭头、数据标签
// │  pointer-events: none         │
// ├────────────────────────────────┤
// │  Three.js Canvas (z-index: 10)│  ← 3D 模型、粒子、光效
// └────────────────────────────────┘

function createHybridRenderer(container) {
    // 1. Three.js 底层
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.zIndex = '10';
    container.appendChild(renderer.domElement);

    // 2. SVG 叠加层（透明、不拦截鼠标）
    const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgOverlay.setAttribute('width', '100%');
    svgOverlay.setAttribute('height', '100%');
    svgOverlay.style.cssText = `
        position: absolute; top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none; z-index: 20;
    `;
    container.appendChild(svgOverlay);

    // 3. DOM 叠加层（公式、面板）
    const domOverlay = document.createElement('div');
    domOverlay.style.cssText = `
        position: absolute; top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none; z-index: 30;
    `;
    container.appendChild(domOverlay);

    return { renderer, svgOverlay, domOverlay };
}
```

---

## 3D → 2D 坐标同步函数

```javascript
/**
 * 将 Three.js 世界坐标投影到屏幕像素坐标
 * @param {THREE.Vector3} worldPos - 3D 世界坐标
 * @param {THREE.Camera} camera - 当前相机
 * @param {HTMLElement} container - 渲染容器
 * @returns {{x: number, y: number, visible: boolean}}
 */
function projectToScreen(worldPos, camera, container) {
    const vector = worldPos.clone();
    vector.project(camera);

    // NDC [-1, 1] → 像素坐标
    const x = (vector.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-(vector.y * 0.5) + 0.5) * container.clientHeight;

    // 判断是否在相机前方（可见）
    const visible = vector.z < 1;

    return { x, y, visible };
}
```

---

## 实时标注示例：3D 模型 + 浮动数据标签

```javascript
// 在 GSAP ticker 中每帧调用
function updateAnnotations(camera, container, svgOverlay) {
    const annotations = [
        { anchor: new THREE.Vector3(0, 2, 0),  label: '重量: 453g' },
        { anchor: new THREE.Vector3(1.5, 0, 0), label: 'Micro-OLED 2300万像素' },
        { anchor: new THREE.Vector3(-1, 1, 0),  label: '空间音频阵列' }
    ];

    // 清除旧标注
    svgOverlay.innerHTML = '';

    annotations.forEach(ann => {
        const pos = projectToScreen(ann.anchor, camera, container);
        if (!pos.visible) return;

        // 绘制连接线 + 标签背景
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.innerHTML = `
            <line x1="${pos.x}" y1="${pos.y}" x2="${pos.x + 80}" y2="${pos.y - 40}"
                  stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="4,4"/>
            <rect x="${pos.x + 70}" y="${pos.y - 56}" width="160" height="28" rx="6"
                  fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.2)"/>
            <text x="${pos.x + 150}" y="${pos.y - 38}" text-anchor="middle"
                  fill="#fff" font-size="12" font-family="'Nunito', sans-serif">
                ${ann.label}
            </text>
        `;
        svgOverlay.appendChild(g);
    });
}

// 挂载到 GSAP ticker
gsap.ticker.add(() => {
    updateAnnotations(camera, container, svgOverlay);
    renderer.render(scene, camera);
});
```

---

## 与 Phantom Deck 集成要点

1. **幻灯片级别隔离**：每个 `.phantom-slide` 可独立拥有自己的混合渲染实例，翻页时销毁上一页的 SVG/DOM 叠加层。
2. **GSAP 时间轴驱动**：标注的出场/消失动画必须挂载到当前幻灯片的 `gsap.timeline()` 上，而非使用独立的 `requestAnimationFrame`。
3. **响应式同步**：`window.resize` 事件中必须同时更新 `renderer.setSize()`、SVG viewBox、以及所有标注的投影坐标。
