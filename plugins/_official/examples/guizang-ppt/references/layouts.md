# 页面布局库（Layouts）

本文档收录 10 种最常用的页面布局骨架。每种都是一个完整可粘贴的 `<section class="slide ...">...</section>` 代码块，直接替换文案/图片即可使用。

---

## ⚠️ 生成前必读（Pre-flight）

### A. 类名必须来自 template.html

layouts.md 使用的所有类（`h-hero` / `h-xl` / `h-sub` / `h-md` / `lead` / `meta-row` / `stat-card` / `stat-label` / `stat-nb` / `stat-unit` / `stat-note` / `pipeline-section` / `pipeline-label` / `pipeline` / `step` / `step-nb` / `step-title` / `step-desc` / `grid-2-7-5` / `grid-2-6-6` / `grid-2-8-4` / `grid-3-3` / `grid-6` / `grid-3` / `grid-4` / `frame` / `frame-img` / `img-cap` / `callout` / `callout-src` / `kicker`）都在 `assets/template.html` 的 `<style>` 块里预定义。

**不要发明新类名**。如果必须自定义，用 `style="..."` inline 写。生成前若不确定某个类是否存在，grep template.html 确认。

### B. 图片比例规范（非常重要）

**永远用标准比例**，不要用原图 `aspect-ratio: 2592/1798` 这种奇葩比例：

| 场景 | 推荐比例 | 写法 |
|------|---------|------|
| 左文右图 主图 | 16:10 或 4:3 | `aspect-ratio:16/10; max-height:54vh` |
| 图片网格（多图对比） | 统一 | **固定 `height:26vh`，不用 aspect-ratio** |
| 左小图 + 右文字 | 1:1 或 3:2 | `aspect-ratio:1/1; max-width:40vw` |
| 全屏主视觉 | 16:9 | `aspect-ratio:16/9; max-height:64vh` |
| 图文混排小插图 | 3:2 | `aspect-ratio:3/2; max-width:30vw` |

图片必须包在 `<figure class="frame-img">` 里，里面的 `<img>` 会自动 `object-fit:cover + object-position:top center`，只裁底部，不裁顶/左/右。

### C. 图片定位准则（避免图片堆到页面最底部、被浏览器工具栏遮挡）

**错误做法**（已踩坑，不要再犯）：
- 在非 grid 容器里用 `align-self:end`：`align-self` 在 flex/grid 之外完全无效，图片会掉到文档流末尾堆底
- 用 `position:absolute + bottom:0` 把图"固定"到底：会被底部 `.foot` 和 `#nav` 圆点遮挡
- 单张图片只写 `height:N vh` 不限 `max-height`：在低分屏会撑出视口

**正确做法**：
- 图文混排**必须用 `.frame.grid-2-7-5`**（或 `.grid-2-6-6` / `.grid-2-8-4`）的 grid 结构
- grid 容器默认 `align-items:start`（已在 template 中设置），图片自然贴到 cell 顶端
- 如果需要"图片底对齐左列 callout"：**左列用 flex column + `justify-content:space-between`**（让 callout 自己贴左列底），**右列 figure 直接保持 align-items:start 即可**，不要加 `align-self:end`
- 所有 grid 父容器建议加 inline `style="padding-top:6vh"`，给标题区留呼吸空间

### D. 主题色与主题节奏

- 主题色从 `references/themes.md` 的 5 套预设里选一套,不允许自定义 hex 值
- 主题节奏(每页用 light / dark / hero light / hero dark 哪一个)在下文"主题节奏规划"一节有硬规则,生成前必读
- 两件事都要在挑布局之前决定,避免返工

---

## 0. 基础结构（所有 slide 都一样）

```html
<section class="slide [light|dark|hero light|hero dark]">
  <div class="chrome">
    <div>上下文标签 · 子标签</div>
    <div>ACT · 页号 / 总页数</div>
  </div>
  <!-- 主内容 -->
  <div class="foot">
    <div>页码说明 · Page Description</div>
    <div>— · —</div>
  </div>
</section>
```

- 非 hero 页建议加 `light` 或 `dark` 主题；hero 页加 `hero light` 或 `hero dark`（参与 WebGL 主题插值）
- `chrome` 和 `foot` 是可选但推荐保留的上下左右四角元数据
- **hero 页用于章节封面/开场/收束/转场**，非 hero 页用于正文

### ⚠️ chrome 和 kicker 不要写同一句话

