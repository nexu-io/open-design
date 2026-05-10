# 玻璃拟态交互控制面板 + Raycaster 点击引擎

> 融合自 AetherViz Master 的交互式控制面板理念，为 Phantom Deck 赋予"可操控"能力。
> 适用场景：技术路演中需要实时调参演示（如调节物理参数、切换数据维度）。

---

## 核心思想

将 Phantom Deck 从"被动播放器"升级为"主动操控台"：
- 观众/演讲者可以通过**滑块**实时修改 3D 场景中的物理参数
- 可以**点击 3D 模型**弹出详情面板
- 所有交互操作均可与 GSAP 时间轴和谐共存

---

## 玻璃拟态控制面板 CSS

```css
.phantom-control-panel {
    position: absolute;
    bottom: 80px;
    right: 24px;
    width: 320px;
    padding: 20px 24px;
    z-index: 50;

    /* 玻璃拟态核心 */
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

    /* 字体 */
    font-family: 'Inter', 'Nunito', sans-serif;
    color: #F8FAFC;
}

.phantom-control-panel h3 {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 16px;
}

.phantom-slider-group {
    margin-bottom: 14px;
}

.phantom-slider-group label {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 6px;
    color: #CBD5E1;
}

.phantom-slider-group label .value {
    color: #22D3EE;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.phantom-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    cursor: pointer;
}

.phantom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%);
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
    cursor: grab;
    transition: box-shadow 0.2s;
}

.phantom-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
    box-shadow: 0 0 20px rgba(34, 211, 238, 0.8);
}
```

---

## HTML 面板模板

```html
<div class="phantom-control-panel" id="control-panel">
    <h3>⚙️ 参数控制</h3>

    <div class="phantom-slider-group">
        <label>
            <span>旋转速度</span>
            <span class="value" id="val-rotation">1.0x</span>
        </label>
        <input type="range" class="phantom-slider" id="slider-rotation"
               min="0" max="5" step="0.1" value="1">
    </div>

    <div class="phantom-slider-group">
        <label>
            <span>光照强度</span>
            <span class="value" id="val-light">2.5</span>
        </label>
        <input type="range" class="phantom-slider" id="slider-light"
               min="0" max="5" step="0.1" value="2.5">
    </div>

    <div class="phantom-slider-group">
        <label>
            <span>模型缩放</span>
            <span class="value" id="val-scale">100%</span>
        </label>
        <input type="range" class="phantom-slider" id="slider-scale"
               min="50" max="200" step="5" value="100">
    </div>
</div>
```

---

## 滑块绑定逻辑 (GSAP 友好)

```javascript
function bindSliderControls(model, directionalLight) {
    const sliderRotation = document.getElementById('slider-rotation');
    const sliderLight    = document.getElementById('slider-light');
    const sliderScale    = document.getElementById('slider-scale');

    sliderRotation.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-rotation').textContent = val.toFixed(1) + 'x';
        // 直接修改 GSAP tween 的 timeScale
        if (window.rotationTween) window.rotationTween.timeScale(val);
    });

    sliderLight.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-light').textContent = val.toFixed(1);
        gsap.to(directionalLight, { intensity: val, duration: 0.3 });
    });

    sliderScale.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) / 100;
        document.getElementById('val-scale').textContent = Math.round(val * 100) + '%';
        gsap.to(model.scale, { x: val, y: val, z: val, duration: 0.3, ease: "power2.out" });
    });
}
```

---

## Raycaster 点击高亮引擎

```javascript
function enableRaycasterInteraction(camera, scene, container, domOverlay) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener('click', (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const hit = intersects[0];

            // 高亮边缘发光
            gsap.to(hit.object.material, {
                emissiveIntensity: 0.5,
                duration: 0.3,
                yoyo: true,
                repeat: 1
            });

            // 弹出信息气泡（DOM 层）
            showInfoBubble(domOverlay, event.clientX, event.clientY, {
                name: hit.object.name || '组件',
                distance: hit.distance.toFixed(2)
            });
        }
    });
}

function showInfoBubble(domOverlay, x, y, data) {
    // 移除旧气泡
    const old = domOverlay.querySelector('.info-bubble');
    if (old) old.remove();

    const bubble = document.createElement('div');
    bubble.className = 'info-bubble';
    bubble.style.cssText = `
        position: absolute; left: ${x + 15}px; top: ${y - 20}px;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;
        padding: 10px 16px; color: #fff; font-size: 13px;
        pointer-events: auto; z-index: 40;
        font-family: 'Inter', sans-serif;
    `;
    bubble.innerHTML = `<strong>${data.name}</strong><br><span style="color:#22D3EE;">距离: ${data.distance}</span>`;
    domOverlay.appendChild(bubble);

    // GSAP 入场
    gsap.from(bubble, { scale: 0.8, opacity: 0, duration: 0.3, ease: "back.out(2)" });

    // 3 秒后自动消失
    gsap.to(bubble, { opacity: 0, scale: 0.9, duration: 0.3, delay: 3, onComplete: () => bubble.remove() });
}
```

---

## 与 Phantom Deck 集成要点

1. **可选启用**：交互面板仅在用户选择"交互模式"时注入，不影响传统的纯播放幻灯片。
2. **翻页联动**：翻到包含 3D 模型的幻灯片时，控制面板自动弹出（GSAP `from` 动画）；翻离时自动收起。
3. **触控兼容**：滑块天然支持移动端触控，Raycaster 需额外绑定 `touchstart` 事件。
4. **面板折叠**：提供右上角关闭按钮，折叠后变为悬浮小图标，点击可重新展开。
