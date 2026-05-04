# GSAP Flip 插件与类 Keynote 神奇移动转场 (Magic Move)

**🚨 核心机制与版权声明：**
为了在 Hyperframes 中实现跨页/跨状态的无缝流转（如同苹果 Keynote 的神奇移动），大模型在生成代码时，**严禁使用任何未受时间轴托管的 View Transitions API**。
必须且只能使用免费开源的 GSAP `Flip` 插件。它通过记录元素的 `First` 和 `Last` 状态，计算出 `Invert` 并由 GSAP `Play` 自动补间所有属性（包括位置、大小、透明度）。

---

## 模块一：Flip 的基本依赖与配置

由于我们要保证离线渲染环境绝对无外网依赖（非 CDN 加载），你需要假设 `gsap/Flip` 已在本地被引入。

```javascript
// 假设 gsap 和 Flip 已引入：
// import { gsap } from "gsap";
// import { Flip } from "gsap/Flip";
// gsap.registerPlugin(Flip);

// HTML 中为需要参与神奇移动的元素设置基础 class
// <div class="magic-item info-card">这是一张卡片</div>
```

---

## 模块二：基于状态机 (State B) 的神奇移动生成器

**适用场景**：旁白中出现了逻辑转折、概念递进或需要腾出屏幕空间。比如，原本在左侧大篇幅显示的公式/老照片，平滑缩小移动到右下角作为注释，左侧飞入新的主视觉内容。

```javascript
// AI 预设：神奇移动转场调度 (挂载至 masterTl)
function applyMagicMoveTransition(masterTl, selectors, targetClass, startTime, duration = 1.5) {
    const elements = document.querySelectorAll(selectors);
    if (!elements || elements.length === 0) return;

    // 1. FIRST: 记录它们当前的初始状态 (位置、大小、透明度)
    // 注意：Flip 必须在执行改变前捕获状态
    const state = Flip.getState(elements);
    
    // 2. 瞬间改变它们的 CSS class (触发浏览器重新排版布局)
    // 大模型只需要在 CSS 中提前定义好 targetClass (如 '.right-bottom-note') 的最终样式
    elements.forEach(el => el.classList.toggle(targetClass));
    
    // 3. LAST & INVERT: 浏览器重排后，Flip 自动计算前后差异
    
    // 4. PLAY: 生成专门负责转场的时间轴，并挂载到主导轨上
    const flipTimeline = Flip.from(state, {
        duration: duration,
        ease: "power3.inOut",
        absolute: true, // 核心机制：让元素脱离文档流，自由飞行穿梭
        scale: true,    // 完美处理宽高的平滑缩放，而不是硬切
        zIndex: 50      // 确保在飞行过程中处于顶层
    });
    
    // 5. 完美并入 Hyperframes 主时间轴的指定时间点
    masterTl.add(flipTimeline, startTime);
}

// ================= 使用示例 =================
// 假设 CSS 如下:
// .info-card { position: absolute; left: 10%; top: 20%; width: 400px; height: 300px; font-size: 24px; }
// .note-mode { left: 80%; top: 80%; width: 200px; height: 150px; font-size: 14px; opacity: 0.6; }

// 旁白：在第 10 秒，理论走向现实，卡片缩小为注释
// applyMagicMoveTransition(masterTl, '.info-card', 'note-mode', 10.0, 2.0);
```

---

## 模块三：避免 View Transitions 的毁灭性打击

**⚠️ 致命警告**：
大模型绝对不能在生成代码中包含 `document.startViewTransition()`！
View Transitions 的动画受浏览器 GPU 底层时钟控制，不受 JS 的 `requestAnimationFrame` 管辖。这会导致 Hyperframes 暂停虚拟时钟截帧时，动画丢失或跳帧。
**任何需要跨状态的平滑位移，必须走模块二的 GSAP Flip 流程！**