这是最常见的内容重复问题。两者在语义上完全不同的维度：

| 位置 | 角色 | 内容性质 | 例子 |
|------|------|---------|------|
| `.chrome` 左上 | **杂志页眉 / 导航元数据** | 稳定的"栏目名"或"章节分类"，跨多页可以相同 | "Act II · Workflow" / "Data · Result" / "lukew.com · 2026.04" |
| `.chrome` 右上 | **页号 + 幕号** | 固定格式 | "Act II · 15 / 25" |
| `.kicker` | **这一页独一份的引导句** | 是大标题的"小前缀"，像杂志大标题上方的一行话，每页都应不同 | "BUT" / "一个人,做了什么。" / "Phase 01 · 设计阶段" |

**反例**（已踩坑）：chrome 写"设计先行 · Design First"，kicker 又写"Phase 01 · 设计阶段"——意思重复，读者一眼就觉得 AI 生成的。

**正确做法**：chrome 是**栏目标签**（稳定、跨页可复用），kicker 是**本页钩子**（短句、有戏剧性），两者互为补充，不互相翻译。

### ⚠️ 主题节奏规划（必读 · 生成前必做)

**核心机制**:每页 `<section>` 必须带 `light` / `dark` / `hero light` / `hero dark` 之一。JS 根据 class 推断主题,决定 body 加不加 `light-bg`,从而切换暗/亮两张 WebGL canvas 哪张在前。不带主题或写自定义名 = fallback 出错。

#### 按布局的主题默认值

| Layout | 默认主题 | 原因 |
|---|---|---|
| 1. 开场封面 | `hero dark` | 开场仪式感,暗底强冲击 |
| 2. 章节幕封 | `hero dark` 与 `hero light` **必须交替** | 呼吸节奏 |
| 3. 大字报(数据) | `light` | 数字需纸白底;多幕连发时可偶插 `dark` |
| 4. 左文右图 | **`light` / `dark` 交替** | 正文节奏主力 |
| 5. 图片网格 | `light` | 截图需亮底 |
| 6. Pipeline | `light` | 流程图需清晰 |
| 7. 问题页 | `hero dark` | 强视觉冲击默认 |
| 8. 大引用 | **`dark` 优先**,偶用 `light` | 金句仪式感靠暗底 |
| 9. 对比页 | `light` | 双列需清晰 |
| 10. 图文混排 | **`light` / `dark` 交替** | 节奏 |

#### 节奏硬规则(生成后 grep 自检)

- ❌ **禁止**连续 3 页以上相同主题(包括 light 堆叠和 dark 堆叠)
- ❌ **禁止**8 页以上的 deck 没有至少 1 个 `hero dark` + 1 个 `hero light`
- ❌ **禁止**整个 deck 只有 `light` 正文页没有任何 `dark` 正文页——会显得平淡、没呼吸
- ✅ **推荐**每 3-4 页插入 1 个 hero(封面/幕封/问题/大引用)

#### 8 页节奏模板(可直接套用)

| 页 | 主题 | 布局 | 备注 |
|---|---|---|---|
| 1 | `hero dark` | 封面 | 开场 |
| 2 | `light` | 大字报 | 数据抛出 |
| 3 | `dark` | 左文右图 | 对比/故事 |
| 4 | `light` | Pipeline | 流程 |
| 5 | `hero light` | 章节幕封 | 呼吸 |
| 6 | `dark` | 左文右图 or 大引用 | |
| 7 | `hero dark` | 问题页 | 悬念收束 |
| 8 | `light` | 大引用/结尾 | 收尾 |

**先画这张表对齐,再动手写 slide**。跳过规划直接粘骨架 = 全是 light。

---

## Layout 1: 开场封面（Hero Cover）

```html
<section class="slide hero dark">
  <div class="chrome">
    <div>A Talk · 2026.04.22</div>
    <div>Vol.01</div>
  </div>
  <div class="frame" style="display:grid; gap:4vh; align-content:center; min-height:80vh">
    <div class="kicker">私享会 · 李继刚</div>
    <h1 class="h-hero">一人公司</h1>
    <h2 class="h-sub">被 AI 折叠的组织</h2>
    <p class="lead" style="max-width:60vw">
      一个 AI 创作者 —— 在 64 天里做了 11 万行代码、在 9 个平台上持续输出，生活节奏几乎没有被改变。
    </p>
    <div class="meta-row">
      <span>歸藏 Guizang</span><span>·</span><span>独立创作者 / CodePilot 作者</span>
    </div>
  </div>
  <div class="foot">
    <div>一场关于 AI · 组织 · 个体的分享</div>
    <div>— 2026 —</div>
  </div>
</section>
```

