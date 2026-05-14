# 杂志布局库 (Editorial Layouts for Phantom Deck)

本库收录了汲取自《Monocle》杂志美学的 10 种顶级 HTML Slide 布局骨架。生成代码时，**必须**优先采用这些网格系统。

## 0. 核心排版类名 (Core Utility Classes)
- `.h-hero`: 巨幕标题 (10vw, 衬线, 权重 900)
- `.h-xl`: 章节标题 (7.5vw, 衬线)
- `.kicker`: 钩子短句 (0.75rem, 等宽, 间距 5px, 位于大标题上方)
- `.lead`: 引导正文 (1.25rem, 非衬线, 权重 200, 2.2 倍行高)
- `.meta-row`: 元数据行 (0.6rem, 灰色, 用于展示作者、时间、地理坐标)
- `.grid-2-7-5`: 7:5 非对称两列网格
- `.stat-card`: 数据卡片 (大数字 + 小标签 + 注释)

---

## Layout 1: 杂志封面 (Editorial Cover)
**适用场景**: 开场、震撼级愿景展示。
```html
<section class="slide hero dark">
  <div class="frame" style="display:grid; gap:4vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim="line">VOL.01 // THE FUTURE</div>
    <h1 class="h-hero" data-anim="cascade">星际史诗</h1>
    <h2 class="h-sub" style="font-size: 2.5rem; opacity: 0.6" data-anim="cascade">被 AI 折叠的宇宙</h2>
    <p class="lead" style="max-width:60vw" data-anim="cascade">
      一场关于物理法则、数字艺术与人类探索边界的深度巡演。
    </p>
    <div class="meta-row" data-anim="left">
      <span>CREATIVE BY 紫苏子ACG</span><span>·</span><span>TOKYO / 2026.05</span>
    </div>
  </div>
</section>
```

## Layout 3: 数据大字报 (Big Numbers Grid)
**适用场景**: 核心性能指标、市场规模、物理常数。
```html
<section class="slide light">
  <div class="frame" style="padding-top:8vh">
    <div class="kicker" data-anim="line">CORE METRICS</div>
    <h2 class="h-xl" data-anim="cascade">关键指标</h2>
    <div class="grid-6" style="margin-top:8vh; display:grid; grid-template-columns:repeat(3,1fr); gap:6vh">
      <div class="stat-card" data-anim="step">
        <div class="stat-label">Particles</div>
        <div class="stat-nb" style="font-size:4rem; font-weight:900">1.2M</div>
        <div class="stat-note">GPGPU 并行计算</div>
      </div>
      <!-- 更多卡片... -->
    </div>
  </div>
</section>
```

## Layout 4: 左文右图 (Editorial Duo)
**适用场景**: 案例分析、产品实拍与解说。
```html
<section class="slide dark">
  <div class="frame grid-2-7-5" style="padding-top:10vh; display:grid; grid-template-columns: 7fr 5fr; gap:5vw">
    <div style="display:flex; flex-direction:column; justify-content:center">
      <div class="kicker" data-anim="line">CASE STUDY</div>
      <h2 class="h-xl" data-anim="cascade">逻辑比特</h2>
      <p class="desc-text" data-anim="cascade">
        我们不再讨论不稳定的物理实体，而是聚焦于受纠错算法保护的逻辑节点。
      </p>
    </div>
    <div class="frame-img" style="background: var(--glass); border: var(--border); aspect-ratio: 4/3">
      <!-- 此处插入 3D 星球或产品图 -->
    </div>
  </div>
</section>
```

---

## 质量自检
- [ ] 标题是否使用了衬线体？
- [ ] 是否存在 kicker (钩子短句)？
- [ ] 左右页是否保持了 `light` 和 `dark` 的呼吸节奏？
- [ ] 网格是否为非对称（7:5 或 3:3）？
