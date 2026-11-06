# ChatPanel 24 组件对最新设计稿的全量盘点(2026-09-02)

> 本轮**只读审计**,不改任何产品代码。产出目的:给下一波直接派工。
> 编写者:W3 组。有多个 agent 正在并行改这个工作树,下文所有「产品现状」判定都以基准 commit 为准。

## 取证方法与其边界(先读这段,再读结论)

本轮盘点**全程没有跑测试、没有起服务、没有开浏览器**(用户机器内存紧张,中途下的硬约束)。
所有判定的证据来源只有两类:**读 React 源码的分支** + **读 CSS 规则**。

因此本文档把判定分成四档,**「已实现」这一档的门槛卡得很死**:

| 判定 | 含义 | 什么情况下才允许用 |
|---|---|---|
| **已实现** | 读到了明确的 React 分支 **且** 明确的 CSS 规则,且不依赖层叠竞争 | 每条都写了依据 |
| **有偏差** | 实现存在,但读出了**具体的、可量化的**数值差 | 必须给出「现值 → 期望值」 |
| **缺失** | 搜遍相关文件找不到实现 | 必须写清搜过哪些关键词 |
| **需浏览器量测** | 读代码判不了最终计算样式 | **默认落这一档**,不许因为"CSS 文本看着一样"就升格成已实现 |

⚠️ **为什么「需浏览器量测」这么多不是偷懒**:本仓在「只 diff CSS 文本、没量计算样式」上踩过 **11 次**同类错 —— 文本一致但层叠反转,最终计算样式是错的。本轮设计稿又大量使用 `:has()` 选择器和继承链(见 §3.1 字重基线),这两样恰恰是读文本最容易判错的地方。所以凡是最终值由**层叠竞争、`:has()` 命中、或继承链**决定的,一律不下结论。

**§7 各表里的「需浏览器量测」条目都写成了可直接照着量的形式**:量哪个选择器、量哪个属性、期望值多少、为什么读代码判不了。调度者可以照单执行,不必回头追问。

## 0. 分析基准