**要点**：
- 用 `hero dark` 让 WebGL 背景在大部分区域透出
- `h-hero` 是最大字号（10vw），这里作标题主视觉
- 用 `min-height:80vh + align-content:center` 让内容整体垂直居中
- 不需要 `.chrome` 里写页码，封面页自成一体

---

## Layout 2: 章节幕封（Act Divider）

```html
<section class="slide hero light">
  <div class="chrome">
    <div>第一幕 · 硬数据</div>
    <div>Act I · 01 / 25</div>
  </div>
  <div class="frame" style="display:grid; gap:6vh; align-content:center; min-height:80vh">
    <div class="kicker">Act I</div>
    <h1 class="h-hero" style="font-size:8.5vw">硬数据</h1>
    <p class="lead" style="max-width:55vw">
      先看数字，再谈方法。
    </p>
  </div>
  <div class="foot">
    <div>第一幕引子</div>
    <div>— · —</div>
  </div>
</section>
```

**要点**：
- 极简，只需要 kicker + 大标题 + 一行引语
- 两个幕的封面可以交替 `hero light` / `hero dark`，制造节奏
- `h-hero` 字号可以从 10vw 调到 8.5vw 适配长短

---

## Layout 3: 数据大字报（Big Numbers Grid）

```html
<section class="slide light">
  <div class="chrome">
    <div>过去 64 天 · 开发篇</div>
    <div>Act I / Dev · 02 / 25</div>
  </div>
  <div class="frame" style="padding-top:6vh">
    <div class="kicker">一个人，做了什么。</div>
    <h2 class="h-xl">过去 64 天</h2>
    <p class="lead" style="margin-bottom:5vh">从 0 到开源 CodePilot。</p>

    <div class="grid-6" style="margin-top:6vh">
      <div class="stat-card">
        <div class="stat-label">Duration</div>
        <div class="stat-nb">64 <span class="stat-unit">天</span></div>
        <div class="stat-note">从 0 到现在</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Lines of Code</div>
        <div class="stat-nb">110K+</div>
        <div class="stat-note">一行行写到 11 万+</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">GitHub Stars</div>
        <div class="stat-nb">5,166</div>
        <div class="stat-note">一个开源仓库</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Downloads</div>
        <div class="stat-nb">41K+</div>
        <div class="stat-note">装到了几万台电脑里</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AI Providers</div>
        <div class="stat-nb">19</div>
        <div class="stat-note">跨平台接入</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Commits</div>
        <div class="stat-nb">608+</div>
        <div class="stat-note">没有协作者</div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div>项目 · CodePilot　|　github.com/codepilot</div>
    <div>Act I · Dev Numbers</div>
  </div>
</section>
```

**要点**：
- 3×2 或 4×2 网格最稳（见 `.grid-6`）
- 每个 `stat-card` 结构固定：label（英文小字）→ nb（大字数字）→ note（注释）
- 数字建议 2-3 位字符（太长会溢出），用 K / M 简写
- 留 5vh 以上的上方缓冲，让标题区先抢眼球

---

## Layout 4: 左文右图（Quote + Image）

```html
<section class="slide light">
  <div class="chrome">
    <div>身份反差 · The Twist</div>
    <div>03 / 25</div>
  </div>
  <div class="frame grid-2-7-5" style="padding-top:6vh">
    <!-- 左列：标题 + 正文 + callout，flex column 让 callout 贴列底 -->
    <div style="display:flex; flex-direction:column; justify-content:space-between; gap:3vh">
      <div>
        <div class="kicker">BUT</div>
        <h2 class="h-xl" style="white-space:nowrap; font-size:7.2vw">
          我不是程序员。
        </h2>
        <p class="lead" style="margin-top:3vh">
          大学毕业之后再也没写过一行代码。过去十年做的是 UI 设计和 AI 特效。
        </p>
      </div>
      <div class="callout">
        "这东西在三年前，<br>
        需要一个十人团队做一年。"
        <div class="callout-src">— 一个观察者的判断</div>
      </div>
    </div>
    <!-- 右列：图片用标准 16/10 比例 + max-height，不要 align-self:end -->
    <figure class="frame-img" style="aspect-ratio:16/10; max-height:56vh">
      <img src="images/codepilot.png" alt="CodePilot 产品截图">
      <figcaption class="img-cap">CodePilot · 产品截图</figcaption>
    </figure>
  </div>
  <div class="foot">
    <div>Page 03 · 我不是程序员</div>
    <div>— · —</div>
  </div>
</section>
```

