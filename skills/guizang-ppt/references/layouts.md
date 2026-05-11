# 页面布局库（Layouts）

所有页面统一**纯白背景 + 深灰文字**，不使用 dark/light 交替。封面页例外可使用 Unsplash 照片 + accent 色遮罩。

---

## 生成前必读

### A. 类名来自 template.html

不要发明新类名。如果必须自定义，用 `style="..."` inline 写。生成前 Read template.html 确认你要用的每个类都存在。

template.html 现在包含高级组件：`hero-banner`、`eyebrow`、`progress-bar`、`timeline`、`icon-grid`、`gradient-card`、`big-quote`、`meta-bar`、`numbered-steps`、`before-after`、`corner-decor`、`ring-stat`。

### B. 所有页面纯白背景

- 所有 `<section class="slide">` 默认白底黑字
- **禁止使用 `dark` / `light` / `hero dark` / `hero light` 等主题类**
- 封面页可以使用 `<section class="slide cover">` + `.hero-banner` 背景图
- 不需要主题节奏规划，所有页面统一白色

---

## Layout 1: 封面页

```html
<section class="slide cover">
  <div class="slide-section">2026 年度分享</div>
  <h1 class="slide-title">AI 赋能数字化转型</h1>
  <h2 class="slide-subtitle">从战略规划到落地执行</h2>
  <p class="slide-body" style="margin-top:2vh">
    演讲人：张三 · CTO
  </p>
  <div class="slide-footer">
    <span>内部培训</span>
    <span>1 / 20</span>
  </div>
</section>
```

---

## Layout 2: 章节页

```html
<section class="slide chapter">
  <div class="slide-section">第一章</div>
  <h1 class="slide-title">背景与现状</h1>
  <div class="slide-footer">
    <span>第二章开始</span>
    <span>6 / 20</span>
  </div>
</section>
```

---

## Layout 3: 数据大字报

```html
<section class="slide">
  <h1 class="slide-title">关键指标总览</h1>
  <p class="slide-subtitle text-muted">过去一年的核心数据</p>

  <div class="grid-3" style="margin-top:5vh">
    <div class="stat-card">
      <div class="stat-nb">320%</div>
      <div class="stat-label">营收增长率</div>
    </div>
    <div class="stat-card">
      <div class="stat-nb">50K+</div>
      <div class="stat-label">新增用户</div>
    </div>
    <div class="stat-card">
      <div class="stat-nb">99.9%</div>
      <div class="stat-label">服务可用性</div>
    </div>
  </div>

  <div class="slide-footer">
    <span>核心数据</span>
    <span>3 / 20</span>
  </div>
</section>
```

---

## Layout 4: 要点列表

```html
<section class="slide">
  <h1 class="slide-title">核心策略</h1>
  <div class="bullet-list" style="margin-top:4vh">
    <div class="item"><strong>数据驱动决策</strong> — 建立实时数据看板，关键指标透明化</div>
    <div class="item"><strong>敏捷迭代</strong> — 两周一迭代，快速验证假设</div>
    <div class="item"><strong>客户至上</strong> — 所有功能从客户场景出发</div>
    <div class="item"><strong>技术负债管理</strong> — 每个迭代预留 20% 时间做重构</div>
  </div>
  <div class="slide-footer">
    <span>核心策略</span>
    <span>4 / 20</span>
  </div>
</section>
```

---

## Layout 5: 左右分栏

```html
<section class="slide">
  <h1 class="slide-title">市场对比</h1>
  <div class="split-60" style="margin-top:4vh">
    <div>
      <h3 class="slide-section">我们的优势</h3>
      <div class="bullet-list">
        <div class="item">技术领先，AI 能力行业第一</div>
        <div class="item">团队经验丰富，核心成员来自一线大厂</div>
        <div class="item">客户覆盖广，已服务 500+ 企业</div>
      </div>
    </div>
    <div>
      <h3 class="slide-section">市场机会</h3>
      <div class="bullet-list">
        <div class="item">数字化转型市场年增长 25%</div>
        <div class="item">中小企业渗透率不足 10%</div>
        <div class="item">政策利好，多地出台补贴</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>市场分析</span>
    <span>7 / 20</span>
  </div>
</section>
```

---

## Layout 6: 引用/金句