| 项 | 值 |
|---|---|
| 工作树 | `/Users/elian/Documents/od-wt-chat-panel`(分支 `feat/chat-panel-next-impl`,PR #7518) |
| **基准 commit** | **`c5d5a9e621`** `feat(chat): give question forms a real color and amount control` |
| 设计基准(唯一权威) | PR #7170 @ `8015870095348aa40655ef70edec6ac4de6fcc1b` |
| 生成页(浏览器验收用) | `/Users/elian/Documents/od-design-artifacts/chat-panel-next-pr7170-8015870.html` |
| 场景稿 | `/Users/elian/Documents/od-design-artifacts/chat-panel-scene-pr7170-8015870.html` |
| 旧稿(仅供 diff) | `/Users/elian/Documents/od-design-artifacts/chat-panel-next.html` = `1bbdce0b06` |

**观察窗口内工作树是脏的**,以下文件在盘点期间正被其它组修改,相关判定标注了「本轮在做」:

```
 M apps/web/src/components/ChatPane.tsx
 M apps/web/src/components/chat/ExecutionShell.tsx
 M apps/web/src/components/chat/PlanPill.module.css
 M apps/web/src/components/chat/primitives/Foldable.tsx
 M apps/web/src/components/chat/primitives/record.module.css
 D apps/web/src/components/chat/primitives/useThinkingStream.ts     ← G2 正在执行「思考区不要滚动窗口」的产品裁决
 M apps/web/src/runtime/chat/build-turn-blocks.ts
 D apps/web/tests/components/chat/thinking-stream-tempo.test.ts
```

---

## 1. 计数核实:89 行,不是 88

审计文档 `chat-panel-pr7170-design-diff.md` §4 说最新稿有 **89** 行 `.st-l`。**核实通过,我数出来也是 89。**

三条独立证据互相印证:

| 来源 | 组件数 | `.st-l` 行数 |
|---|---:|---:|
| 设计源码 `body-components.html` @ `8015870095` | 24 | **89** |
| 生成页 `chat-panel-next-pr7170-8015870.html` | 24 | **89** |
| 旧稿生成页 `chat-panel-next.html`(`1bbdce0b06`) | 24 | 84 |

新增的 5 行全部落在 `cmp-clarify`(组件 5),按设计稿里的实际排列顺序是第 2 / 7 / 8 / 14 / 15 行:

| 稿内序 | 新增行 |
|---:|---|
| 2 | 下拉单选 · 常用语言先展示,点「更多语言」展开;超过 6.5 行可上下滚动 |
| 7 | 颜色选择 · 预设颜色、自定义色值与实时预览 |
| 8 | Amount Slider · 可编辑数值与滑动同步,无刻度点 |
| 14 | 已回答 · 颜色保留色块和 Hex 值 |
| 15 | 已回答 · 数值滑杆收成标签与档位 |

**「88」这个数从哪来**:审计文档把「语言下拉」判成「已有单选态的一种交互呈现」而不是独立产品状态,于是 89 行 → 88 个产品状态。这个折算**依赖一条尚未拍板的产品判断**(见 §8 待拍板 #1)。本盘点一律按 **89 行**走,不做折算 —— 折算属于产品裁决,不该由盘点悄悄替产品定下来。

---

## 2. 24 组件 ↔ Plane 单号映射

**任务书给的四张单子只覆盖 19 个组件。**剩下 5 个(任务进度 + 四类工具行)归 **OPEND-2196「[组件] 执行记录 · 组件 7/9/10/11/12」**,那张单子不在任务书的表里,但同属一个模块,本盘点一并覆盖,共 24 个。

### 编号对不上的地方,以及我怎么定的

Plane 单子的组件编号**不是**设计稿里 `<article>` 的出现顺序。但它也不用猜 —— 设计稿每个组件自己带着编号:

```html
<article class="cmp mod-w2" data-od-id="cmp-paused">
  <div class="cmp-h"><span class="no">20</span><span class="nm">暂停任务</span></div>
```

`<span class="no">` 就是权威编号。用它得到的映射,和从四张单子的标题反推出来的编号集合**完全吻合**(五张单子的编号并集 = 1..24,每个恰好一次),且三张单子的「解锁验收格」数字对得上旧稿的状态数,所以这个映射是**互相印证过的,不是推测**。

### 全表

| 组件号 | design id | 组件名 | 设计稿状态数 | 归属单号 |
|---:|---|---|---:|---|
| 1 | `cmp-msg-text` | 用户消息-文本 | 7 | OPEND-2199 输入 |
| 2 | `cmp-msg-att` | 用户消息-附件 | 8 | OPEND-2199 输入 |
| 3 | `cmp-thinking` | Thinking | 3 | OPEND-2197 理解段 |
| 4 | `cmp-start-copy` | 开始执行文案 | 1 | OPEND-2197 理解段 |
| 5 | `cmp-clarify` | 意图澄清 | **15** | OPEND-2197 理解段 |
| 6 | `cmp-plan-card` | Plan 卡 | 2 | OPEND-2200 边界 |
| 7 | `cmp-task-progress` | 任务进度 | 3 | **OPEND-2196 执行记录** |
| 8 | `cmp-memory` | 记忆组件 | 2 | OPEND-2197 理解段 |
| 9 | `cmp-tool-read` | 工具调用-读 | 1 | **OPEND-2196 执行记录** |
| 10 | `cmp-tool-write` | 工具调用-写 | 1 | **OPEND-2196 执行记录** |
| 11 | `cmp-tool-code` | 工具调用-代码执行 | 3 | **OPEND-2196 执行记录** |
| 12 | `cmp-tool-image` | 工具调用-生图 | 3 | **OPEND-2196 执行记录** |
| 13 | `cmp-summary-copy` | 总结文案 | 2 | OPEND-2198 产出收尾 |
| 14 | `cmp-artifact` | 产物卡片 | 4 | OPEND-2198 产出收尾 |
| 15 | `cmp-feedback` | 反馈 / 复制 / Fork | 7 | OPEND-2198 产出收尾 |
| 16 | `cmp-next-steps` | 下一步引导 | 2 | OPEND-2198 产出收尾 |
| 17 | `cmp-queue` | Queue | 3 | OPEND-2200 边界 |
| 18 | `cmp-upgrade` | 升级 | 3 | OPEND-2200 边界 |
| 19 | `cmp-error` | 报错 | 3 | OPEND-2200 边界 |
| 20 | `cmp-paused` | 暂停任务 | 1 | OPEND-2200 边界 |
| 21 | `cmp-att-tray` | 待发送附件(表外) | 5 | OPEND-2199 输入 |
| 22 | `cmp-reconnect` | 重连(表外) | 3 | OPEND-2200 边界 |
| 23 | `cmp-selection` | 选中文字·添加到对话(表外) | 5 | OPEND-2199 输入 |
| 24 | `cmp-audio` | 音频产物(表外) | 2 | OPEND-2198 产出收尾 |
| | | **合计** | **89** | |

### ⚠️ Plane 单子上的「解锁验收格」数字已过时

四张单子写的是 **82 状态**口径(单子正文:「wangchenglong 交付稿(24 组件 / 82 状态)」)。现在是 89。

| 单号 | 单子写的格数 | 按最新稿实际格数 | 差 |
|---|---:|---:|---:|
| OPEND-2196 执行记录 | 11 | 11 | 0 |
| OPEND-2197 理解段 | 16 | **21** | **+5**(全在意图澄清) |
| OPEND-2198 产出收尾 | 17 | 17 | 0 |
| OPEND-2199 输入 | 24 | **25** | +1 |
| OPEND-2200 边界 | 14 | **15** | +1 |
| 合计 | 82 | **89** | +7 |

逐组件核对旧稿(84 行)与新稿(89 行),**唯一变动的组件是 `cmp-clarify`,10 → 15**,其余 23 个组件一格没动。所以:

- `+5` 全部由 PR #7170 造成,全在意图澄清
- 另外的 `+2`(输入组 1 格、边界组 1 格)在我手上的旧稿(84 行)里**已经存在**,是 82 → 84 那次加的,**早于本 PR**。手上没有 82 行那版源码,无法定位到具体是哪两格 —— 如果需要精确归因,得找出 82 状态那版交付稿

**建议把这五张单子的格数描述更新到 89 口径**,否则验收时会按 82 收工。

---

## 3. 全局横切风险(不属于任何单个组件,但会污染所有组件的判定)

这一节是本盘点**最重要的部分**。下面四条如果不先定,任何「逐条 diff CSS 文本然后照抄」的做法都会把偏差放大而不是收敛。

### 3.1 🔴 字重基线错位 —— 会让「文本一致」的移植全线反转

PR #7170 在 `components.css` 里加了一条:

```css
body { font-weight: 500; }   /* 设计稿新增 */
```

产品这边:`apps/web/src/styles/base.css:29` 的 `body {}` **没有 `font-weight`**,继承浏览器默认的 **400**;`apps/web/src/components/chat/ChatRoot.module.css`(`--chat-*` 接缝层)**也没有**任何基线字重声明。

后果是**语义反转**,不是差一档:

| 设计稿写的 | 在设计稿里的含义(基线 500) | 照抄到产品后的含义(基线 400) |
|---|---|---|
| `font-weight: 500` | 和基线**同档,不是强调** | **比基线重一档 = 强调** |
| `font-weight: 400` | 比基线**轻一档 = 弱化** | 和基线**同档,不是弱化** |

具体撞上的规则(都是 PR #7170 本轮改的):
- `.opt.is-on { font-weight: 500 }` —— 设计稿的原注释明说选中态「只剩两处变化:控件填实 + 换成 `--select-ink`」,字重**不参与**。照抄进 400 基线的产品 = 凭空多出一档加粗强调。
- `.steps li { font-weight: 400 }` / `.steps li.is-done` —— 设计里是「比基线轻」,照抄进产品 = 完全没效果,`is-now` 的 600 对比度因此被拉大。
- `.answered .ak { font-weight: 500 }`、`.opt .own-l { font-weight: 500 }`、`.nexts button { font-weight: 500 }`、`.cmp-meta b { font-weight: 500 }`、`.bub { font-weight: 500 }`、`.language-more-toggle { font-weight: 500 }` —— 同理。
- `.tool .cnt`(重连计数)400→500:G4 已经**独立发现并正确处理了这一条**(commit `f49c184066` 的说明:「the design raised its own body weight in the same commit, so a literal 500 here would put a heavier number inside a lighter sentence」),改成了继承而不是钉死 500。**但这只解决了 1 条,其余同类规则没有统一口径。**

当前 chat 面已经落了 **25 处 `font-weight: 500` 字面量**(`components/chat/*.css` + `styles/chat.css` + `viewer/composio.css`),每一处是否正确都取决于这条尚未拍板的基线。

**需要拍板**(见 §8 #2):chat 面基线抬到 500,还是保持 400 并把设计稿的 500 逐条翻译成「不强调」?

### 3.2 🔴 不要照抄 mono 字体的 `font-weight: 500` 描述符

`tokens.css` 本轮把 `JiduMono Pro` 的 `@font-face` 描述符从 400 改成 500:

```css
@font-face { font-family: "JiduMono Pro"; font-weight: 500; ... }   /* 设计稿改动 */
```

设计稿那份 `@font-face` **没有 `src`**(是从产品原样抄过去的壳),改它对设计页面没有任何视觉后果。产品这边不一样:

- `apps/web/src/styles/base.css:19-25` 声明 `src: url("/fonts/JiduMonoPro-Regular.otf")`,`font-weight: 400`
- `apps/web/public/fonts/` 里**只有 `JiduMonoPro-Regular.otf` 一个字重**(对照:Albert Sans 是可变字体,声明的是 `font-weight: 100 900`)

把描述符改成 500 = 谎报字体文件里有 500 面 → 浏览器对所有 mono 文本做**合成加粗**。受影响的是耗时 `31s`、文件路径、Hex 值 `#3b82f6`、改动量 `+12 -3`、重连计数 —— 恰好全是「不该被强调的数字」。

**结论:这一条明确不移植。**(审计文档已经预警过同一件事,本盘点独立复核确认。)

### 3.3 🟡 `--chat-radius-2xl` 接缝变量缺失,已有两个消费方在吃兜底

设计稿新增了 16px 那一档:`--radius-2xlarge: 16px` / `--radius-2xl`。

- 产品 token 层**已经有了**:`apps/web/src/styles/tokens.css:108` 和 `:119`
- 但 `--chat-*` 接缝层(`ChatRoot.module.css:117-120` / `:228-231`)只定义了 `--chat-radius-sm` / `--chat-radius` / `--chat-radius-lg` / `--chat-radius-pill`,**没有 `--chat-radius-2xl`**

已有两个消费方靠 CSS 变量兜底写法硬撑:
- `apps/web/src/components/chat/RunErrorCard.module.css:28` — `var(--chat-radius-2xl, var(--radius-2xl))`
- `apps/web/src/components/chat/UpgradeCard.module.css:55` — 同上
- `apps/web/src/components/chat/primitives/record.module.css:907` 留了 TODO 注释等这个变量

设计稿本轮把 **4 处**改到 16px:`.errb`(报错卡)、`.modal`(联系支持弹窗)、记忆卡外壳 `.fold:has(> summary > .memo-ic)`、Thinking 底卡。**建议在接缝层补 `--chat-radius-2xl` 后再统一收口**,否则每个新消费方都要写一遍兜底。这属于 OPEND-2185(chat 主题接缝)的余额,不该塞进组件单。

### 3.4 🟡 接缝层的 upgrade 变量语义已陈旧

设计稿本轮把 token **改名并翻转了语义**:`--upgrade-ink`(绿字压黑底)→ `--upgrade-surface`(绿底配深字)。

产品接缝层 `ChatRoot.module.css:73` / `:193` 仍叫 `--chat-upgrade-ink: #00ff08`,而 `UpgradeCard.module.css:43` 已经在用它当**底色**(`--upgrade-surface: var(--chat-upgrade-ink)`)。色号没错,名字撒谎了。

同理 `--chat-upgrade-amount: #f8672f`(`ChatRoot.module.css:76` / `:196`)是白卡那一档;深色卡要的是 `#f49624`,`UpgradeCard.module.css:38` 已在本地重新定义并**在注释里明确记下这是有意留给接缝层处置的**。属于已知技术债,不是遗漏。

---

## 4. 验收载体现状:镜像陈列页停在 84 格

这是**下一波派工最该先知道的一件事**。

OPEND-2188「镜像陈列页」**已经存在**,但不是 web 的 dev 路由,而是一个测试文件:

- 生成器:`/Users/elian/Documents/od-wt-chat-panel/apps/web/tests/components/chat/mirror-gallery.test.tsx`(2918 行)
- 产物:`/Users/elian/Documents/od-wt-chat-panel/docs/design/chat-mirror/mirror-exec.html`
- 重建命令(落点由命令给,不写死在测试里):
  ```
  OD_WRITE_MIRROR="$PWD/docs/design/chat-mirror/mirror-exec.html" \
    pnpm --filter @open-design/web exec vitest run \
    -c vitest.config.ts tests/components/chat/mirror-gallery.test.tsx
  ```

它的自律很硬(每格走 `buildTurnBlocks` / `deriveFileOps` / `buildStagedAttachmentCards` 真实链路,**不手捏 props**;挂现成组件的格子照抄产品调用点),所以它照出来的是真实产线形态,不是摆拍。

**但它对着的是旧稿的 84 格。**`CELLS` 里 84 格齐全(`gid` 1..84,`sub` 形如 `22-3` = 组件 22 第 3 态),PR #7170 新增的 5 行**一格都没有**:意图澄清的格子是 `askCell(16..25, '5-1'..'5-10')`,停在 10 格。

**行动建议(高优先、低成本、解锁面最大)**:把这 5 格补进 `mirror-gallery.test.tsx`,让陈列页从 84 → 89。这件事:
- 只动一个测试文件,不碰任何产品源码 → **可以和其它所有组并行,零冲突**
- 完成后设计师才有办法逐格验收本轮新增的三个控件
- G1 组刚落地的颜色/数值控件正好缺一个可视验收出口

顺带:陈列页 README(`docs/design/chat-mirror/README.md`)写「84 格里的 79 格」,测试文件的注释写「80 格」,两处不一致,且都是 84 口径。补格时一并更新。

---

## 5. 设计稿与产品裁决冲突

> 这一节专门收「设计稿有、但产品已经拍板不做」的项。这类冲突以后还会有,固定放这儿,免得下一轮盘点又把它当缺口捡回来。

| # | 组件 | 设计稿要求 | 产品裁决 | 状态 |
|---|---|---|---|---|
| C1 | 3 · `cmp-thinking` | 思考区是一扇**定高滚动窗口**:`.fold.mod-flat > .body.mod-stream` 96px 定高(`--stream-h`)、`.stream-viewport` 自动贴底滚动、上下各 32px 渐隐 mask(`--stream-fade`),配套 `thinking-stream.css` / `thinking-stream.js` 整套 | **否决**。用户原话:「先不要这个滚动的了,这里文本就和外面普通文本一样有个流式的效果就行,不要这个滚动效果了,滚动太慢了,也很难看清」 | G2 组正在实施;基准 commit 之后工作树里 `useThinkingStream.ts` 已删除、`thinking-stream-tempo.test.ts` 已删除、新增 `thinking-stream-window.test.tsx` |

**C1 之后组件 3 真正还要对齐的**(这几条**不在**否决范围内,仍是缺口候选):
1. 思考正文和普通正文**同一套流式浮现**
2. **自然高度**,不定高
3. **灰底容器保留** —— 设计稿 `thinking-stream.css` 的底卡部分仍然有效:`--stream-surface: #FAFAFA`、`border-radius: 16px`、`padding: 8px`(`--stream-pad`)、`margin-block: 8px`(`--stream-gap`)、底卡走 `::before` 独立成层不参与滚动/透明度计算
4. 折叠 / 展开行为不变

⚠️ 移植时要**分清哪条被否决**:同一次改动里的 `.fold.mod-flat > .body.mod-stack:not(.mod-stream) > .think { font-size: var(--t-body) }`(供阅读的推理正文 13px)**仍然有效**,被否决的只是 `mod-stream` 那扇窗口本身。

### 5.1 其余已裁决项(盘点时逐条查到裁决记录,**一律不计缺口**)

| # | 组件 | 设计稿要求 | 产品裁决 | 裁决记录在哪 |
|---|---|---|---|---|
| C2 | 3 | 跑完那一格**不自带折叠**(稿子 DOM 里无 `<summary>`,就是几段纯文字) | 做成**可折叠 + 96px 限高滚动**。用户 2026-08-27:「thought 展开应该有个最高高度, 可以滚动」 | `record.module.css` 的 `.scroll` 规则注释逐字引用了那句话 |
| C3 | 4 | 开始执行文案放在壳**外**(`.say` 是 `.flow` 直接子,排在 `.fold.mod-flat` 之前) | 放壳**内**。2026-08-26 用户裁决:「没有 todowrite 时,所有工具调用或普通文本或者 thinking,都收拢在展开收起卡片里;当有了 done 信号之后,输出的平台文本内容才会显示到卡片外面」 | `build-turn-blocks.ts:546-570` |
| C4 | 1 | 气泡 hover **背景加深**(`.msg-row:hover .bub`) | **不做**。那条在交付稿自己那一页上是**死规则**(普通气泡祖先是 `.msg-me`,只有摆拍格用 `.msg-row.is-hover`),用户在原稿上 hover 无反应;且它**自带矛盾** —— 状态名写「加深」,值 `#202020→#494949` 在白底上是**变浅** | `chat.css:1049-1056`,标注「2026-08-26 用户裁决」 |
| C5 | 1 | 失败重试 `.msg-fail` 独立成气泡**下方一行** | **并进 `.user-actions` 操作行**。理由:隐藏的动作行照样占 30px,另起一行会让气泡和「重试」之间空一大截 | `chat.css:3746-3758`。⚠️ 这条**不影响** §7.4 #49 那个真缺口 —— 形态合并是裁决,常驻与否是 bug,两件事 |
| C6 | 1 | cmp-ops 说「hover 时『…』后面浮出下拉箭头」 | **稿子自己已经删掉了那枚箭头**(新 `components.css:373-390` 注释原话:「那枚箭头连同它的演示色一起去掉」),说明文字是旧稿残留。产品按 CSS 走,#46/#47 同一态 | 设计源码本身 |
| C7 | 9 / 10 / 11 / 12 | `.ti:empty::before` 行首圆点兜底 | **不做**。2026-08-25 裁决「不许出现圆点,每一格都要能指到图标」,已由 `icons.tsx:159-169` 的 `ToolFallbackIcon` 顶替 | `icons.tsx` |
| C8 | 14 | 卡面「**不写文件名**」 | md/txt/json 这类加了 `doc` 档,卡面写「图标 + 文件名」。用户 2026-08-26 真机指认「变成上面卡片形式才对」,否则这类产出退化成一行灰列表 | `FileOpsSummary.tsx:391-399` |
| C9 | 14 | 「发布」是纯文字胶囊;动作胶囊无显式高度 | 按 **OPEND-2559** 补了 `share-forward-line` 图标;按 **OPEND-2560** 把外框高度写死 28px(**只超越外框,填充/内描边/字号/图标/交互仍守稿子**) | `tools.css:228-230` |
| C10 | 14 | 稿子没有「还在写」的占位档 | 产品 2026-08-21 加了像素液体占位,2026-08-26 明确「不能用灰色卡片代替」(D37) | `tools.css:276-289` |
| C11 | 15 | `.fb` 回合状态行**常驻** | 按 **OPEND-2542** 用 `opacity` 门控:默认隐藏,只在 `[data-last="true"]` 或消息 hover / focus 时显形 | `composio.css:4137-4152` |
| C12 | 13 | 逐字化开只定单字 0.4s + 错开 10ms,**不封顶** | 加 `REVEAL_BUDGET_MS = 2000` 总预算(长文本改成一个 span 装多字)。用户 2026-08-27 原话 | `useCharReveal.ts:24-39` |
| C13 | 24 | 第二枚键是 `.aud-x`「×/移除这段音频」 | 换成**下载原件**。理由:音频是单格式产物,预览区的导出菜单只发给 `HtmlViewer`,挂 `onExport` 点下去什么都不会发生。2026-08-27 裁决 | `FileOpsSummary.tsx:185-195` |
| C14 | 17 | `.queue` **不套框不铺底** | 补了一圈淡边框。2026-08-27 产品原话「给我们消息队列加一个小边框吧…你边框淡一点」 | `chat.css:3502-3529` |
| C15 | 18 | 点 Upgrade 后**四支身份全弹窗** | 2026-08-26 裁决改成 **2 弹窗 + 2 外跳**(非 Max·owner 直跳 Pricing、Max·owner 跳 vela web 带 auto_recharge 意图、两支非 owner 才弹 `AmrOwnerTopUpDialog`) | `amr-balance-branch.ts:10-19` 的裁决表 |
| C16 | 19 | 「从失败处重试」→「重试」 | **审计结论:不需要改动。** 产品当前用的 `promptTemplates.retry` **已经就是「重试」**,和新稿一致 | `zh-CN.ts:1736` |

### 5.2 产品比稿子**多做对**的几处(也不算缺口,别"对齐"回去)

| 组件 | 产品多做的 | 为什么是对的 |
|---|---|---|
| 23 | `.refs:hover .pop` 补了 `pointer-events: auto` | **稿子那条是 bug** —— 只写了 opacity,不补的话浮层里的列表滚不动 |
| 23 | `quotePopoverMaxHeight` 按面板高度收口 | 稿子只给了一半 |
| 2 / 21 | 附件行翻页箭头 + 四路重量(scroll / ResizeObserver / resize / fonts.ready) | 稿子没画 |
| 22 | `showCount = max > 1` | agent-retry 预算今天是 1,写「1/1」没信息量;传输层的 5 不受影响 |
| 22 | 重连失败行**不写**红边红底 | 稿子里 `.tool:has(.wifi)` 排在 `.tool.is-fail` 之后**把边底压掉了** —— 产品直接不写,结果一致 |
| 15 | 不再做一版 fill 图标 | **「图标变填充」这句话稿子自己没实现** —— 默认态与 `.is-on` 态两枚 button 内层 md5 完全相同,只换底色字色 |

---

## 6. 明确挂起 / 本轮已做

### 6.1 产品已挂起待讨论 —— 不得实现,也不计为缺口

| 项 | 涉及组件 | 说明 |
|---|---|---|
| 选项列表的**分组能力**(常用 / 更多折叠) | 5 · `cmp-clarify`(语言下拉那一行) | 用户挂起待讨论 |
| `FormOption` **行尾副标**(language-code,如 `ZH-CN`) | 5 · `cmp-clarify` | 需扩 schema,同上挂起 |

「下拉单选 · 语言选择」这一行本身仍在盘点范围内(要说清当前 `select` 走的什么渲染路径),只是上面两个能力点标注为已挂起。

### 6.2 本轮已做,待浏览器复验 —— 不要重复派工

| 项 | 组件 | 承接组 | 证据 |
|---|---|---|---|
| 颜色选择器(预设 + 原生取色器 + Hex + 实时预览 + 已答摘要) | 5 | G1 | commit `c5d5a9e621` |
| 数值滑块(可编辑数值 + 双向同步 + 已答摘要) | 5 | G1 | commit `c5d5a9e621` |
| 多选计数器两段式 | 5 | G1 | commit `c5d5a9e621`(按已有翻译的 count 槽位切分,不拼接片段) |
| Upgrade 卡改版(CTA 移底排 + 绿底深字翻转) | 18 | G4 | commit `f49c184066` |
| 产物卡动作 + 9:16 contain + 分享导出面板 | 14 | G3 | — |
| 用户气泡 `#121212` + 静音色档 `#a3a3a3` + 队列图标尺寸 | 1 / 15 / 17 | G5 | `styles/chat.css:566` `--chat-message-muted-ink`、`:576` `--chat-user-bubble-ground` |
| next-step 字重 | 16 | G6 | — |

这些一律标「本轮已做,待浏览器复验」——**已做 ≠ 已对齐**,计算样式还没在浏览器里量过(见 §7 各表的判定)。

---

## 7. 89 状态逐格台账

判定汇总(89 格):

| 判定 | 格数 |
|---|---:|
| 已实现(读到 React 分支 + CSS 规则,不依赖层叠竞争) | **32** |
| 有偏差(读出了具体可量化的差) | **36** |
| 缺失(搜遍相关文件找不到实现) | **4** |
| 需浏览器量测(最终计算样式读代码判不了) | **17** |

组件级:

- **全部状态判为「已实现」的组件:3 个** —— 13 总结文案、14 产物卡片、16 下一步引导
- **无已知缺口,但仍待量测或待裁决:4 个** —— 7 任务进度、18 升级、21 待发送附件、22 重连
- **有确认缺口:17 个** —— 1、2、3、4、5、6、8、9、10、11、12、15、17、19、20、23、24

### 7.1 OPEND-2196 执行记录(组件 7 / 9 / 10 / 11 / 12,11 格)

实现面全部在 `apps/web/src/components/chat/ExecutionShell.tsx` + `primitives/`。`ToolCard.tsx` 与 `viewer/tools.css` **已不在这一组的渲染路径上**。

| # | design id | 状态 | 实现位置 | 判定 | 缺口 |
|---|---|---|---|---|---|
| 1 | task-progress | 进行中 | `ExecutionShell.tsx:142-189`;`record.module.css:702-728` | 需量测 | 三级排版层次要真实嵌套才看得出(M1–M4);`.tool` 墨色未跟(缺口 A) |
| 2 | task-progress | 已完成 | `ExecutionShell.tsx:190`、`:109-132`;`ToolRow.tsx:164` | 需量测 | 折叠语义对;三级排版同上。这一格**必然带 plan**,被 `:not(.hasTodo)` 排除(缺口 D) |
| 3 | task-progress | 运行失败 | `ExecutionShell.tsx:135-137`;`record.module.css:395`、`:762` | **已实现** | 无 |
| 4 | tool-read | 成功 / 失败 | `ToolRow.tsx:89-152`;`build-turn-blocks.ts:1420` | 有偏差 | ①「失败可点查看原因」没接线(`onShowFailure` 全仓无人传);② 墨色未跟;③ 图标 15/14px vs 稿 16/16px |
| 5 | tool-write | 成功 / 失败 | `ToolRow.tsx:89-103`;`record.module.css:471-480` | 有偏差 | `.delta` 用 `--chat-text-soft` `#848484`,稿子 `#A3A3A3`;同 #4 的按钮与图标 |
| 6 | tool-code | 执行中 | **未实现** | **缺失** | **没有数据源** —— `build-turn-blocks.ts:1420` `if (!result) return null`,终端内容只在 `tool_result` 到达时一次性落地。要做需 daemon 新增工具进度事件。另:无 running 记号分支;`ToolRow.tsx:222-225` 无条件贴底,没有「用户已上滚」检测 |
| 7 | tool-code | 成功 · 默认收起 | `ToolRow.tsx:159-173`;`record.module.css:773-809` | 有偏差 | ① `--term-section-gap` 整条缺失 → 命令块与输出块间距 **14px,稿子 8px**;② `.term.cmd` / `.term` 墨色未跟;③「正常命令行整行退灰」那条缺失,且产品**没有 `.fold.is-fail` 这个类**,`:not(.is-fail)` 无从表达 |
| 8 | tool-code | 失败 · 默认展开 | `ToolRow.tsx:159-173`;`record.module.css:808-809` | 有偏差 | `.term .er` 墨色未跟;失败折叠头的图标**不会转红**(`.tool.fail .icon` 管不到 `details` 的 summary) |
| 9 | tool-image | 执行中 · 计数在走 | `ImageRow.tsx:70-124`;`build-turn-blocks.ts:1259-1330` | 需量测 | 结构齐。**G7 正在做 OPEND-2195**,不列为新缺口;样式缺口同 A/B |
| 10 | tool-image | 成功 · 缩略图条 | `ImageRow.tsx:38-67`;`record.module.css:856-872` | 有偏差 | ① `.tool.mod-image-result` 类缺失(但可能被壳内 `border-radius:0` 压平,连稿子自己都可能不生效 → M7);②「点缩略图弹层大图 + 左右键切换」未实现,产品是在文件查看器里打开 → 待拍板 |
| 11 | tool-image | 部分失败 · 单独重试 | `ImageRow.tsx:102-111`;`ExecutionShell.tsx:220` | 需量测 | ① `.shot` 双档圆角 G2 本轮已落,待复验;② 重试被 `runTerminal`(整轮终态)门住,稿子没这前提 → 待拍板;③ 只能从 `tool_result` 文本解析时,失败格位次仍是「成的排前砸的排后」 |

**缺口 A ·`#A3A3A3` 静音墨色一族(12 条规则)** —— 这个值在产品 token 表里**没有对应项**(`--text` `#494949` / `--text-muted` `#5c5c5c` / `--text-soft` `#848484` 都不是)。产品已有同值变量 `--chat-progress-detail-ink: #a3a3a3`(`record.module.css:151`)。
⚠️ 两条**不能直接照抄**:稿子的 `.tool .ms` 与 `.fold > summary .ms` 是两条不同作用域,产品合成了一条裸 `.meta`;`.tool .ti` 与 `.fold > summary .ti` 同理合成了裸 `.icon`。要改**必须先拆作用域**,否则会把折叠头的耗时一起染灰。

**缺口 B · 工具图标 14px → 16px** —— 产品永远有图标(`toolIcon` 不返回 null),所以不需要 `:has()`,直接把 `.icon` 与 `.icon > svg` 改成 16×16。
⚠️ **会连带一条测试**:`icon-stroke-weight.test.tsx:63-65` 把 `DESIGN_EFFECTIVE.toolRow` 钉死在 `1.021`(1.75×14÷24),改后应为 `1.167`(1.75×16÷24)。新基线在同文件头注释里已有记载 —— **这不是回归,是必须同步更新的基线**。

**缺口 C · 终端块三条新规则** —— 其中「正常命令行退灰」**照抄不了,要翻译**:产品 `summary` 下多一层 `.summaryContent`(`Foldable.tsx:79-81`),稿子的 `summary:has(> .ti)` 要写成 `summary:has(> .summaryContent > .icon)`;且要先给 `Foldable` 加失败标记类。

**缺口 D · 三级排版被 `:not(.hasTodo)` 挡住了稿子的规范场景** —— G2 把「步骤间小结 12px + `#a3a3a3`」落在 `.fold.flat:not(.hasTodo) …`(`record.module.css:274-281`)。但稿子的 `progress-done` 那一格**恰恰有 plan**,产品该格 `hasTodo=true`,整条规则不命中。`:not(.hasTodo)` 的原始理由是 2026-08-27 用户对**缩进**的裁决,**字号/墨色是顺着同一条选择器加上去的,没有单独裁决背书** → 待拍板。

### 7.2 OPEND-2197 理解段(组件 3 / 4 / 5 / 8,21 格)

| # | design id | 状态 | 实现位置 | 判定 | 缺口 |
|---|---|---|---|---|---|
| 1 | thinking | 进行中 | `ExecutionShell.tsx:334`;`ThinkingMarkdown.tsx:41`;`useCharReveal.ts` | 有偏差 · 在飞 | 按裁决后的四条口径:流式浮现**已有**(单字 0.4s / 字间 10ms,与稿逐值一致);自然高度 + 灰底容器 **G2 已在工作树补上**。**遗留一处**:G2 用 `--chat-bg-fill-tertiary` = `rgba(0,0,0,0.03)`(半透明),稿子要**不透明** `#FAFAFA`(产品对应 token 是 `--bg-panel`) |
| 2 | thinking | 内容开始落地 | `build-turn-blocks.ts:633-635`;`ExecutionShell.tsx:249` | **已实现** | 无 |
| 3 | thinking | 跑完 · 收进任务进度 | `ExecutionShell.tsx:334`(`scroll={!live}`) | 冲突 · 不计缺口 | 稿子是「几段纯文字、不自带折叠」;产品是「可折叠 + 96px 限高滚动」,依据 2026-08-27 用户「thought 展开应该有个最高高度, 可以滚动」→ 见 §5 冲突表 |
| 4 | start-copy | 唯一状态 | `SayText.tsx:33`;`build-turn-blocks.ts:530/546/570` | 有偏差 | ① 字号:稿 13px,产品 `.think` 12px。G2 已补 13px,但选择器 `.fold.flat > .body.stack > .think` **只覆盖没有 todo 的形态**,开场白落进 todo body 时不命中;② 位置在壳外 vs 壳内 → 已裁决,见 §5 |
| 5 | clarify | 单选 · 待选 | `QuestionForm.tsx:744-760`、`:565-597`;`composio.css:758-921` | 有偏差 | ① 卡头字号 12px,稿 **14px**;② 卡头标题字重无 500 变体(稿新增 `.card:has(> .cbody > .opts) > .h > b { 500 }`);③ 问句 `.qf-label` **无 `font-weight`**,稿新增 500,且旁边注释仍是旧稿口径;④ `.qf-picked` 靠继承拿 12px,卡头一改就跟着涨 |
| 6 | clarify | 下拉单选 · 语言 | `QuestionForm.tsx:744`(`select` 与 `radio` **走同一分支**) | **缺失** | `select` 渲染成和单选完全一样的竖排 chip,**没有任何下拉外壳**。稿子整套 `.opts.mod-language` / `.language-*` 产品一处都没有。⚠️ 其中**分组折叠**与**行尾语言码**产品已挂起不得实现;剩下待裁决的是「`select` 该不该有独立形态」本身 |
| 7 | clarify | 单选 · 选中一项 | `QuestionForm.tsx:745-753`;`composio.css:985-1012` | 有偏差 | `.qf-chip-on` 仍是 `font-weight: 600`,稿 #7170 改成 **500** |
| 8 | clarify | 多选 · 方钮 | `QuestionForm.tsx:761-784`、`:2476`;`composio.css:847-854` | 有偏差 | ① 计数两段式 G1 本轮已做;② `.qf-picked` 无 `font-size`/`font-weight`,靠继承侥幸对上;③ 🔴 **方钮没做**:`.qf-chip .qf-chip-box` 写死 `border-radius: 50%`,**单选多选共用一条规则、都是圆的**,稿子明确「圆=单选、方=多选」 |
| 9 | clarify | 选中「自己填」 | `QuestionForm.tsx:351-400`;`composio.css:4310-4379` | 有偏差 | `.qf-own-label` 600(稿 500);`.qf-own-input` **显式 400**(稿新增 500),且附了一整段基于旧稿的推理 —— **方向相反,不是差一档** |
| 10 | clarify | 多选勾上「自己填」 | `QuestionForm.tsx:780-782`、`:481` | **已实现** | 语义正确(追加不覆盖);排版缺口同 #8 / #9 |
| 11 | clarify | 颜色选择 | `QuestionForm.tsx:856-867`、`:2262-2345`;`composio.css:1295-1416` | 有偏差 · 主体本轮已做 | 三条路同步 + Hex 校验 + 预览 **G1 已做**。余 3 处:① 选中环 稿写死 `#00FF08` 亮绿,产品用 `var(--selected)` `#353535`(稿子自己的 `--selected` 也是 `#353535` → 说明是**故意**避开 token)→ 待拍板;②「自定义颜色」label 字重少一档(稿子靠 `> legend` 子选择器把 `<label>` 排除在 500 之外);③ 字号硬写 **11px**,稿 12px,而**产品字号梯子最低就是 12px,没有 11px 档** |
| 12 | clarify | Amount Slider | `QuestionForm.tsx:834-845`、`:2397-2470`;`composio.css:1177-1293` | 有偏差 · 主体本轮已做 | 双向同步 + clamp **G1 已做**。余 5 处:① 进度色/滑块色 `#00FF08` → `var(--selected)`(同 #11);② 数字框 `2.4em`,稿 `1.2em`,**宽一倍**;③ 字族 `inherit` vs 稿 `var(--sans)`;④ hover 底 `#ededed`(不透明)vs 稿 `rgba(0,0,0,0.06)`;⑤ 端点字号 11px vs 12px。另两处是**契约缺口不是漏做**:没有单位 schema 所以不渲染「档」,没有端点文案 schema 所以只渲染 min/max 数字 |
| 13 | clarify | 视觉方向 · 待选 | `QuestionForm.tsx:786-807`、`:1157-1290` | **已实现** | 结构 / fan-grid 切换 / 换一批 / 随机 / 共用置灰按钮全部到位;排版缺口继承 #5;确认底色钩子见 §9 拍板 #1 |
| 14 | clarify | 选中一张 | `QuestionForm.tsx:1292`;`composio.css:1577+` | 需量测 | `.qf-visual-*` 一族 160+ 行、两套 `data-view` 排布 + `nth-child` 变换,读 CSS 文本判命中会踩「只 diff 文本」的坑 |
| 15 | clarify | 已回答 · 单选 | `QuestionForm.tsx:660-670`、`:2569`;`composio.css:4211-4298` | **本轮已修复** | 基线缺整块灰底容器;**已由 `9b22818c70` 在盘点窗口内补上**(16px 圆角 + 12px 内距 + `--bg-panel`)。`.answered .ak` 字重 400→500 需复核 |
| 16 | clarify | 已回答 · 多选 | `QuestionForm.tsx:2601-2610` | **本轮已修复** | 同 #15 |
| 17 | clarify | 已回答 · 视觉方向 | `QuestionForm.tsx:2613-2626` | **本轮已修复** | 基线 `mod-visual-answer` 零命中;**已由 `9b22818c70` 补上**(React 侧 `QuestionForm.tsx:2595` 条件类名 + CSS `composio.css:4256`) |
| 18 | clarify | 已回答 · 颜色 | `QuestionForm.tsx:2594-2597`、`:2632-2644` | 有偏差 · 主体本轮已做 | 色块 + 规范化 Hex + 旧值不改写 G1 已做;产品另加 `.color-answer b { font-family: var(--mono) }`,稿子无此条 → 待确认 |
| 19 | clarify | 已回答 · 数值 | `QuestionForm.tsx:2723-2726`、`:2594-2610` | 有偏差 | `mod-value` **只在有 swatch(颜色)时才加**,数值答案拿不到 → 少了垂直居中。稿子这两格都带 `mod-value` |
| 20 | memory | 收起 | `OdCard.tsx:238-256`;`OdCard.module.css:128-186` | 有偏差 | 结构 / 书签 path / `#00ff04` 只染图标 / 16px 外壳全部一致。**唯一缺口:summary 没有 hover 底色**(稿 `.fold > summary:hover { background: var(--bg-fill-tertiary) }`) |
| 21 | memory | 展开 | `OdCard.tsx:257-274`;`OdCard.module.css:160-178` | **已实现** | 逐条一致 |

### 7.3 OPEND-2198 产出收尾(组件 13 / 14 / 15 / 16 / 24,17 格)

| # | design id | 状态 | 实现位置 | 判定 | 缺口 |
|---|---|---|---|---|---|
| 13-1 | summary-copy | 生成中 · 逐字流式 | `AssistantMessage.tsx:3089-3142`;`useCharReveal.ts:133`;`chat.css:3642-3652` | **已实现** | 无功能缺口。产品多一条稿子没有的 `REVEAL_BUDGET_MS = 2000` 总预算 → 已裁决,见 §5 |
| 13-2 | summary-copy | 结束 · 输出完成 | `code.css:997-1005`;`routines.css:1782-1789` | **已实现** | 排版逐条对上。唯一多出来的是 `routines.css:1784` 的 `max-width: 68ch`,稿子无宽度上限 → M16 |
| 14-1 | artifact | 默认 · 卡面只有图 | `FileOpsSummary.tsx:451-628`;`tools.css:66-289` | **已实现** | 骨架逐条对上。`doc` 档写文件名是 2026-08-26 产品裁决 → §5 |
| 14-2 | artifact | HTML · 发布 / 导出 | `FileOpsSummary.tsx:505`、`:577-606` | **已实现** | 导出 svg 的 `d` 与设计 HTML 一字不差;「发布」补图标是 OPEND-2559 裁决 |
| 14-3 | artifact | 非 HTML · 只剩导出 | `FileOpsSummary.tsx:607-623` | **已实现** | 无 |
| 14-4 | artifact | 视频 · 卡面不压东西 | `FileOpsSummary.tsx:512`、`:545-552`;`tools.css:162-179` | **已实现** | 无 |
| 15-1 | feedback | 默认 · 状态 + 图标组 + 时间 | `AssistantMessage.tsx:2131-2245`;`theater.css:298-416`、`:1700-1741` | 🔴 **有偏差** | ① **静音色没跟**:`theater.css:337` / `:393` 仍是 `var(--text-soft)` = **#848484**,稿子 `#a3a3a3`;② **hover 仍在跳档**:`theater.css:363` / `:404` 是 `--text-strong` = **#202020**,稿子新版 hover **不变深**。产品**已有** `--chat-message-muted-ink: #a3a3a3`(`chat.css:566`),只是**这两个选择器没消费它**。③ 整行 `opacity:0` 门控是 OPEND-2542 裁决 → §5 |
| 15-2 | feedback | hover · Tooltip | `AssistantMessage.tsx:2267-2271` 等;`primitives.css:136-164` | 有偏差 | 气泡是**另一套材质**:圆角 4px vs 稿 8px、内距 `5px 8px` vs `5px 9px`、行高 1.2 vs 1.4、磨砂 vs 实底。⚠️ `.od-tooltip-layer` 是**全应用共享 primitive**,按稿改会外溢到 chat 之外 → 待拍板 |
| 15-3 | feedback | 踩被选中 · 用红 | `AssistantMessage.tsx:2650`;`theater.css:413-416` | **已实现** | 无 |
| 15-4 | feedback | 已选 · 图标变填充 | `AssistantMessage.tsx:2620-2626`;`theater.css:406-411` | **已实现** | 「图标变填充」**稿子自己没实现** —— 默认态与 `.is-on` 态两枚 button 内层做 md5 比对完全相同,只换底色与字色。**不需要再做一版 fill 图标** |
| 15-5 | feedback | 点过「新开会话」 | `AssistantMessage.tsx:1543-1557`;`chat.css:3803-3844` | 有偏差 | 静态形态逐条对上。**缺入场动画**:稿子的 `@keyframes fork-in` + `.is-new` 产品**零命中**(已复核),点完那一下「落」的动作完全没有。稿子展示格挂的是 `.is-pinned`(已落好),静态截图对照**看不出这条** |
| 15-6 | feedback | 这轮被中断 | `AssistantMessage.tsx:2011-2036`、`:2167-2184` | **已实现** | 无 |
| 15-7 | feedback | 反馈弹窗 | `AssistantMessage.tsx:4324-4409`;`theater.css:507-596` | **已实现** | 逐条对上(含共享 `Button size="sm"` 的 `4px 11px` / 12px / 600 / pill);特异性是手算的 → M17 |
| 16-1 | next-steps | 默认 · 3 条建议 | `NextStepActions.tsx:723-752`;`NextStepActions.module.css:9-105` | **已实现** | 无。箭头 path 与设计 HTML 逐字相同;`font-weight: 500` G6 本轮已补;点击填草稿不发送,与 cmp-ops 一致 |
| 16-2 | next-steps | hover · 只高亮被指那条 | `NextStepActions.module.css:97-121` | **已实现** | 规则在且同值;层叠待量(M12) |
| 24-1 | audio | 默认 · 停着 | `AudioArtifact.tsx:83-121`;`AudioArtifact.module.css` | 有偏差 | ① 🔴 **播放键放错层**:稿子 `.aud-b` 在白行**里面**,产品 `.play` 是 `.inner` 的**兄弟**,落在外层灰底上 → 白行右端少约 29px;② 第二枚键语义换成下载 → 已裁决 §5;③ 默认条数 40,稿子 28;④ 多条音频之间**没有任何间距**(`.file-ops-audio` 在全仓 CSS 里零声明) |
| 24-2 | audio | 播放中 · 波形起伏 | `AudioArtifact.tsx:53`、`:94`;`AudioArtifact.module.css:81-83` | 有偏差 | 「已播那截变实」**有**。**「波形跟着起伏」整条缺失**(已复核 `wave-pulse` 零命中):稿子的 `@keyframes wave-pulse` + 逐根 `18ms` 错开 + `prefers-reduced-motion` 全无,且 `AudioArtifact.tsx:95` **从不写 `--i`**,补了 keyframes 也无从错开。`data-playing` 属性**已经在打** |

### 7.4 OPEND-2199 输入(组件 1 / 2 / 21 / 23,25 格)

| # | design id | 状态 | 实现位置 | 判定 | 缺口 |
|---|---|---|---|---|---|
| 45 | msg-text | 成功 · 发送完成 | `ChatPane.tsx:5690`、`:5834`;`chat.css:576/589/610` | 需量测 | 静态读全对(`#121212` / 500 / 12-12-4-12 / 9×13 / 380)。G5 已交付,待复验 |
| 46 | msg-text | 超长 · 折 6 行 | `ChatPane.tsx:5834`、`:5884`;`chat.css:626/645` | 需量测 | 结构 / 渐变 / `is-cut` 全对;6 行实际截断位置要真行高 |
| 47 | msg-text | hover · 「…」后浮箭头 | 同 #46 | **已实现** | **稿子自相矛盾,产品选对了那一边**:新 `components.css:373-390` 已把那枚 hover 箭头**整条删掉**,`.bub.mod-clamp` 全文无 `.is-hover` 规则。st-l 标题与 cmp-ops 是旧稿残留 |
| 48 | msg-text | 长链接断行 | `chat.css:589`(`overflow-wrap: anywhere`) | **已实现** | 无 |
| 49 | msg-text | 失败 · 网络异常 | `ChatPane.tsx:5804-5845`;`chat.css:1036/3760` | 🔴 **有偏差(功能性回归)** | **失败时屏幕上什么都不出,要 hover 才看得见。** `.msg.user .user-actions { opacity: 0 }` 只在 `:hover / :focus-within` 拉到 1,**父级 opacity 无法被子级撤销**,重试按钮一并被藏。稿子对应规则是 `.msg-act .tm, .msg-act button:not(.keep) { opacity: 0 }` —— **`.keep` 明确排除在外**。⚠️ `ChatPane.tsx:5831-5833` 的注释写的正是「重试常驻」,**代码意图与 CSS 互相打架** |
| 50 | msg-text | hover · 时间复制浮出 | `ChatPane.tsx:5786-5816`;`chat.css:1036/1060/1067` | 有偏差 | 「重试常驻」同 #49。「背景加深」已裁决不做 → §5。DOM 顺序正确 |
| 51 | msg-text | hover · 多行同理 | 同 #50 | 有偏差 | 同 #49 |
| 52 | msg-att | 发送后 · 只有缩略图 | `ChatPane.tsx:5927/5968`;`chat.css:3142/3167` | 需量测 | 静态读全对(57px 方 / 1:1 / 12px 圆角 / 不挂文件名)。占位少一层 OD logo 底图(稿 `components.css:786`),仅在图 404 时可见 |
| 53 | msg-att | 文字 + 附件 | `ChatPane.tsx:5776`;`chat.css:527/610` | **已实现** | 412 / 380 两条上限各管各的,逐条一致 |
| 54 | msg-att | 失败 · 重试 | **未找到实现** | 🔴 **缺失** | `UserAttachmentRow` 完全没有失败态:不算 `stateClass`、不渲染 `.msg-att-rt`。已复核 `msg-att-rt` **只在托盘侧**(`ChatComposer.tsx:4537`)存在 |
| 55 | msg-att | hover · 浮出预览 | `ChatPane.tsx:5984`;`chat.css:3795` | 需量测 | 角标像素逐条对上。**点击语义不同**:稿子是弹层大图 + 左右键切换,产品是在编辑器里打开文件 → 待拍板 |
| 56 | msg-att | 文档 · 更宽的卡 | `ChatPane.tsx:6102-6120`;`chat.css:3188-3255` | 需量测 | 像素全对(180 / 9,11 / 9 / 15 / 12 / 1)。等高靠默认 stretch,「57px 严丝合缝」要真渲染 |
| 56b | msg-att | 卡型路由依据 | `ChatPane.tsx:5966`;`registry.ts:3248` | 🔴 有偏差 | 稿子按「**能不能渲染出预览**」,点名 `pdf` 首页 / `mov` 首帧 / `sketch` 走 57px 图卡;产品按**位图扩展名白名单**,于是这三类全掉进 180px 文档卡。是能力问题(缺缩略图管线),不是 CSS |
| 57 | msg-att | 图 + 文档同一行 | `chat.css:3000/3142/3188` | 需量测 | nowrap + stretch 成立;「同高」是布局结果 |
| 58 | msg-att | 多附件 · 单行横滚 | `ChatPane.tsx:5947`、`:6047`;`chat.css:3000-3041` | 需量测 | 静态读已实现且**超出**稿子(翻页箭头 + 四路重量)。切在第 7 张卡腰上要真容器宽度 |
| 59 | msg-att | 文件名中段省略 | `attachment.ts:26-95`;`ChatPane.tsx:6171` | 需量测 | **Plane 单子担心的那件事产品已经做对了**:不是 CSS `text-overflow`,是 canvas `measureText` + 二分,且 `flex:1` 防棘轮。实际断点要真实字体度量 |
| 60 | att-tray | 静止不摆「×」 | `ChatComposer.tsx:4456-4506`;`chat.css:3327-3382` | **已实现** | 逐条对上(逐张出不整排亮 / hover 不变红 / 键盘 focus / 触屏常驻) |
| 61 | att-tray | 上传中 · 进度走描边 | `ChatComposer.tsx:4515`;`chat.css:3400-3435` | 需量测 | 手法与稿子一模一样(`@property` + 双层背景 + 1.4s linear);墨色逐值相同 |
| 62 | att-tray | 文档同在一行 | `ChatComposer.tsx:4636`;`chat.css:3188/3382/3387` | **已实现** | 两侧共用同一份 `.msg-att-doc` 选择器,做到了「卡片不变、状态只由叠加物承担」 |
| 63 | att-tray | 上传失败 | `ChatComposer.tsx:4537`;`chat.css:3446-3474` | **已实现** | 图卡侧逐条对上。**文档长条的失败态稿子没画**,产品自行染红文件名(注释标 S13 待决)—— 是**待补设计**,不是产品缺口 |
| 64 | att-tray | 多到装不下 · 横滚 | `ChatComposer.tsx:4742`;`chat.css:3275` | 需量测 | 托盘靠左 ✓;9px 内距正是稿子算 406px 净内宽那一档 ✓ |
| 65 | selection | 默认 · 浮在选区上方 | `quote-selection.ts:25/49`;`QuoteBar.module.css:12/32` | **本轮已修复** | 基线是「下方优先」,与稿子相反;**盘点窗口内已被另一 agent 在工作树改回「上方优先」**(未提交)。玻璃材质 / 内距 / 字号字重基线就对 |
| 65b | selection | 选区底色 | **未找到实现** | 缺失 | 稿子 `.sel { background: var(--selected-soft) }`,产品**没给聊天正文写任何 `::selection`**,用系统默认蓝。`--selected-soft` 产品**有**(`tokens.css:146`,同值)只是没用。⚠️ `::selection` 拿不到 `border-radius` → 待拍板 |
| 66 | selection | 贴顶 · 翻到下方 | 同 #65 | **本轮已修复** | 同 #65。间隙不对称(上 7 / 下 6)基线是统一 7px,同一笔改动里已补 `QUOTE_BAR_GAP_BELOW_PX = 6` |
| 67 | selection | 输入框多一枚芯片 | `ChatComposer.tsx:3527`;`QuotedRefs.module.css:8-52` | **已实现** | 逐条对上,含稿子那两个坑(`.del` 本体样式搬全、`align-self:flex-start` 解块化) |
| 67b | selection | 两套注释芯片并存 | `ChatComposer.tsx:3512` 与 `:3527` | 待拍板 | `StagedCommentAttachments`(iframe 元素批注)与 `QuotedRefs`(正文选区引用)**同时挂在输入框上方**,稿子只画了后者 |
| 68 | selection | hover 芯片 · 浮出全文 | `QuotedRefs.module.css:93-148` | 需量测 | 逐值对上,且比稿子**多做对一件事**:稿子 `.refs:hover .pop` 忘了恢复 `pointer-events`,产品补了 |
| 69 | selection | 选了好几段 | `QuotedRefs.tsx:88`;`QuotedRefs.module.css:93` | **已实现** | 一枚芯片装全部引用,序号用 `counter(r)` 不是文本 |

### 7.5 OPEND-2200 边界(组件 6 / 17 / 18 / 19 / 20 / 22,15 格)

| # | design id | 状态 | 实现位置 | 判定 | 缺口 |
|---|---|---|---|---|---|
| 1 | plan-card | 执行中 · 逐条打勾 | 无对位实现;最接近 `ExecutionShell.tsx:403-421` `PlanRow` | 有偏差(结构级) | 稿子是一张独立 `.card`(卡头 orb + 计数 N/M + 白底 `<ol class="steps">` + 148px 限高滚动);产品是执行记录里的一只 `Foldable`,三样都没有。⚠️ `PlanPill.tsx:17` 记「展开态那张独立卡拍板不做(D33 / S9)」—— **需确认这条裁决是否覆盖本格** |
| 2 | plan-card | 收起 · 第 N/M 步 | `PlanPill.tsx:87-133`;`PlanPill.module.css:17-136` | 有偏差 | ① `.pill` 与 `.steps li.now` 用 `--chat-text-strong` `#202020`,稿 `--plan-current-text` `#353535`;② 稿新增 `.steps li { font-weight: 400 }` 产品没写;③ 非当前那几档的灰**已由并行 agent 本轮改对**(`--chat-text-soft` = `#848484` = 稿 `--plan-other-text`),待复验 |
| 3 | queue | 排队中 | `ChatPane.tsx:5071-5296`;`chat.css` **两段**:2265-2530 与 3492-3660 | 有偏差 + 需量测 | ① 行结构已对;② steer 标签本轮刚补,但**图标仍是 `arrow-up`**,稿子是「箭头进竖线」的回车/插入形 —— 这是 #7170 之前的旧缺口;~~③ 产品多一档「首行高亮」`.chat-queued-send-row-active`,稿子没有;~~ **③ 2026-09-02 已按稿清掉**(规则先删、类名跟着删)。判据是稿子 `361b78253e:docs/design/chat-panel/src/components.css:2898` 的 `.queue .q:first-child { border-top: none }` —— 这是首行在整份稿子里**唯一**的一条处理,没有首行底色,所以「待设计定」这句话已经有答案。护栏:`tests/components/chat/queue-draft-alignment.test.tsx`(逐值对稿)+ `queue-dead-rules.test.tsx`(类名全树已清 + 就算挂回来也不会多出高亮);④ 队列外框已裁决保留;⑤ 两段选择器块的层叠归属 → Q-1~Q-7 |
| 4 | queue | 条数多 · 限高滚动 | `chat.css:3550-3557` | 需量测 | `.chat-queued-send-list` 在 `:2285`(`min(31vh,168px)` + flex)和 `:3550`(`122px` + block)**各写一遍、同特异度**,只靠源码顺序决胜。另 `.is-scrollable` 那条渐隐**是死码**(队列上从来没加过这个类) |
| 5 | queue | 出队 · 变普通消息 | `ProjectView.tsx:9635-9679`、`:7209` | **已实现** | 无 |
| 6 | upgrade | 额度不足 · < 5 美金 | `UpgradeCard.tsx:64-95`;`UpgradeCard.module.css:30-191` | **已实现**(待复验) | 逐条对上,含星芒 SVG data URI 与稿**逐字节相同**、`.amount b` 用新值 `#f49624`(不是旧的 `#f8672f`)。唯一形态差:稿挂 `.up.mod-glow::after`,产品挂 `.up::after` 无条件出 —— 等价 |
| 7 | upgrade | 额度耗尽 · = 0 | `UpgradeCard.tsx:66/71`;`UpgradeCard.module.css:118-120` | **已实现** | 无 |
| 8 | upgrade | 点 Upgrade 后 | `amr-balance-branch.ts:123-129`;`ProjectView.tsx:2701-2740` | 有偏差(已裁决) | 四支身份判据齐全,但落点是 **2 弹窗 + 2 外跳**,稿子是四支全弹窗。2026-08-26 裁决覆盖设计 → §5 |
| 9 | error | 通用错误 | `RunErrorCard.tsx:88-117`;`RunErrorCard.module.css:10-143` | **已实现** | 形态逐条对上(16px 圆角已改)。唯一文案差:稿子把「联系支持」缩成「联系」→ §9 拍板 |
| 10 | error | 特殊错误 · CLI / BYOK | 拆成两块:`RunErrorCard` + `AmrGuidance.tsx:76-107` | 有偏差(结构级) | 稿子是**一张 `.errb`**(标题 + 说明 + 靠右两颗〔导出日志〕〔切换到 Cloud〕);产品的 `switch-to-cloud` 被 `hasSelfContainedRecovery` 判为「本卡画不出恢复按钮」,出口落到**第二张卡**上。另 `ChatPane.tsx:3663-3670` 那颗 CTA 是「使用本机 CLI」,**方向和稿子相反** |
| 11 | error | 联系支持 · 全局弹窗 | `SupportDialog.tsx:32-99`;`SupportDialog.module.css` | **已实现** | 逐条对上(16px 圆角已跟进;portal 时自带 `chatSeam()`,接缝变量不会丢) |
| 12 | paused | 默认 · 一句话 | `PauseLine.tsx:25-34`;`PauseLine.module.css:7-20` | **缺失(接线)** | 组件本身与稿子逐条一致(已复核),**但产品里从没被渲染过** —— `git grep PauseLine` 只命中它自己 + 一句注释。`ChatPane.tsx:3912-3921` 注释写明这是**有意的**:run 的 `canceled/user_stop` 由 footer 报「已手动停止」,不能冒充暂停;真正的 paused-task 领域事实**还没有数据源**。缺的是「谁来挂它」,不是组件 |
| 13 | reconnect | 重连中 · 第几次/共几次 | `Reconnect.tsx:111-134`;`Reconnect.module.css:19-108` | 有偏差(有意) | 稿子行尾那颗 ⌄ 详情箭头**产品不出**:`onShowDetail` 没传。`Reconnect.tsx:58-64` 写明理由(今天传输层分不出断因,摆一颗点开什么都没有的箭头更糟)。是**组件自己的判断,不是产品裁决** → 建议补一条正式裁决 |
| 14 | reconnect | 最后一次 · 5/5 | `Reconnect.tsx:96/109` | **已实现** | 稿子这一格「不换任何样式」,产品确实不换。`showCount = max > 1` 是产品补的(agent-retry 预算是 1,写「1/1」没信息量) |
| 15 | reconnect | 重连失败 · 交回给人 | `Reconnect.tsx:78-92/142-147`;`Reconnect.module.css:80-85` | **已实现** | 无。**没有**红边红底 —— 稿子里 `.tool:has(.wifi)` 排在 `.tool.is-fail` 之后把边底压掉了,产品直接不写,结果一致 |

---

## 8. 浏览器量测工单(调度者照单量,不用回头问)

盘点全程**没开浏览器**(内存约束),所以下面这批是本文档最需要人接手的部分。每条给「量哪个选择器 · 量哪个属性 · 期望值 · 为什么读代码判不了」。

**统一前提**:真实运行时 + `getComputedStyle` 读**最终计算值**;面板宽度按稿子基准 **460px**(输入框净内宽 406px);`:has()` / 深色相关的项要**切深色主题再量一次**。

### 8.1 最高优先(量出来就是缺口证据,不是复验)

| id | 选择器 | 属性 | 期望 / 预期实测 | 为什么必须量 |
|---|---|---|---|---|
| **B1** | `.msg.user .user-keep-btn` 的**父级** `.user-actions`,**不 hover** 时 | `opacity` | 稿子 `1`(重试常驻);**预期量到 `0`** | 需要一张截图坐实「消息发失败了,屏幕上什么都没有」。先造一条 `sendFailed` 用户消息 |
| **B2** | `.assistant-copy-button` / `.assistant-feedback-button`(静止) | `color` | 稿子 `rgb(163,163,163)`;**预期量到 `rgb(132,132,132)`** | 这一行被 4 层碰过(`composio.css:4126` / `theater.css:1705` / `routines.css:1796` / `chat.css:3666`),手算不算数 |
| **B3** | 同上 `:hover` | `color` | 稿子**保持** `rgb(163,163,163)`;**预期量到 `rgb(32,32,32)`** | hover 态还要跟 `primitives.css` 的 `button:hover:not(:disabled)`(0,2,1)比一次 |
| **B4** | `[data-testid="chat-audio-artifact"][data-playing] .wave > i` | `animation-name` / `animation-delay` | 稿子 `wave-pulse` / `calc(var(--i) * 18ms)`;**预期 `none` / `0s`** | 确认缺口,不是确认对齐 |
| **B5** | 音频白行 `.inner` 与播放键各自的 `getBoundingClientRect()` | 播放键矩形是否落在白行**内部** | 稿子在内部;**预期在外部** | 结构层级问题,读 CSS 看不出 |
| **B6** | `.chat-queued-send-list` | `display` / `max-height` / `padding-right` | `block` / `122px` / `0px`;量到 `flex` 或 `168px` = **前块赢了,稿子的三行半限高整个没生效** | 同名选择器在 `chat.css:2285` 与 `:3550` **各写一遍、同特异度**,纯源码顺序决胜 |
| **B7** | `.chat-queued-send-action-steer` | `width` / `padding` / `white-space` | `auto` / `0px 4px` / `nowrap`;**量到 `22px` = 排在 `:3621` 之前,steer 标签会被裁掉一大半** | 被 `:2441` 的 `16px` 与 `:3621` 的 `22px` 双重夹击 |
| **B8** | `.qf-options[role="group"] .qf-chip .qf-chip-box` | `border-radius` | 多选应为**方角**;单选 `50%` | 产品只有一条 `border-radius: 50%`,单选多选共用 —— 需确认全仓没有按 `role=group` 覆盖 |

### 8.2 执行记录三级排版(缺口 D 的证据)

| id | 选择器 | 属性 | 期望 | 为什么读代码判不了 |
|---|---|---|---|---|
| E1 | `.fold.flat > .body.stack > .think`(壳内**第一段**) | `font-size` / `color` | `13px` / `rgb(32,32,32)` | `:has(> .fold)` 命中与否取决于真实数据里步骤是 `details.fold` 还是 `div.tool`;两条规则**同值**,读文本永远看不出有没有命中。**要构造一个「顶层全是 `div.tool`」的壳** |
| E2 | `.fold.flat > .body.stack > .fold > summary` | `font-size` / `font-weight` | `13px` / `500` | 产品 DOM 在 summary 与标题 span 之间**多插了一层 `.summaryContent`**,继承是否被截断、`.shimmer` 会不会在「进行中」那格覆盖,只有真渲染看得出 |
| E3 | `.fold.flat:not(.hasTodo) > .body.stack > :is(.fold,.tool) ~ .think:has(~ :is(.fold,.tool))` | `font-size` / `color` / `padding-inline-start` | `12px` / `rgb(163,163,163)` / `22px` | **必须量两种壳各一次**:(a) 无 plan/todo → 期望命中;(b) **有 plan 的壳(= 陈列页第 2 格)→ 现在必然不命中,量出来会是 13px + `#202020`**。这一读数就是缺口 D 的证据 |
| E4 | 同一只壳里同时截三段 | 视觉层次 | 开场白最深最大 → 步骤标题同大但 500 → 小结小一号且最浅 | 三条各自「对」不等于三档拉得开。PR #7170 换掉的正是「靠字重」→「靠字号」这个方案本身 |
| E5 | `.fold .body.stack .code > .term.cmd` / `… + .term` | `padding-bottom` / `padding-top` | 各 `4px`(合 8px);**预期各 `7px`(合 14px)** | `.term` 的 padding 被三条规则叠 |

### 8.3 其余(按组件归类,共 40+ 条)

**组件 1 / 2 / 21 / 23(输入)** —— 气泡 `background-color` `#121212` 与 `font-weight` `500`(两级变量 + 暗色分支);时间/复制 `color` `#a3a3a3` 及 hover 不变深;`-webkit-line-clamp` 实际截断 6 行且第 7 行不从 9px 下内距露半条字;`.user-text-more` 渐变终点色是否解析成 `#121212`(回落会露色差);图卡 `57×57`、文档卡 `180×57` **且两者等高**(靠默认 stretch,`align-items` 三处都没声明);7 张图卡时 `clientWidth = 412` 且第 7 张切在**腰上**;翻页箭头在行首/行中/行尾三态的 `display`;文件名中段省略的**实际断点文本**(canvas `measureText` + 二分,jsdom 里量不到会原样返回);托盘「×」逐张出不整排亮;上传流光只在 1px 描边区跑;失败重试竖排能否塞进 57px;托盘 `clientWidth ≈ 406` 且溢出成立;`::selection` 底色(**预期是系统默认蓝**)。

**组件 5 / 8(意图澄清 / 记忆)** —— 卡头 `font-size` `14px`;卡头标题有选项卡 `500` / 无选项卡 `600`;`.qf-label` `font-weight` `500`(产品**没有声明**,值来自继承链);`.qf-chip-on` `500`(产品写 600,但 `.qf-chip` 又写 400,同特异性靠源序决胜);`.qf-own-label` / `.qf-own-input` 都 `500`;色块选中环 `box-shadow`(`#00FF08` vs `#353535`);「自定义颜色」label `600`(稿子靠 `> legend` 子选择器把 `<label>` 排除在 500 之外);色值/滑杆一族 `font-size` `12px`(产品硬写 **11px**,而**产品字号梯子最低就是 12px,没有 11px 档**);**深色主题下**确认卡底色 `:has(.qf-options)` 是否命中(浅色下两值同色看不出来);`.qf-amount-value` 渲染宽度(稿 `1.2em` vs 产品 `2.4em`);轨道渐变第一个色标;数字框 hover 底(半透明 vs 不透明);视觉方向选中勾圈 `18px/50%/--shadow-sm`;`.answered` 的 `padding/background/border-radius`(**已被 `9b22818c70` 补上,这是复验点**);`.answered .ak` `500`;`.appliedCard > summary:hover` 底色。

**组件 13–16 / 24(产出收尾)** —— 动作胶囊 `backdrop-filter: blur(28px) saturate(1.4)`(⚠️ 祖先链上有 `container-type` 与 `transform`,会**静默作废**磨砂);胶囊 `height`(稿约 22–23px vs 产品写死 28px,OPEND-2560);`.artifact-cards:has(> .artifact-card:only-child)` 是否命中 + `406px`;`object-fit: contain`(同元素上还有两条 `cover`);`.assistant-footer` 的 `display`/`width`/行高 26px(`composio.css:4126` 与 `theater.css:1705` **特异性完全相同**,只靠 index.css 导入顺序取胜);完成态状态词 `#0d5400` + `.dot` `13px` 勾图;中断态状态词 `#5c5c5c`(**量到 `#bdbdbd` 就是回归**,`routines.css:1826-1835` 记着真机上翻过车);Tooltip 气泡的 6 项材质差;`.fork-sep span` / `.fork-note` 两条色;`.suggestionRow` 静止 `500` + hover 三项;`.prose-block` 的 `68ch` 是否真在起作用;反馈面板两颗按钮 6 项。

**组件 6 / 17–20 / 22(边界)** —— 队列两段重复块的 `Q-1`~`Q-7` 全套(`.chat-queued-send-list` / `-row` / `-action` / `-action-steer` / svg 尺寸 / `-strip` / `.is-scrollable` 是否死码);`.count` 与 `.shimmer` 的 `font-weight` 必须**相等**(不等 = `inherit` 不变量被破,是真 bug);`.steps li` `font-weight`;`.pill` / `.steps li.now` `color`(#202020 vs 稿 #353535,**明暗两套各量一次**);`.steps li.done .tx > *` 的收口是否赢过 `.struck`(跨两个 Module 的特异度对决,注入顺序由打包器定);Upgrade CTA 的绿底深字 + `44px` + pill,**hover 时再量一次**(⚠️ 同一副病灶 2026-08-27 真机上发生过一次:**绿从没生效过**);`.up` / `.card` / `.modal` 的 `16px` 回退链(`--chat-radius-2xl` 未定义,全靠回退);星芒 `::after` 的 `isolation` 是否失效(失效会掉到卡外压住上一条消息);SupportDialog portal 后 `--chat-bg` 是否解析(2026-08-27 真机量到过**空串 + 弹窗全透明且不报错**)。

---

## 9. 需要产品拍板,不该由实现方替产品定

| # | 事项 | 为什么不能直接实现 | 涉及组件 |
|---|---|---|---|
| 1 | **chat 面基线字重 400 还是 500** | 见 §3.1。不是一处像素,是**所有 `font-weight` 规则的语义参照系**。25 处已落地的 `500` 字面量每一处都可能是反的 | 全部 24 个 |
| 2 | **89 行还是 88 状态** —— 语言下拉是独立产品状态还是既有单选的一种呈现? | 决定验收台账的分母,也决定语言选择器是不是要长期维护的产品能力 | 5 |
| 3 | **`select` 该不该有独立形态** | 分组折叠与语言码已挂起,但「`select` 现在和 `radio` 渲染得一模一样」本身还没被裁决过 —— 是接受(那 `select` 这个类型就没有存在价值),还是要一个不带分组的下拉外壳 | 5 |
| 4 | **亮绿 `#00FF08` 要不要保留** | 稿子在色块选中环与滑杆上**写死** `#00FF08`,而**稿子自己的 `--selected` 也是 `#353535`** —— 说明设计知道有这个 token 却故意没用。产品统一换成了 token。两边都有道理,判不了 | 5 |
| 5 | **`.qf-options` 钩子的作用域** | 稿子的「确认卡底色」对 color / slider / visual 都成立(它们都包在 `.opts.mod-*` 里);产品这三种渲染的是别的类名,钩子不命中。⚠️ **浅色下两个值同色、看不见**,深色下才分叉,而本项目另有「强制明亮色」裁决 —— 是否值得修需产品判 | 5 |
| 6 | **颜色题接受什么形态的值 / 数值题的单位 schema** | 涉及协议宽窄。G1 已按「只收六位小写、alpha 与三位一律拒绝」落地,**这是实现方的选择,需要产品追认或推翻**;「档」「1 · 疏朗」需要 `FormQuestion` 加 `unit` / `minLabel` / `maxLabel` | 5 |
| 7 | **步骤间小结的降档要不要跟着 `:not(.hasTodo)` 一起关掉** | 「缩进不吃」是 2026-08-27 裁决;「字号/墨色降档」是 PR #7170 的新排版,两件事被挂在了同一个选择器上,而**稿子的规范场景恰恰带 plan** | 7 |
| 8 | **组件 11「执行中」要不要做** | 需要 daemon 新增一条工具进度事件(当前 `tool_result` 是终端内容唯一载体),是**跨 daemon/web 的契约新增**,不是前端能自决的 | 11 |
| 9 | **组件 9/10 的「失败」要不要变回可点** | 稿子用 `<button class="why">`;产品留了 `onShowFailure` 口子但全仓无人传。要接需先定「点开之后看到什么」—— 这条在 `ToolRow.tsx:9` 被标为「待设计答」,一直没答 | 9 / 10 |
| 10 | **生图缩略图点开是弹层大图还是文件查看器**;**单张重试为什么要等整轮终态** | 前者产品现有能力有人在用,删掉是**移除一个已有入口**;后者是产品自加的门,稿子没这前提 | 12 |
| 11 | **已发送图卡点击语义**;**附件卡路由依据** | 同上;路由那条稿子按「能不能渲染出预览」(点名 pdf 首页 / mov 首帧 / sketch),产品按位图扩展名白名单 —— 要对齐得先有**缩略图生成管线**(后端能力) | 2 |
| 12 | **两套注释芯片是否合并** | iframe 元素批注与正文选区引用**并存**于输入框上方,稿子只画了后者。已挂待拍板至今未拍 | 23 |
| 13 | **要不要接管系统选中色** | `::selection` 只能对到底色、对不到圆角,而换掉系统选中色是**全局观感**改动 | 23 |
| 14 | **Tooltip 要不要为 chat 面板另开一套** | `.od-tooltip-layer` 是**全应用共享 primitive**,按稿改会外溢到 chat 以外所有 tooltip | 15 |
| 15 | **CLI/BYOK 那一格要不要收成一张卡** | 产品的 rung 阶梯是一套**有文档的设计**,把 switch-to-cloud 放到第二张卡上是那套阶梯的结论,不是疏忽。另外产品那颗 CTA 是「使用本机 CLI」,**方向和稿子相反** | 19 |
| 16 | **Plan 展开卡是否已被裁决不做** | `PlanPill.tsx:17` 记「第 70 格拍板不做(D33 / S9)」,但拿不到 D33 / S9 原文,**无法确认「第 70 格」和 `cmp-plan-card` 第一格是同一格** | 6 |
| 17 | **`--plan-current-text` 要不要跟** | 稿子 `#353535` 写死、**无暗色覆盖**;产品用 `--chat-text-strong`(明 #202020 / 暗 #fafafa)。照稿改会在暗色下变成深灰压深底(不可读) | 6 |
| 18 | **重连行的 ⌄ 详情按钮** | 组件自己判断不出(传输层分不出断因),但**这是组件的判断不是产品裁决** —— 建议补一条正式裁决或进 backlog | 22 |
| 19 | **音频波形要不要真采样** | 当前是按时长哈希的稳定伪采样,契约里没有波形字段。要不要立项让 daemon 出真采样,是产品 + 后端的事 | 24 |
| 20 | **错误卡「联系支持」→「联系」** | 与「从失败处重试→重试」同一类文案裁剪(后者产品**已经就是「重试」**,不需改)。19 个 locale 都要跟 | 19 |
| 21 | **升级卡 CTA 文案 `Upgrade`** | 稿子是单页中文 demo 却在按钮里留了英文,判不出是有意还是遗留 | 18 |
| 22 | **产品多出来 / 稿子没画的几处** | `.answered .color-answer b` 的等宽字族、~~队列首行高亮 `.chat-queued-send-row-active`~~(**2026-09-02 已清**,依据同 §7.5 第 3 格 ③)、文档长条的上传失败态(稿子没画,产品自行染红,注释标 S13 待决) | 5 / 17 / 21 |

---

## 10. 派工建议

### 10.1 分组原则

按 `specs/current/chat-panel-dispatch-2026-09-02.md` 的**文件独占分区**切,不按 Plane 单号切 —— 单号按「用户旅程阶段」分,同一张单里的组件常散在不同文件,不同单的组件反而共用同一个文件。**共用文件的必须同一个 agent 接。**

⚠️ 另有一条来自 `apps/web/src/components/chat/AGENTS.md` §1b 的**硬约束**:`primitives/record.module.css` **一个文件同时拥有** `Foldable` / `ToolRow` / `StatusMark` / `SayText` / `FileButton` 的样式,**刻意不拆**(设计稿里这几个的尺寸互相咬合,缩进由嵌套层数决定)。所以**组件 3 / 4 / 7 / 9 / 10 / 11 / 12 必须归同一个 agent**,跨了 OPEND-2196 和 2197 两张单。

### 10.2 建议包

| 包 | 覆盖组件 | 独占文件 | 现状 | 备注 |
|---|---|---|---|---|
| **P0 · 陈列页补 5 格** | 5(新增的 3 个控件 + 2 个已答态) | `apps/web/tests/components/chat/mirror-gallery.test.tsx` | **无人占用** | **不碰任何产品源码,和所有包零冲突,建议排在最前** —— 先有尺子再改东西 |
| **P1 · 音频** | 24 | `chat/AudioArtifact.tsx`、`AudioArtifact.module.css`、`runtime/chat/audio-wave.ts` | **无人占用** | 本轮**唯一可以立刻并行派出去**的产品代码包。活:`wave-pulse` + `--i` + reduced-motion、播放键回到白行内、`bars` 28、`.file-ops-audio` 补间距 |
| **P2 · 执行记录 + 理解段(合包)** | 3 / 4 / 7 / 9 / 10 / 11 / 12 | `ExecutionShell.tsx`、`primitives/record.module.css`、`Foldable.tsx`、`ToolRow.tsx`、`ImageRow.tsx`、`primitives/contract.ts`、`tests/.../icon-stroke-weight.test.tsx` | **G2 独占中** | 必须等 G2 收口或并进 G2。⚠️ 改工具图标 16px 会让 `icon-stroke-weight.test.tsx` 的基线从 `1.021` 变 `1.167` —— **这不是回归,是必须同步更新的基线** |
| **P3 · QuestionForm(排版 + 已确认块合包)** | 5 | `QuestionForm.tsx`、`styles/viewer/composio.css` | **G1 独占中** | 排版 8 条 + 已确认块 4 条**共用同两个文件,必须合成一包**。⚠️ `.answered` 还有第三个消费者 `AssistantMessage.tsx:3535`(G6 分区),改 CSS 会同时影响它 |
| **P4 · 记忆卡 hover** | 8 | `components/OdCard.module.css` | G3 分区 | **单文件单条规则**,可独立派 |
| **P5 · 反馈行静音色 + Tooltip** | 15 | `styles/viewer/theater.css`(仅 `:298-416` 与 `:1700-1741`) | **G6 独占中** | 静音色改动只有 4 行 `color:`,建议**由 G6 顺手带走** |
| **P6 · 产物卡** | 14 | `FileOpsSummary.tsx`、`styles/viewer/tools.css` | **G3 独占中** | 建议**并进 G3**(它正在用 `tools.css` 做 2559/2560/2547) |
| **P7 · 已发送侧消息 + 附件** | 1 / 2 | `ChatPane.tsx` + `styles/chat.css` 的 4 个区段 | **G7 独占 `ChatPane.tsx`** | 必须先跟 G7 排队。活:🔴 重试常驻、已发送附件失败态、OD logo 占位 |
| **P8 · 托盘 + 选区 + 队列** | 21 / 23 / 17 / 20 | `ChatComposer.tsx`、`QuoteBar.*`、`QuotedRefs.*`、`quote-selection.ts`、`styles/chat.css` | **G5 独占中** | 建议**整体转 G5 续做**。活:队列两段重复块合并、steer 图标、清 5 段死 CSS、PauseLine 接线(⚠️ 还缺领域事实来源) |
| **P9 · Upgrade / 报错 / 重连** | 18 / 19 / 22 | `UpgradeCard.*`、`RunErrorCard.*`、`Reconnect.*`、`SupportDialog.*`、`amr-guidance.ts`、`reconnect-state.ts` | **G4 独占中** | **只剩组件 19 的 CLI/BYOK 一件真活**,其余全部已实现、只需浏览器复验 |
| **P10 · 接缝层收口** | 全部 | `chat/ChatRoot.module.css`、`styles/base.css` | 无人占用,但**与所有包冲突** | 补 `--chat-radius-2xl`、处置 `--chat-upgrade-*` 的陈旧语义、定基线字重。**必须单独一轮,不能和别人并行** |

### 10.3 关键排期约束

1. **P0 先做**(验收工具),P1 可与 P0 并行(唯一无冲突的产品包)。
2. **P2 / P3 / P5 / P6 / P7 / P8 / P9 全部撞在飞的组** —— 不要另派新 agent,把本文档对应小节的结论**转给对应的 G 组续做**。
3. **P10 最后单独一轮** —— 它改的是所有组件的参照系(基线字重),混进任何一包都没法回滚。

---

## 11. 盘点期间的基线漂移与纠正(必读)

本轮盘点跨了约 1 小时,期间**其它组落了 2 个 commit + 若干未提交改动**。下面三条是我**逐条回查代码确认过**的,写在这里免得下一波按过期结论派工。

| 项 | 盘点时(基线 `c5d5a9e621`) | 现在 | 结论 |
|---|---|---|---|
| **`.answered` 灰底容器 + `mod-visual-answer`**(状态 15–19) | 三条声明全无,`mod-visual-answer` 全仓零命中 | **已由 `9b22818c70 fix(chat): let option descriptions wrap and give confirmed answers a surface` 补上**:`composio.css:4248-4258` 有 `--answered-radius: var(--radius-2xl)` / `--answered-padding: 12px` / `padding` / `background: var(--bg-panel)` / `border-radius`,`QuestionForm.tsx:2595` 有条件类名 | **不再是缺口,改为浏览器复验点** |
| **选区浮条默认方向**(状态 65 / 66) | `quoteBarPlacement` 是**下方优先**,docstring 写「默认跟在选区下方」,单测锁 `placement:'below'` | **工作树已改回上方优先**(未提交):`availableAbove >= bar + gapAbove` 先判,docstring 改成「**默认朝上**(稿子 23-1)」,并补了 `QUOTE_BAR_GAP_BELOW_PX = 6` 把上 7 / 下 6 的不对称也做出来了 | **不再是缺口,改为浏览器复验点**。§9 里那条「必须先问清那次翻转在修什么」已由这笔改动自行回答 |
| **思考区滚动窗口** | `record.module.css` 有 96px 定高 + mask,`useThinkingStream.ts` 存在 | **已由 `1626b893df feat(chat): drop the thinking scroll window and collapse finished runs` 落地产品裁决**:`useThinkingStream.ts` 删除、`thinking-stream-tempo.test.ts` 删除、新增 `thinking-stream-window.test.tsx` | 见 §5 冲突 C1。遗留一条:灰底用的是**半透明** `--chat-bg-fill-tertiary`(`rgba(0,0,0,0.03)`),稿子要**不透明** `#FAFAFA`(产品对应 token 是 `--bg-panel`) |

**教训**:并行编队里,「读基线 commit」和「读工作树」会给出**相反的结论**,而且两者都不算错 —— 只是回答了不同的问题。本文档一律以**基线 `c5d5a9e621`** 为准,并在上表单独记录漂移。下一波派工前建议先重跑一遍 `git log --oneline` 与 `git status`。

### 我在合并时纠正掉的一条

我一度按工作树读到「上方优先」,判定 2199 组的浮条结论是错的。**这个判断本身才是错的** —— 那是另一个 agent 的未提交改动。查 `git diff` 才看清:committed 版本确实是下方优先,agent 没报错。**差点把一条正确的发现当成幻觉划掉。**

---

## 12. 本盘点没有做到的事(诚实列出)

1. **一次浏览器都没开、一条测试都没跑**(内存约束)。32 条「已实现」全部是「读到 React 分支 + CSS 规则」的静态结论,**没有一条是实测计算样式**。
2. **特异性判断都是手算的**。`routines.css:1808-1835` 的注释证明这一族选择器**历史上就翻过车**(真机量到的值和手算不一致),所以 §8 里凡是标了「谁赢」的都必须实测。
3. **`.meta` / `.icon` 拆作用域的外溢面没查全**。这两个类在 `record.module.css` 里全局共享,只审计了组件 7/9/10/11/12 的用法,`ThoughtsRow` 和 Plan 也用。
4. **组件 14「选中一张」(视觉方向)没做逐值比对**。那一族 160+ 行、两套 `data-view` 排布 + `nth-child` 变换,读 CSS 文本判命中会踩老坑,整条推到量测。
5. **82 → 84 那 2 格的归因做不到**。手上没有 82 状态那版交付稿,只能确认「+2 早于本 PR」。
6. **G7 的 OPEND-2195 正在改 `build-turn-blocks.ts` 的媒体分支(未提交)**,组件 12 的两格判定可能随之变化。
7. **一个曾经用过又撤掉的启发式**:我试过用「产品文件里 `稿子` 注释的密度」当作「有意对稿程度」的信号,得出 `viewer/tools.css` 零注释的结论。**这是错的** —— 那个文件用英文写注释(`Verbatim port of .arts / .art / .thumb / .acts from …`),对稿非常彻底。该信号已从本文档移除,记在这里免得有人重新发明它。