**要点**：
- 用 `grid-2-7-5`（左 7 份、右 5 份），`align-items:start` 已在 template 预设
- **左列**用 flex column + `justify-content:space-between`：标题贴顶，callout 自然贴底
- **右列图片** **不要加 `align-self:end`**。会让图片滑到 cell 底部，低分屏下被浏览器工具栏遮挡
- 图片必须用 **标准比例 16/10 或 4/3 + `max-height:56vh`**，不要用原图奇葩比例（`2592/1798` 这种）

---

## Layout 5: 图片网格（多图对比）

```html
<section class="slide light">
  <div class="chrome">
    <div>平台粉丝实证</div>
    <div>Act I / Ops · 05 / 27</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">Proof · 粉丝实证</div>
    <h2 class="h-xl">10 个平台 · 6 张截图</h2>

    <div class="grid-3-3" style="margin-top:4vh">
      <figure class="frame-img" style="height:26vh">
        <img src="images/weibo.png" alt="微博 289K">
        <figcaption class="img-cap">微博 · 289K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/twitter.png" alt="推特 137K">
        <figcaption class="img-cap">推特 · 137K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/wechat.png" alt="公众号 96K">
        <figcaption class="img-cap">公众号 · 96K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/jike.png" alt="即刻 26K">
        <figcaption class="img-cap">即刻 · 26K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/xhs.png" alt="小红书 19K">
        <figcaption class="img-cap">小红书 · 19K</figcaption>
      </figure>
      <figure class="frame-img" style="height:26vh">
        <img src="images/douyin.png" alt="抖音 10K">
        <figcaption class="img-cap">抖音 · 10K</figcaption>
      </figure>
    </div>
  </div>
  <div class="foot">
    <div>截图时间 · 2026.04</div>
    <div>Page 05 · 粉丝实证</div>
  </div>
</section>
```

**要点**：
- 关键：每个 `frame-img` 必须写死 `height:NNvh`（不要用 `aspect-ratio`），否则网格会撑破
- 图片会自动 `object-fit:cover + object-position:top`，只裁底部
- 用 `.grid-3-3`（3×2）或 `.grid-3`（3×1）承载

---

## Layout 6: 两列流水线（Pipeline）

```html
<section class="slide light">
  <div class="chrome">
    <div>我的工作流 · Workflow</div>
    <div>Act II · 15 / 27</div>
  </div>
  <div class="frame">
    <div class="kicker">Pipeline · 流水线</div>
    <h2 class="h-xl">两条流水线</h2>

    <!-- 第一组：文本侧 -->
    <div class="pipeline-section">
      <div class="pipeline-label">文本侧 · Text Pipeline</div>
      <div class="pipeline">
        <div class="step">
          <div class="step-nb">01</div>
          <div class="step-title">Draft</div>
          <div class="step-desc">AI 帮我起草初稿</div>
        </div>
        <div class="step">
          <div class="step-nb">02</div>
          <div class="step-title">Polish</div>
          <div class="step-desc">AI 润色去 AI 味</div>
        </div>
        <div class="step">
          <div class="step-nb">03</div>
          <div class="step-title">Morph</div>
          <div class="step-desc">AI 变形成推特 / 小红书</div>
        </div>
        <div class="step">
          <div class="step-nb">04</div>
          <div class="step-title">Illustrate</div>
          <div class="step-desc">AI 生成信息图</div>
        </div>
        <div class="step">
          <div class="step-nb">05</div>
          <div class="step-title">Distribute</div>
          <div class="step-desc">一键分发 9 平台</div>
        </div>
      </div>
    </div>

    <!-- 第二组：视频侧 -->
    <div class="pipeline-section">
      <div class="pipeline-label">视觉 · 视频侧 · Video Pipeline</div>
      <div class="pipeline">
        <div class="step">
          <div class="step-nb">06</div>
          <div class="step-title">Cut</div>
          <div class="step-desc">AI 帮我剪辑</div>
        </div>
        <div class="step">
          <div class="step-nb">07</div>
          <div class="step-title">Wrap</div>
          <div class="step-desc">AI 帮我包装</div>
        </div>
        <div class="step">
          <div class="step-nb">08</div>
          <div class="step-title">Cover</div>
          <div class="step-desc">AI 生成封面</div>
        </div>
      </div>
    </div>
  </div>
  <div class="foot">
    <div>Page 15 · 我的内容工厂</div>
    <div>Workflow</div>
  </div>
</section>
```