```html
<section class="slide">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center">
    <div class="callout" style="max-width:70vw">
      <div class="q">"数字化转型不是技术问题，而是组织问题。"</div>
      <div class="cite">— 李四，行业分析师</div>
    </div>
  </div>
  <div class="slide-footer">
    <span>核心观点</span>
    <span>10 / 20</span>
  </div>
</section>
```

---

## Layout 7: 表格数据

```html
<section class="slide">
  <h1 class="slide-title">财务数据</h1>
  <table class="data-table" style="margin-top:4vh">
    <thead>
      <tr><th>指标</th><th>2024</th><th>2025</th><th>增长率</th></tr>
    </thead>
    <tbody>
      <tr><td>营收</td><td>5,000 万</td><td>1.6 亿</td><td class="text-accent">+220%</td></tr>
      <tr><td>利润</td><td>800 万</td><td>3,200 万</td><td class="text-accent">+300%</td></tr>
      <tr><td>客户数</td><td>120</td><td>500</td><td class="text-accent">+317%</td></tr>
      <tr><td>员工数</td><td>30</td><td>85</td><td>+183%</td></tr>
    </tbody>
  </table>
  <div class="slide-footer">
    <span>财务总览</span>
    <span>12 / 20</span>
  </div>
</section>
```

---

## Layout 8: 结束页/致谢

```html
<section class="slide cover">
  <h1 class="slide-title">感谢聆听</h1>
  <p class="slide-subtitle text-muted">Q & A</p>
  <div class="slide-body" style="margin-top:3vh">
    <p>联系方式：zhangsan@company.com</p>
  </div>
  <div class="slide-footer">
    <span>谢谢</span>
    <span>20 / 20</span>
  </div>
</section>
```

---

## 布局选择建议

| 页面类型 | 推荐 Layout |
|---------|------------|
| 封面（纯白底） | Layout 1 封面页 |
| 封面（照片底） | Layout 9 封面横幅 |
| 章节过渡 | Layout 2 章节页 |
| 展示数据 | Layout 3 数据大字报 / Layout 13 环形指标 |
| 列举要点 | Layout 4 要点列表 / Layout 11 编号步骤 |
| 对比分析 | Layout 5 左右分栏 / Layout 12 Before-After |
| 强调观点 | Layout 6 引用/金句 / Layout 10 大引用 |
| 表格数据 | Layout 7 表格 |
| 时间线/历程 | Layout 14 时间轴 |
| 功能/特性展示 | Layout 15 图标网格 |
| 核心指标突出 | Layout 16 渐变卡片 |
| 进度/完成度 | Layout 17 进度条 |
| 页眉信息条 | Layout 18 Meta Bar |
| 精致边框装饰 | Layout 19 角落装饰 |
| 结束页 | Layout 8 致谢 |

---

## Layout 9: 封面横幅（照片底 + 遮罩）

```html
<section class="slide" style="padding:0;overflow:hidden">
  <div class="hero-banner" style="background-image:url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&w=1920&q=80')">
    <div class="hero-content">
      <h1 class="slide-title">AI 赋能数字化转型</h1>
      <h2 class="slide-subtitle">从战略规划到落地执行</h2>
      <p class="slide-body">演讲人：张三 · CTO · 2026 年度分享</p>
    </div>
  </div>
</section>
```

---

## Layout 10: 大引用（整页金句）

```html
<section class="slide">
  <div class="big-quote">
    <div class="bq-text">数字化转型不是技术问题，而是组织问题</div>
    <div class="bq-author">— 李四，行业分析师 · 2025</div>
  </div>
  <div class="slide-footer">
    <span>核心观点</span><span>8 / 20</span>
  </div>
</section>
```

---

## Layout 11: 编号步骤

