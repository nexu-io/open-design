# 顶级交互组件与微动效规范 (Pro-Interactions)

为了打造对标 Apple Keynote、Neuform.ai 和顶级商业演示的沉浸式体验，Phantom Motion v9.1+ 强制采用以下三种高阶交互模式。生成代码时，**必须**遵循这些模式来实现 UI/UX 逻辑。

## 1. Magic Move 神奇移动 (基于 GSAP Flip)

**核心理念**：空间持久性。相同逻辑实体在切换幻灯片时，不应淡入淡出，而应在 2D 空间内平滑形变和位移。

**实现方式**：
在相邻两个 `.phantom-slide` 中的 DOM 元素上分配相同的 `data-flip-id`。
`deck-runtime.js` 引擎在翻页时会自动捕获这些 ID 并使用 `Flip.from()` 执行丝滑过渡。

**HTML 代码示例**：
```html
<!-- 第一页：主标题居中巨幕 -->
<div class="phantom-slide active">
    <h1 data-flip-id="product-title" style="font-size: 6rem; text-align: center;">PHANTOM X</h1>
</div>

<!-- 第二页：主标题缩小至左上角，作为上下文导航 -->
<div class="phantom-slide">
    <h2 data-flip-id="product-title" style="font-size: 1.5rem; position: absolute; top: 2rem; left: 2rem;">PHANTOM X // <span style="opacity: 0.5">SPECS</span></h2>
</div>
```

## 2. 3D 对象物理弹态拾取 (Three.js Raycaster)

**核心理念**：颗粒度交互反馈。鼠标滑过或点击 3D 图表（如柱状图、散点）时，必须提供符合物理直觉的回弹反馈，严禁线性生硬的缩放。

**实现方式**：
在 `animate()` 循环之外注册 `Raycaster` 和 `mousemove/click` 事件。结合 GSAP 的 `elastic.out` 缓动函数实现微动效。

**JS 代码片段 (模板注入)**：
```javascript
// 假设 bars 是存储所有 3D Bar 对象的数组
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (event) => {
    // 将鼠标位置归一化为设备坐标 [-1, +1]
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);

    bars.forEach(barObj => {
        const mesh = barObj.mesh;
        if (intersects.length > 0 && intersects[0].object === mesh) {
            if (!mesh.userData.isHovered) {
                mesh.userData.isHovered = true;
                // Hover：高亮并发光
                gsap.to(mesh.material, { emissiveIntensity: 1.0, duration: 0.3 });
                // 物理挤压放大
                gsap.to(mesh.scale, { x: 1.2, z: 1.2, duration: 0.5, ease: "elastic.out(1, 0.4)" });
                document.body.style.cursor = 'pointer';
            }
        } else {
            if (mesh.userData.isHovered) {
                mesh.userData.isHovered = false;
                // 恢复默认状态
                gsap.to(mesh.material, { emissiveIntensity: 0.5, duration: 0.3 });
                gsap.to(mesh.scale, { x: 1, z: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" });
                document.body.style.cursor = 'default';
            }
        }
    });
});
```

## 3. 鸟瞰地图模式 (Bird's Eye Overview)

**核心理念**：多维非线性导航。允许用户跳出单线时间轴，全局审视故事架构。
此功能已在 `deck-runtime.js` 内核中默认提供。

**触发条件**：
用户在键盘按下 `Esc` 键。此时所有幻灯片会在网格阵列中缩小至 25% 并列出，支持鼠标直接点击跳转。

**设计要求**：
在设计背景和光影时，确保它们在 `transform: scale(0.25)` 的情况下仍然具备辨识度。请勿使用会导致缩放后文字溢出容器的绝对定位方式。优先使用 Flex/Grid 或百分比。