**要点**：
- 用 `.pipeline-section` 分组 + `.pipeline-label` 作组标题
- 两组之间用 3.6vh 的间距 + 顶部细分隔线（已在 CSS 中预设）
- 每个 step 是固定的 nb → title → desc 结构
- 步骤数不限但单行最好 ≤5 个，否则换到第二 pipeline

---

## Layout 7: 悬念收束 / 问题页（Hero Question）

```html
<section class="slide hero dark">
  <div class="chrome">
    <div>留给你的问题</div>
    <div>24 / 27</div>
  </div>
  <div class="frame" style="display:grid; gap:8vh; align-content:center; min-height:80vh">
    <div class="kicker">The Question</div>
    <h1 class="h-hero" style="font-size:7vw; line-height:1.15">
      你的公司里，<br>
      哪些岗位本来就<br>
      不该由人来做？
    </h1>
    <p class="lead" style="max-width:50vw">
      这个问题，不是技术问题，是架构问题。
    </p>
  </div>
  <div class="foot">
    <div>Page 24 · The Question</div>
    <div>— · —</div>
  </div>
</section>
```

**要点**：
- Hero 页留白越多越好，只放一个问题
- `h-hero` 字号视长度调整（7vw 适合 3 行，10vw 适合 1 行）
- 用 `<br>` 手工断行，确保断点在语义处
- 尾巴可以再给一行 `lead` 作为点破

---

## Layout 8: 大引用页（Big Quote · 衬线金句）

```html
<section class="slide light">
  <div class="chrome">
    <div>The Takeaway · 核心金句</div>
    <div>18 / 25</div>
  </div>
  <div class="frame" style="display:grid; gap:5vh; align-content:center; min-height:80vh">
    <div class="kicker">Quote · 金句</div>
    <blockquote style="font-family:var(--serif-zh); font-weight:700; font-size:5.8vw; line-height:1.2; letter-spacing:-.01em; max-width:72vw">
      "没有交接,<br>所有人都在构建。"
    </blockquote>
    <p class="lead" style="max-width:55vw; opacity:.65">
      Without the handoff, everyone builds.<br>
      And that makes all the difference.
    </p>
    <div class="meta-row">
      <span>— Luke Wroblewski</span><span>·</span><span>2026.04.16</span>
    </div>
  </div>
  <div class="foot">
    <div>Page 18 · 金句</div>
    <div>— · —</div>
  </div>
</section>
```

**要点**：
- 整页留白,只放一个大引用 + 出处
- `<blockquote>` 用 inline style 单独放大（5-6vw）,不要用 `h-hero`（那是页面主标题的命名）
- 下面跟随英文原文（lead · opacity:.65）制造层级
- 配 `meta-row` 写出处 · 日期

---

## Layout 9: 并列对比（A vs B · 旧 vs 新）

```html
<section class="slide light">
  <div class="chrome">
    <div>旧 vs 新 · The Shift</div>
    <div>12 / 25</div>
  </div>
  <div class="frame" style="padding-top:5vh">
    <div class="kicker">Before / After · 范式转变</div>
    <h2 class="h-xl" style="margin-bottom:4vh">从交接到共建</h2>

    <div class="grid-2-6-6" style="gap:5vw 4vh">
      <!-- 左列：旧 -->
      <div style="padding:3vh 2vw; border-left:3px solid currentColor; opacity:.55">
        <div class="kicker" style="opacity:.9">Before · 旧模式</div>
        <h3 class="h-md" style="margin-top:2vh">设计 → 开发 → 交接</h3>
        <ul style="margin-top:3vh; padding-left:1.2em; display:flex; flex-direction:column; gap:1.4vh; font-family:var(--sans-zh); font-size:max(14px,1.1vw); line-height:1.55">
          <li>设计师在 Figma 做稿</li>
          <li>开发者盯着文件翻译像素</li>
          <li>反复 PR 沟通对齐</li>
          <li>非技术人员无法触碰代码</li>
        </ul>
      </div>
      <!-- 右列:新 -->
      <div style="padding:3vh 2vw; border-left:3px solid currentColor">
        <div class="kicker" style="opacity:.9">After · 新模式</div>
        <h3 class="h-md" style="margin-top:2vh">同工具 · 并行 · 共建</h3>
        <ul style="margin-top:3vh; padding-left:1.2em; display:flex; flex-direction:column; gap:1.4vh; font-family:var(--sans-zh); font-size:max(14px,1.1vw); line-height:1.55">
          <li>三个角色同时在 Intent 工作</li>
          <li>agents.md 作为共享上下文</li>
          <li>代理处理对齐 / 冲突 / 动画</li>
          <li>任何人都能安全贡献代码</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="foot">
    <div>Page 12 · 范式转变</div>
    <div>Before / After</div>
  </div>
</section>
```