```html
<section class="slide">
  <div class="eyebrow">实施路径</div>
  <h1 class="slide-title">三步走战略</h1>
  <div class="numbered-steps" style="margin-top:4vh">
    <div class="ns-item">
      <div class="ns-num">01</div>
      <div><div class="ns-title">夯实基础（0-6 月）</div><div class="ns-desc">完成核心系统升级，建立数据治理体系，培训关键岗位人员</div></div>
    </div>
    <div class="ns-item">
      <div class="ns-num">02</div>
      <div><div class="ns-title">拓展应用（6-12 月）</div><div class="ns-desc">在 3 个业务线试点 AI 场景，建立 ROI 评估模型，形成可复制模板</div></div>
    </div>
    <div class="ns-item">
      <div class="ns-num">03</div>
      <div><div class="ns-title">全面推广（12-18 月）</div><div class="ns-desc">全业务线覆盖，建立数字化运营中台，实现数据驱动决策闭环</div></div>
    </div>
  </div>
  <div class="slide-footer"><span>战略规划</span><span>5 / 20</span></div>
</section>
```

---

## Layout 12: Before-After 对比

```html
<section class="slide">
  <div class="eyebrow">转型效果</div>
  <h1 class="slide-title">数字化升级前后对比</h1>
  <div class="before-after" style="margin-top:4vh">
    <div class="ba-col ba-before">
      <div class="ba-label">BEFORE</div>
      <div class="ba-item">手工报表，耗时 4 小时/周</div>
      <div class="ba-item">数据孤岛，部门间信息不互通</div>
      <div class="ba-item">经验决策，缺乏数据支撑</div>
      <div class="ba-item">客户响应慢，平均 48 小时</div>
    </div>
    <div class="ba-col ba-after">
      <div class="ba-label">AFTER</div>
      <div class="ba-item">自动看板，实时刷新</div>
      <div class="ba-item">统一数据平台，全链路透明</div>
      <div class="ba-item">AI 辅助决策，准确率提升 40%</div>
      <div class="ba-item">智能客服，5 分钟响应</div>
    </div>
  </div>
  <div class="slide-footer"><span>转型成效</span><span>9 / 20</span></div>
</section>
```

---

## Layout 13: 环形指标

```html
<section class="slide">
  <div class="eyebrow">年度达成</div>
  <h1 class="slide-title">核心 KPI 完成情况</h1>
  <div class="grid-3" style="margin-top:5vh">
    <div class="ring-stat">
      <svg class="ring-svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#e8e8e8" stroke-width="10"/>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="10"
          stroke-dasharray="283 314" stroke-dashoffset="-78.5" stroke-linecap="round"
          transform="rotate(-90 60 60)"/>
      </svg>
      <div class="ring-value">90%</div><div class="ring-label">营收达成率</div>
    </div>
    <div class="ring-stat">
      <svg class="ring-svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#e8e8e8" stroke-width="10"/>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="10"
          stroke-dasharray="251 314" stroke-dashoffset="-62.8" stroke-linecap="round"
          transform="rotate(-90 60 60)"/>
      </svg>
      <div class="ring-value">80%</div><div class="ring-label">客户满意度</div>
    </div>
    <div class="ring-stat">
      <svg class="ring-svg" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#e8e8e8" stroke-width="10"/>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="10"
          stroke-dasharray="299 314" stroke-dashoffset="-15.7" stroke-linecap="round"
          transform="rotate(-90 60 60)"/>
      </svg>
      <div class="ring-value">95%</div><div class="ring-label">项目交付率</div>
    </div>
  </div>
  <div class="slide-footer"><span>KPI 总览</span><span>6 / 20</span></div>
</section>
```

---

## Layout 14: 时间轴

```html
<section class="slide">
  <div class="eyebrow">发展历程</div>
  <h1 class="slide-title">关键里程碑</h1>
  <div class="timeline" style="margin-top:3vh">
    <div class="tl-item">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-date">2024 Q1</div>
        <div class="tl-title">产品 1.0 上线</div>
        <div class="tl-desc">完成核心功能开发，获取首批 100 家种子客户</div>
      </div>
    </div>
    <div class="tl-item">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-date">2024 Q3</div>
        <div class="tl-title">A 轮融资完成</div>
        <div class="tl-desc">获得 5000 万融资，团队扩张至 50 人</div>
      </div>
    </div>
    <div class="tl-item">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-date">2025 Q2</div>
        <div class="tl-title">客户突破 500 家</div>
        <div class="tl-desc">覆盖 10 个行业，营收同比增长 320%</div>
      </div>
    </div>
  </div>
  <div class="slide-footer"><span>发展历程</span><span>3 / 20</span></div>
</section>
```

---

## Layout 15: 图标网格

