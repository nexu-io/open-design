# 幻象 MotionGraphic 美学升维指南 (Anti-AI-Slop Guidelines)

本指南旨在通过「四个核心关键词」消除 AI 生成界面的廉价感，将 Phantom Desk 模板提升至大师级商业质感与叙事深度。

## 1. 颗粒度 (Granularity) — 像素级的物理质感
AI 默认生成的界面往往过于「平滑」且色块单一。必须通过增加细节密度来模拟真实物理世界。

- **微观噪声 (Micro-Noise)**: 为背景层注入 2%-5% 的灰度杂色。
  ```css
  /* 推荐实现的噪声层 */
  .noise-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAy...');
    opacity: 0.05; pointer-events: none; z-index: 9999;
  }
  ```
- **发丝边框 (Hairline Borders)**: 避免粗笨的 1px 边框，优先使用 `0.5px` 或带有透明度渐变的复合边框。
- **软环境遮蔽 (Ambient Occlusion)**: 使用多层级、超大半径的阴影（50px-100px），模拟柔和的环境光遮盖，而非简单的投影。

## 2. 随机性 (Imperfection/Randomness) — 赋予算法人文气息
机器感来源于绝对的对称与规律。引入微小的偏移和不规则性，能让界面更有「呼吸感」。

- **非对称偏移 (Grid Shifting)**: 在网格布局中，让部分装饰性元素随机偏移 1-3px。
- **动画随机化 (Stagger Randomness)**: 使用 GSAP 的随机 stagger。
  ```javascript
  gsap.from(".items", {
    y: 20, opacity: 0,
    stagger: { each: 0.1, from: "random" }, // 杜绝机械化排序
    ease: "power2.out"
  });
  ```
- **人为不完美**: 为矢量元素（SVG）注入微小的路径抖动或粗细变化，模拟手绘或实体印刷感。

## 3. 语境化 (Contextualization) — 拒绝通用逻辑
「一眼 AI」的最大特征是逻辑缺失。界面内容必须为特定业务或科学场景量身定制。

- **真实数据映像**: 禁止使用 `Lorem Ipsum`。必须使用真实的行业术语、逻辑严密的统计数值、以及带有特定地理或文化背景的图像素材。
- **场景化组件**: 如果是讲述「量子计算」，界面中不应只有圆圈，而应出现布洛赫球（Bloch Sphere）的线框投影或概率波函数的演化图。
- **逻辑关联性**: 文案与背景动画必须强耦合。例如，当提到「数据激增」时，背景的粒子流速应同步加快。

## 4. 交互深度 (Interactive Depth) — 强化空间暗示
AI 生成的图片往往是「死的」平面。优秀的 UI 必须通过深度信息引导用户的注意力。

- **状态反馈 (Statefulness)**: 所有的可交互元素必须具备明确的 `Hover`、`Active`、`Loading` 和 `Empty` 状态。
- **视觉层级 (Z-index Engineering)**: 善用 `backdrop-filter: blur()`。底层元素应有更深的模糊感，表层元素应更清晰且边缘锐利。
- **动态扫描感**: 引入微小的「扫描线」或「光流」在界面层级间穿梭，强化界面的「实时性」和「动态深度」。

## 5. 全屏震撼 (Cinematic Scale) — 影视级图形计算
告别传统的 2D 背景和稀疏的 DOM 动画。为了达到真正的惊艳效果，必须调用底层的 GPU 算力。

- **原生 GLSL 着色器**: 在背景层运用 `ShaderMaterial` 编写顶点和片元着色器。通过数学公式（如 FBM、Perlin Noise、量子场波动方程）驱动空间形变。
- **百万级粒子系统 (Mega Particles)**: 粒子数量的底线是 10,000 个（推荐 50k - 100k）。利用 `BufferGeometry` 和 `Float32Array` 实现高性能的数据流，让微观粒子汇聚成宏观的视觉风暴。
- **物理场交互**: 粒子的运动不应是简单的匀速直线，必须受“鼠标引力”、“时间流形 (Time Uniform)” 或 “碰撞斥力”等物理法则支配。

---

## 工程化清单 (Checklist)

1. [ ] 背景是否有微噪纹理？
2. [ ] 边框是否使用了 `0.5px` 或半透明渐变？
3. [ ] 动画 Stagger 是否使用了 `from: "random"` 或随机延迟？
4. [ ] 文案是否具有具体的业务逻辑和真实数据？
5. [ ] 交互组件是否具备 `backdrop-filter` 层级感和 Hover 反馈？
6. [ ] **【核心】是否使用了 WebGL/GLSL 实现了上万级别的粒子或流体动画？**