**要点**：
- 用 `.grid-2-6-6`（1:1）左右分半
- 左列 `opacity:.55` 做"旧"的视觉弱化,右列满亮度做"新"的突出
- 两列都用 `border-left:3px solid` + `padding-left` 做引用块感
- 每列结构统一:`kicker` → `h-md` → `<ul>` 要点,节奏一致

---

## Layout 10: 图文混排（Lead Image + Side Text）

```html
<section class="slide light">
  <div class="chrome">
    <div>Design First · 设计先行</div>
    <div>08 / 16</div>
  </div>
  <div class="frame grid-2-8-4" style="padding-top:6vh">
    <!-- 左列:大段正文 + 引用 -->
    <div>
      <div class="kicker">Phase 01 · 设计阶段</div>
      <h2 class="h-xl" style="margin-top:1vh; margin-bottom:3vh">设计先行 · 2 周</h2>

      <p class="lead" style="margin-bottom:3vh">
        在 Figma 中完成视觉探索与设计系统,网格 / 排版 / 颜色变量 / 可复用组件,桌面和移动端稿件几轮反馈迭代。
      </p>

      <p style="font-family:var(--sans-zh); font-size:max(14px,1.15vw); line-height:1.75; opacity:.78; margin-bottom:2.4vh">
        两周之内,视觉风格、粗略结构、方向性内容全部稳定。这是扎实的传统设计流程——在这里还没什么新鲜事。
      </p>

      <div class="callout" style="margin-top:3vh">
        "This phase was pretty standard.<br>Just a solid Web design process."
        <div class="callout-src">— Luke Wroblewski</div>
      </div>
    </div>
    <!-- 右列:辅助图 · 竖版或方形 -->
    <figure class="frame-img" style="aspect-ratio:3/4; max-height:60vh">
      <img src="images/figma.png" alt="Figma design system">
      <figcaption class="img-cap">Figma · Design System</figcaption>
    </figure>
  </div>
  <div class="foot">
    <div>Page 08 · Design First</div>
    <div>约 2 周</div>
  </div>
</section>
```

**要点**：
- `.grid-2-8-4`(8:4) 让正文占主导,图片作辅助
- 左列包含多种信息层级:kicker → 大标题 → lead → 正文段落 → callout(引用)
- 右列图片用 **竖版 3:4** 或方形 1:1,避免和左列文本竞争注意力
- 这种布局适合**页面信息量偏大**的场景(不像 Layout 4 只有一句金句)

---

## 附录：常用网格模板

| 类名 | 配比 | 用途 |
|---|---|---|
| `.grid-2-6-6` | 6:6（1:1） | 对半分 |
| `.grid-2-7-5` | 7:5 | 文字为主 + 辅助图 |
| `.grid-2-8-4` | 8:4（2:1） | 大段文字 + 小图/数据 |
| `.grid-3` | 1:1:1 | 3 项并列（案例/截图） |
| `.grid-3-3` | 3×2 | 6 图矩阵 |
| `.grid-6` | 3×2 | 6 个数据卡片 |

所有网格都预留 `gap: 3vw 4vh`（水平 3vw、竖直 4vh），可以单独覆写。

---

## 页面节奏建议

一场 25-30 页的分享，推荐以下节奏：

1. **Hero Cover**（第 1 页）
2. **Act Divider**（第一幕开场，hero light 或 hero dark）
3. **Big Numbers**（抛硬数据制造冲击）
4. **Quote + Image**（讲身份反差/挂钩）
5. **Image Grid**（证据支撑）
6. **Hero Question**（幕收束，留悬念）
7. ... 第二幕、第三幕同样节奏 ...
8. **Hero Close**（最后一页，问题或致谢）

hero 页与 non-hero 页应该 **2-3 : 1 比例交错**，不要连续超过 3 页 non-hero，也不要连续超过 2 页 hero。