```html
<section class="slide">
  <div class="eyebrow">产品能力</div>
  <h1 class="slide-title">六大核心优势</h1>
  <div class="icon-grid cols-3" style="margin-top:4vh">
    <div class="ic-item"><div class="ic-icon">◆</div><div class="ic-title">数据智能</div><div class="ic-desc">AI 驱动的实时数据分析</div></div>
    <div class="ic-item"><div class="ic-icon">▲</div><div class="ic-title">安全保障</div><div class="ic-desc">企业级安全与合规认证</div></div>
    <div class="ic-item"><div class="ic-icon">●</div><div class="ic-title">弹性扩展</div><div class="ic-desc">从 10 到 10000 用户无缝扩容</div></div>
    <div class="ic-item"><div class="ic-icon">■</div><div class="ic-title">开放 API</div><div class="ic-desc">300+ 接口，轻松集成</div></div>
    <div class="ic-item"><div class="ic-icon">★</div><div class="ic-title">行业方案</div><div class="ic-desc">预置 10 个行业模板</div></div>
    <div class="ic-item"><div class="ic-icon">◎</div><div class="ic-title">7×24 服务</div><div class="ic-desc">专属客户成功团队</div></div>
  </div>
  <div class="slide-footer"><span>产品能力</span><span>7 / 20</span></div>
</section>
```

---

## Layout 16: 渐变卡片

```html
<section class="slide">
  <div class="eyebrow">业绩总览</div>
  <h1 class="slide-title">2025 年度成绩单</h1>
  <div class="grid-3" style="margin-top:4vh">
    <div class="gradient-card" style="background:linear-gradient(135deg, var(--accent) 0%, oklch(40% 0.1 250) 100%)">
      <div class="gc-stat">1.6 亿</div><div class="gc-label">年度营收</div>
    </div>
    <div class="gradient-card" style="background:linear-gradient(135deg, var(--accent) 0%, oklch(40% 0.1 250) 100%)">
      <div class="gc-stat">320%</div><div class="gc-label">同比增长</div>
    </div>
    <div class="gradient-card" style="background:linear-gradient(135deg, var(--accent) 0%, oklch(40% 0.1 250) 100%)">
      <div class="gc-stat">500+</div><div class="gc-label">服务企业数</div>
    </div>
  </div>
  <div class="slide-footer"><span>年度业绩</span><span>4 / 20</span></div>
</section>
```

---

## Layout 17: 进度条

```html
<section class="slide">
  <div class="eyebrow">项目进展</div>
  <h1 class="slide-title">数字化转型进度</h1>
  <div class="col" style="margin-top:5vh;max-width:80vw">
    <div class="progress-bar">
      <div class="bar-label"><span>基础设施升级</span><span class="pct">90%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:90%"></div></div>
    </div>
    <div class="progress-bar">
      <div class="bar-label"><span>数据平台迁移</span><span class="pct">75%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:75%"></div></div>
    </div>
    <div class="progress-bar">
      <div class="bar-label"><span>AI 场景落地</span><span class="pct">60%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:60%"></div></div>
    </div>
    <div class="progress-bar">
      <div class="bar-label"><span>全员培训</span><span class="pct">85%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:85%"></div></div>
    </div>
  </div>
  <div class="slide-footer"><span>项目进度</span><span>11 / 20</span></div>
</section>
```

---

## Layout 18: Meta Bar + 角落装饰

```html
<section class="slide corner-decor">
  <div class="meta-bar">
    <span>2026 Q1 战略汇报</span>
    <span>编制部门：战略规划部</span>
    <span>机密等级：内部</span>
  </div>
  <h1 class="slide-title">市场进入策略</h1>
  <p class="slide-subtitle text-muted">基于 SCQA 框架的战略分析</p>
  <div class="slide-body" style="margin-top:3vh">
    <p>当前市场数字化渗透率已超过 <strong class="text-accent">62%</strong>，我们的目标是在 18 个月内将市场份额从 <strong>5%</strong> 提升至 <strong class="text-accent">15%</strong>。</p>
  </div>
  <div class="slide-footer"><span>战略规划</span><span>2 / 20</span></div>
</section>
```

所有布局使用纯白背景（封面横幅除外），不需要主题交替规划。
