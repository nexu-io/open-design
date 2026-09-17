# 流式贴底滚动:开源方案调研与选型

> W7 · 2026-09-02 · 调研文档,不含产品代码改动。
> 结论面向两处:主对话流水(`ChatPane.tsx`)和思考区(`ExecutionShell.tsx` → `Foldable` → `.body.scroll`)。

---

## 1. 一句话建议

**不引库。把 `ChatPane` 现有的贴底状态机抽成 `useFollowBottom` 复用 hook,并按 shadcn `MessageScroller` 和 HuggingFace `chat-ui` 补三处判据(手势意图信号、程序滚动标记 + `scrollend`、恢复侧的快捷通道);思考区复用同一个 hook。**

理由,三条:

1. **我们已经不落后了。** 现在的 `stick-to-bottom.ts` 就是 `use-stick-to-bottom` 状态机的移植(文件里写了出处),而 `ChatPane` 在它之上多做了四件那个库至今没做的事:观察滚动容器自己(该库 issue #40,修复 PR #43 挂着未合)、touch 逃逸路径(issue #9,维护者明说没测过 iOS)、把 scroll 事件的 setState 收成「值不变就原地返回」(issue #14,修复 PR #44 挂着未合)、8px 容差(该库主干仍是硬编码 1px,修复 PR #33 挂着未合)。**换成它是净回退。**
2. **换成更好的那个(shadcn `MessageScroller`)代价过大。** 它确实工程更完整,但它是一整套组件树(`Provider → MessageScroller → Viewport → Content → Item`),接管 DOM 结构和渲染。而 `.chat-log` 上压着我们自己的东西:超过 80 条走**自研虚拟化**(`useMeasuredVirtualWindow`)、anchor-to-top + 尾部占位块、question-form 定位、选区暂停、切会话位置保存。接它等于重写整个消息列表。
3. **真正缺的东西是判据,不是代码量。** 下面第 6 节列的 8 处差距,总共大约 80 行,自己补比换地基便宜一个数量级,而且每一条都能写成红测。

⚠️ **一个前置冲突必须先拍板,见第 2 节。**

---

## 2. 前置冲突:思考区到底要不要自动跟随

W7 任务书的前提是「思考区是第二处需要贴底跟随的地方」。但仓库里记录的产品裁决**和这个前提相反**:

- `specs/current/chat-panel-dispatch-2026-09-02.md` §产品裁决 1:
  > 先不要这个滚动的了,这里文本就和外面普通文本一样有个流式的效果就行,不要这个滚动效果了,**滚动太慢了,也很难看清**
- 随后用户澄清:「但我记得 thinking 下面文本不是有最大高度吗?就跟那个 thinking 完成后的展示那样,有最大高度」
- `record.module.css:905` 起的注释因此把三个维度分开记成:高度 ✓`max-height`、**滚动 ✗自动跟随 ✓普通滚动条用户自己滚**、遮罩 ✗
- 同一份 dispatch 的「待拍板清单」第 6 条仍然开着:「去掉滚动窗口后长思考无限撑长执行记录怎么办 …… 不许用 max-height 把滚动从侧门放回来」

**现状的实际后果**(读码确认,`ExecutionShell.tsx:402` 传 `scroll`,`record.module.css:1007` 是 `max-height:96px; overflow-y:auto`):**进行中和已完成两态都是 96px 限高 + 原生滚动条 + 零跟随**。也就是说流式期间,思考框永远停在推理的**头 5 行**,新落下的字全在折线以下,用户不动手就看不见。真实数据 42,397 字符/轮。

这几乎不可能是想要的,所以任务书的前提大概率是一次**更新的口头反转**。但它和白纸黑字的裁决冲突,所以:

> **落地前必须向产品确认一句:「思考框要不要自动跟到最新一行?」**
> 被否决的是「**定高 + 分步慢速滚 + 上下渐隐遮罩**」(`useThinkingStream.ts`,已于 `1626b893df` 删除)。
> 经典的「瞬时贴底 + 逃逸 + 恢复」是**另一件事**,业界(VS Code Copilot Chat、Lobe Chat)在同样的固定高度推理框里用的就是它,而且都**不带遮罩**。

本文档的结论对两种裁决都有效:要跟随,用第 7 节的 hook;不要跟随,第 6 节主流水那部分的差距仍然全部成立。

---

## 3. 候选库对比表

数据来源:npm registry API / bundlephobia API / GitHub API / 直接读 `raw.githubusercontent.com` 源码,均为 2026-09-02 实测。

| 库 | 版本 / 最近发布 | 许可 | 周下载 | 体积 (min / gzip) | React 18 | 形态 | 判定 |
|---|---|---|---|---|---|---|---|
| `use-stick-to-bottom` | 1.1.6 / 2026-06-04 | MIT | 3,665,283 | 6.8 KB / **2.5 KB** | peer `^16‖^17‖^18‖^19` ✓ | hook + `<StickToBottom>`;需 `scrollRef` + `contentRef`(**内容必须再包一层 div**) | **不引**。见 §3.1 |
| `react-scroll-to-bottom` | 4.2.0 / **2021-10-14** | MIT | 90,484 | 87.7 KB / **26.6 KB** | peer `>=16.8.6`,React 18/19 正式支持未声明 | Context + 13 个 hook | **不引**。5 年未发版;仓库 issue #133「还维护吗」和 #142「推荐换 use-stick-to-bottom」都开着;依赖 core-js + @emotion,体积是前者 10 倍 |
| Vercel `ai-elements` `<Conversation>` | 随 registry 更新(2026-09-01 仍在推) | MIT | — (shadcn 式 registry,非独立包) | 继承 | 主打 React 19 | 5 行薄壳,**内部就是 `use-stick-to-bottom` ^1.1.3** | **不引**。它不是第二套实现,缺陷逐条继承;且无虚拟化(其 issue #103) |
| Vercel AI SDK 本体(`ai` / `@ai-sdk/react`) | — | — | — | — | — | — | **不存在滚动工具**。查过 `packages/ai/package.json` 依赖与全仓代码搜索,零命中。滚动只在 `ai-elements` 里 |
| shadcn `@shadcn/react` `MessageScroller` | 0.3.1 / 2026-08-31 | MIT(仓库许可) | 1,345,199 | 未测 | 未逐条核实 | **整套组件树** `Provider→Scroller→Viewport→Content→Item` + `MessageScrollerButton` | **不引,但抄判据**。工程最完整的一份,见 §3.2 |
| `@assistant-ui/react` | 0.15.17 / 2026-08-27 | MIT | 1,747,194 | 未测 | — | 完整 Thread 框架 | **不引**(整框架),**抄判据**。几何判据我们已经在用了 |
| `react-virtuoso` | 4.18.12 / 2026-08-17 | MIT | 3,458,448 | — / 19.2 KB | ✓ | 虚拟列表 + `followOutput` / `atBottomStateChange` | **不引**。会替掉我们自己的虚拟化。但它的「不在底部的原因」枚举值得抄,见 §3.3 |
| `@virtuoso.dev/message-list` | 1.17.2 / 2026-08-28 | **Commercial** | 35,899 | — | — | 商用聊天虚拟列表 | **排除**。许可不合(本仓 Apache-2.0) |
| `react-infinite-scroll-component` | 7.2.1 / 2026-06-06 | MIT | 1,288,341 | — | ✓ | `inverse` + `column-reverse` | **排除**。解的是「向上翻历史分页」,不是流式跟随;`column-reverse` 本身是可访问性陷阱(见 §5.5) |
| HuggingFace `chat-ui` `stickToBottom.ts` | 非 npm 包(仓库内文件,870 行) | Apache-2.0(未逐条核实) | — | — | Svelte,非 React | 直接读源码 | **不引(不是包),但它是本次调研里工程质量最高的一份**,判据全部值得抄,见 §3.4 |

### 3.1 `use-stick-to-bottom` 为什么仍然不引(逐条核到 issue 号)

现有 `stick-to-bottom.ts` 文件末尾已经论证过一次。这次把每条都核到了当前状态:

| issue | 内容 | 状态(2026-09-02 实测) |
|---|---|---|
| **#9** | iOS 上跟随判据失准、动画慢 | **开着,2024-12-18 至今**。维护者原话:*"since bolt.new doesn't target iOS i haven't yet tweaked all the stuff to work correctly on iOS"*。源码里**根本没有 touch 监听** |
| **#14** | 每个 scroll 事件都 setState → 整棵子树重渲 | **开着**。修复 PR #44(2026-08-16)未合;主干 `handleScroll` 仍无条件调 `setIsAtBottom` / `setEscapedFromLock` |
| **#32** | Safari 85% 缩放下内容「不停跳」 | **开着**。修复 PR #33 未合,内容就是加 `SCROLL_EPSILON_PX = 1` 死区。主干仍是硬编码 `scrollHeight - 1 - clientHeight` |
| **#40** | **滚动容器自身**尺寸变化(输入框长高 / 软键盘 / flex 兄弟)不触发任何信号 | **开着**。修复 PR #43 未合,内容就是补第二个挂在 `scrollRef` 上的 `ResizeObserver` |

其余硬伤:仓库**没有测试套件**(`package.json` 无 `test` 脚本,PR #43 自己在验证栏里写明是手工验证);纯 ESM 且**不带 `"use client"`**(Next.js App Router 需要自己包一层);无 `prefers-reduced-motion`(代码搜索 0 命中);要求内容外再包一层 `contentRef` div,与 `.chat-log` 现在「消息是直接子元素」的 flex 契约(`> .msg:first-of-type { margin-top:auto }` 配平、逐子元素挂 RO、尾部占位块)冲突;自带弹簧(damping 0.7 / stiffness 0.05 / mass 1.25)在快速流式时是**故意落后于真实底部**的,和我们「瞬时贴底」的既定选择相反。

### 3.2 shadcn `MessageScroller`:工程最完整的一份(判据可抄)

2026-06 才进 shadcn 核心(`ui.shadcn.com/docs/changelog/2026-06-chat-components`),仓库 skill 文档写得很直白:*"`MessageScroller` owns scroll behavior. Streaming follow, anchoring, and jump-to-latest are built in. Don't write a `useStickToBottom`/`ResizeObserver` hook."*

亲自 fetch 过 `packages/react/src/message-scroller/types.ts` 和 `components.tsx`,确认到的常量与接线:

```ts
/** Sub-pixel tolerance so edge detection does not flicker across engines that round scrollTop differently. */
DEFAULT_SCROLL_EDGE_THRESHOLD = 8
/** Two fractional scrollTop values within this range are treated as equal, to absorb zoom and HiDPI rounding drift. */
SCROLL_POSITION_EPSILON = 0.5
/** Viewport keys that count as deliberate scroll intent and release follow-bottom. */
USER_SCROLL_KEYS = new Set(["ArrowDown","ArrowUp","End","Home","PageDown","PageUp"," "])
/** How long (ms) data-autoscrolling stays set during a programmatic smooth scroll before clearing. */
AUTOSCROLLING_CLEAR_DELAY = 180
```

接线三处(`components.tsx` 亲验):`onWheel` / `onTouchMove` / `onKeyDown`(键在 `USER_SCROLL_KEYS` 里)**都直接调 `userScrollIntent()`**,不经过 scroll 事件;**两个独立 `ResizeObserver`**,一个挂 viewport、一个挂 content,都用 `requestAnimationFrame` 合并;首帧用 `data-pending-scroll` 属性把视口先藏起来,避免 SSR 转录本闪一下顶部。

**8px 这个数我们和它独立收敛到了同一个值**——这是个不错的旁证。它比我们多的正是第 6 节要补的那几样。

### 3.3 `react-virtuoso`:值得抄的是「为什么不在底部」的分类

`stateFlagsSystem.ts` 把「不在底部」标了原因,而不是一个布尔:

```
NotAtBottomReason = 'NOT_FULLY_SCROLLED_TO_LAST_ITEM_BOTTOM' | 'NOT_SHOWING_LAST_ITEM'
                  | 'SCROLLING_UPWARDS' | 'SIZE_INCREASED' | 'VIEWPORT_HEIGHT_DECREASING'
AtBottomReason    = 'SCROLLED_DOWN' | 'SIZE_DECREASED'
```

`followOutputSystem.ts` 会在 `notAtBottomBecause === 'VIEWPORT_HEIGHT_DECREASING'` 时**主动重新贴底**——也就是它对 `use-stick-to-bottom` issue #40 那类 bug 有一等公民的答案。`atBottomThreshold` 默认 4px,`scrollHeight` 比较用 `approximatelyEqual(a,b) = |a-b| < 1.01`。

### 3.4 HuggingFace `chat-ui`:同类问题里最细的一份

`src/lib/utils/scroll/stickToBottom.ts`(870 行,Svelte,但判据与框架无关):

```ts
const AT_BOTTOM_EPS = 2;
const UNPIN_DRIFT_PX = 3;        // 累计上滚 3px 才算逃逸 —— 过滤亚像素抖动
const GESTURE_CHAIN_MS = 150;    // 一次 wheel/touch 手势的余波仍然算「用户在滚」
const CONTENT_ACTIVITY_MS = 120; // 用来把 Safari 的 scroll 夹取和真实导航分开
const SPRING_TAU_MS = 80;
```

两条别处没有的实证:

- **Safari 会在 DOM 节点交换(流式 markdown、keyed 重渲、hydration)期间同步夹取滚动位置,然后把这次夹取当成 scroll 事件报出来。** 他们用 `MutationObserver` 时间戳 + 上面两个时间窗把它认出来并撤销。
- **iOS 会在触摸 / 惯性期间压制程序发起的平滑滚动,等手势停下再重放。** 所以他们在触屏上发消息时一律用 `instant` 而不是 `smooth`。

浮标用**迟滞**:超过 200px 才出现,回到 60px 以内才收起(我们用的是视口比例 0.75 / 0.5,同一个思路)。

---

## 4. 8 个难点 × 各方案矩阵

「我们」= `apps/web/src/runtime/chat/stick-to-bottom.ts` + `ChatPane.tsx` 当前实现。

| # | 难点 | 我们 | use-stick-to-bottom | shadcn MessageScroller | assistant-ui | react-virtuoso | HF chat-ui | VS Code Copilot Chat |
|---|---|---|---|---|---|---|---|---|
| 1 | 分清程序滚动 / 用户滚动 | ⚠️ 只靠「方向 + `scrollHeight` 未变」+ wheel/touch;**没有程序滚动标记**,3 处 `scrollTo({smooth})` 绕过基线刷新 | ⚠️ `ignoreEscapes` 标记 + 动画期间吞掉 scroll 事件;另加 `setTimeout(…,1)` 把 scroll 推到 RO 之后 | ✅ `data-autoscrolling` 属性 + 180ms 清除;**外加 wheel/touchmove/keydown 三路显式意图** | ✅ `isUserScrollUp` 几何判据 + `isInFlightDownwardScroll` 屏蔽平滑中间帧 + `pointerdown` 取消待执行意图 | ✅ 原因枚举分类 | ✅ 手势时间窗 `GESTURE_CHAIN_MS` + 内容活动窗 | ⚪️ 不需要:每次内容更新前后各测一次几何,不留状态 |
| 2 | 内容增长 / **收缩**不得伪装成用户滚动 | ✅ 严格 `layoutStable`(高度**双向**都要求不变),已有针对「收缩抹掉最后 30px」的红测。⚠️ 但**过严**,见 §6.2 | ⚠️ `resizeDifference` 只在 resize 那一拍 bail;容器收缩不覆盖(#40) | ✅ 双 RO,viewport + content 分开 | ✅ `previous.scrollHeight === current.scrollHeight` | ✅ `SIZE_INCREASED` / `SIZE_DECREASED` / `VIEWPORT_HEIGHT_DECREASING` 三个独立原因 | ✅ 累计漂移 3px 死区 + 内容活动窗 | ✅ `_withPersistedAutoScroll` 把每次 DOM 变更夹在两次几何读之间 |
| 3 | 原生 scroll anchoring 移动 `scrollTop` | ✅ 靠 `layoutStable` 排掉;**刻意不设** `overflow-anchor:none`。⚠️ 残留:上增下减总高不变时会漏 | ✅ 同思路(README 明说不依赖 `overflow-anchor`,因为 Safari 没有) | ⚪️ 无显式处理;改用逐行 `getBoundingClientRect()` 自算几何 | ✅ 同 `scrollHeight` 等值判据 | ⚪️ 未见处理 | ✅ 见 §3.4 的 Safari 夹取实证 | ⚪️ 无(每次都重测) |
| 4 | 底部容差(亚像素 / 缩放 / 取整) | ✅ **8px** | ❌ 硬编码 1px(#32 开着) | ✅ **8px** + 0.5px 相等 epsilon | ✅ `<= 1`(PR #4141 专门把 `< 1` 改成 `<= 1`,因为 retina 上 `devicePixelRatio:2` 会把 `scrollTop` 截少 1px) | ✅ 4px + `< 1.01` | ✅ 2px + 3px 漂移死区 | ✅ 2px(外层)/ 10px(思考框) |
| 5 | 惯性 / 橡皮筋 | ✅ wheel(`deltaY<0`)+ touchmove(下拖 >8px)。❌ 无 keydown;❌ 未处理 iOS 重放平滑滚动 | ❌ 只有 wheel,**零 touch**(#9) | ✅ wheel + touchmove + keydown | ⚪️ 仅 `pointerdown` | ⚪️ 未见 | ✅ 手势时间窗 + 触屏一律 instant | ⚪️ 纯几何,天然免疫 |
| 6 | ResizeObserver 时序 / 基线刷新 | ✅ rAF 里 sync,**落定后同步刷基线**;容器自己也被观察(比 #40 强)。⚠️ scroll 与 RO 同帧先后无保证 | ⚠️ rAF + `setTimeout(1)` 双层延后(引用 WICG/resize-observer#25) | ✅ 双 RO,均 rAF 合并 + 取消前一帧 | ✅ RO + MO,MO 过滤纯 style 属性变更防回环 | ✅ RO 测量,文档明写 `contentRect` 不含 margin 的坑 | ✅ MO 时间戳参与判据 | ✅ `transitionrun`/`transitionend` 参与折叠动画期间的锚定 |
| 7 | 首帧 / 挂载 | ✅ rAF 后 `armFollow` + 瞬时写底;初次定位显式用 `behavior:'auto'` 并写了原因 | ⚠️ 默认走弹簧(ai-elements 还刻意设 `initial="smooth"`,首帧会动) | ✅ `data-pending-scroll` 把视口先藏起来 | ✅ `useLayoutEffect` + `instant`,每 thread 一次 | ✅ | ✅ | ✅ |
| 8 | `prefers-reduced-motion` | ❌ **完全没有**(见 §6.8,有 spec 依据) | ❌ 代码搜索 0 命中 | ❌ 0 命中 | ⚠️ 有,但只在**文字浮现**动画上,滚动本身没有 | ❌ 0 命中 | ⚪️ 未核实 | ⚪️ 未核实 |

补充一列产品语义(第 2 节那张需求表的对照),来自读源码:

| 产品 | 逃逸阈值 | 恢复阈值 | 展开折叠块时 | 推理区独立滚动 |
|---|---|---|---|---|
| VS Code Copilot Chat | 任何离底 >2px | 回到 2px 内 | **不跳底**;把被点开那一行自己的顶边锚住(`UserToggleResizeTracker`),用户中途手动滚就放弃锚定 | ✅ **200px 定高内滚动容器,自己的 10px 判据,瞬时贴底**,`thinkingStyle` 默认就是 `fixedScrolling` |
| LibreChat | wheel `deltaY<0` 立刻,不看距离 | 距底 ≤150px(**恢复比逃逸松**,注释解释:流式时底部是移动靶,滚到头也会差几十像素) | **不跳底**;`pointerdown`/`keydown` 置 `suppressNextResizeFollowRef`,下一次 RO 触发的跟随被吞掉 | — |
| Lobe Chat | 通用 hook 20px;主列表 300px | 通用 hook **不自动恢复**(必须显式 `resetScrollLock()`) | — | ✅ 同一个 hook 的独立实例,`max-height: min(40vh,320px)`,阈值 120px,`enabled` 绑在展开态上 |
| open-webui | 5px | 5px(对称,双向实时) | — | — |
| Chatbot UI | 像素级严格相等 | 严格相等;一轮结束自动复位 | — | — |
| use-stick-to-bottom | 任意上滚 / **有文字选区时的任意滚动** | 任意下滚 + 进入 70px 带 | — | — |
| HF chat-ui | 累计上滚 3px | 进入 60px 带 | — | 刻意**不**贴底跟随:新回合把视图带到该轮**顶部**然后脱开 |

三条跨产品共识,和我们的需求表对照:

1. **展开折叠块时,没有任何一个实现会把外层视图硬拽到底。** 我们 `ChatPane.tsx:3524-3530` 在切换任意 `summary` 时调 `releaseFollow()`,与这条共识一致 —— 需求表里那句「折叠再展开 → 恢复跟随」说的是**思考框自己那只内层滚动条**,不是外层流水。两件事,别混。
2. **逐字跟随一律瞬时写 `scrollTop`,平滑只留给「发消息 / 点浮标」这种一次性大跳。** LibreChat 的原话:每帧纠正读起来像文字往上流,每 145ms 纠正读起来像整条对话在一顿一顿。我们已经是这样。
3. **浮标用迟滞。** 我们已经有(0.75 / 0.5 视口比例)。VS Code 还额外踩过一个坑(issue #326952):浮标可见性**不要**绑在内部的 scroll-lock 上,否则快速流式时视图已经明显落后了,按钮却被藏着。我们因为是瞬时写底,`following` 蕴含「就在底部」,暂时不受影响——但这是一条要记住的不变量。

---

## 5. `scrollend` 事件的可行性结论

### 5.1 支持度:今天已经是 Baseline

| 浏览器 | 版本 |
|---|---|
| Chrome / Edge | 114+(2023) |
| Firefox | 109+(2023) |
| **Safari(macOS + iOS)** | **26.2+** —— WebKit 于 2025-09-11 默认开启,赶上 26.2 车(~2025-12) |

caniuse 全球覆盖 88.55%。这和 2023–2024 年那批「Safari 没有,必须 polyfill」的文章不一样了,**支持度不再是障碍**。降级用 `scrollyfills`(Adam Argyle,原生支持时自动变 no-op)。

### 5.2 但它**不能**替掉核心启发式

规范和实现者都明确过:**`scrollend` 不携带来源信息,而且这是设计取舍,不是待补的窟窿。**

- WICG/overscroll-scrollend-events#4 里,Chrome 的 flackr 明确反对暴露来源:*"I don't think the developer has a good way of knowing whether more scrolling is coming if we sent multiple scrollend events"*,最终定成**一次「滚动交互」只发一个 `scrollend`**。
- 用户滚、`scrollTo()`、`scrollTop=` 三条路发出来的 `scrollend` **完全一样**(Chrome 官方博客明说)。
- 如果一次平滑滚动中途被用户手势打断,你只会在最后拿到**一个** `scrollend`,恢复不出「这里其实有两次滚动」。
- CSSOM-View:滚动位置没变就**不发** `scrollend`(csswg-drafts #8218 讨论过)。这条要小心:我们 `syncFollowState` 里那次「已经在底了再写一次 `scrollTop`」不会产生 `scrollend`,**不能拿它当「我写完了」的唯一回执**。

顺带确认另一条:**`event.isTrusted` 对这个问题没用**。scroll 事件是浏览器自己派发的(不是 `dispatchEvent()`),所以程序触发的 scroll 事件 `isTrusted` 同样是 `true`。DOM 规范里 `isTrusted === false` 的唯一例外是 `HTMLElement.click()`。别指望它。

### 5.3 那它有什么用 —— 两处实打实的位置

1. **给程序滚动标记做「解除」信号。** 我们要引入的 `programmaticUntil` 标记(见 §7),超时兜底是必须的,但有 `scrollend` 时可以**精确**在动画落地那一刻解除并刷新几何基线,不用瞎猜时长。这正好治 §6.1 那个 `behavior:'smooth'` 的洞。
2. **替掉 `ChatPane.tsx:2538-2547` 那个 650ms 手写 debounce**(`markScrolling`)。WebKit 26.2 的发布说明原话就是:*"Previously, developers had to debounce the scroll event with timers."*(顺带:那个 timer 现在驱动的 `is-scrolling` class **全仓没有任何 CSS 消费它**,是死代码——不属于 W7 范围,记一笔。)

### 5.4 降级方案

```
有 scrollend  → 程序滚动标记由 scrollend 精确解除
无 scrollend  → 超时兜底(平滑滚动给一个上界,例如 shadcn 的 180ms;瞬时写入不需要窗口)
```

两条路的**判据完全一样**,`scrollend` 只是让窗口更紧。所以它是纯增强,不构成分叉。

### 5.5 顺带核清的几条平台事实

- **原生 scroll anchoring 的修正会发 `scroll` 事件。** CSS Scroll Anchoring L1 规范原文:*"The scroll adjustment is a type of scrolling as defined by [CSSOM-VIEW], and generates scroll events in the manner described there."* **没有被抑制**。我们靠 `layoutStable` 排掉它是对的做法,但要知道它确实会来敲门。
- **Safari 至今没有实现 scroll anchoring**(WebKit #171099 / #109640 仍开着;caniuse:Safari 全版本 No)。所以 `stick-to-bottom.ts` 注释里那句「Safari 那边上方回流仍然会跳,是浏览器的账」**成立**。(注:任务背景里提到的 WebKit bug 202799 查不到,正确的追踪单是 #171099 和 #109640。)
- **`flex-direction: column-reverse` 是陷阱**,别为了「天然贴底」去动布局:DOM 顺序与视觉顺序分叉,屏幕阅读器 / 键盘顺序与视觉顺序不一致(WCAG「有意义的序列」问题),浏览器查找(Ctrl+F)和文本选择也跟着别扭。正解就是我们现在用的:正常 `column` + 首个子元素 `margin-top:auto`。(另外 `justify-content: flex-end` 会让溢出方向的内容滚不到,浏览器为防数据丢失会强制按 `flex-start` 处理——`.chat-log` 的 CSS 里已经写了这条注释,是对的。)
- **`scroll-initial-target`**(Chrome/Edge 133+,Firefox/Safari 无)可以纯 CSS 让容器首次布局就滚到指定子元素。**只能当渐进增强**,不能替掉首帧 JS。
- **`content-visibility: auto` 与滚动控制器相冲**:任何对该子树的 `scrollHeight` / `getBoundingClientRect()` 读取都会强制同步渲染,而贴底控制器天天读 `scrollHeight`。要一起用必须配 `contain-intrinsic-size`,且只测滚动容器本身。(open-webui 就为此在贴底后补一次 `requestAnimationFrame`。)

---

## 6. 我们现有实现的差距(逐条,附文件行号)

先说结论:**主流水这套在 8 条里有 5 条已经是同行最好那一档**(容差、内容增减、容器观察、首帧、意图/几何分离)。以下是真正的缺口,按严重度排。

### 6.1 【高】程序滚动没有标记,平滑滚动会自己把自己判成用户上滚

判据 `nextFollowIntent` 完全靠「方向 + `scrollHeight` 未变」。这在**我们从不主动向上平滑滚动**的前提下成立——但这条前提**没有写在任何地方,而且已经被违反了**:

- `ChatPane.tsx:3101` `scrollAnchorToTop()` → `el.scrollTo({ top, behavior:'smooth' })`,**向上**。中间帧全是「位置变小 + 高度不变」= 判据眼里的用户上滚。目前只因为 `anchorActiveRef` 恰好为真、`isFollowingTail()` 返回 false 才没出事。
- `ChatPane.tsx:2499` question-form 定位 → `formEl.scrollIntoView({ block:'start', behavior:'smooth' })`,随后用**预测值**设基线(`settleFollowAfterPredictedScroll`)。平滑动画的中间位置全都在预测终点的**另一侧**,于是第一批中间帧就会被判成上滚 → `escaped = true`,流式跟随被自己打断。
  **而同一段逻辑的初次加载版本(`ChatPane.tsx:2383`)已经改成 `behavior:'auto'`,并且注释把原因写得清清楚楚**:「Smooth scrolling emits intermediate scroll events after we have predicted the destination, which makes those frames look like user input」。两处几乎逐字相同的代码,一处修了一处没修。
- `ChatPane.tsx:3114` `jumpToBottom()` 的平滑向下滚,注释论证「中间帧方向都向下所以安全」——**成立,但脆弱**:它同时绕过了 `writeLogScrollTop`,基线整段不刷新。
- `ChatPane.tsx:4428` rail 导航的 `scrollTo({ behavior:'smooth' })` 可上可下,靠调用点先 `releaseFollow()` 兜着。

**业界都不这么赌**:shadcn 用 `data-autoscrolling` + 180ms;assistant-ui 专门加了 `isInFlightDownwardScroll` 并注释*"a smooth scroll-to-bottom fires many midpoint scroll events before landing, don't flicker isAtBottom or clear intent mid-animation"*;`use-stick-to-bottom` 在自己的动画期间直接把 `state.scrollTop` 拨回去吞掉事件。

### 6.2 【高】恢复侧没有手势快捷通道,逃逸侧有 —— 不对称

`layoutStable` 要求 `scrollHeight` 和 `clientHeight` **都**没变。流式期间内容每帧都在长,虚拟化(>80 条走 `useMeasuredVirtualWindow`)重测量也会改 `scrollHeight`。落在这种帧上的用户 scroll 事件会被**整帧丢弃**。

- **逃逸**有兜底:`onWheel`(`deltaY<0`)和 `onTouchMove` 绕开判据直接 `releaseFollow()`。
- **恢复没有任何兜底**。用户滚回底部想重新跟上,必须至少有一个 scroll 事件恰好落在「高度没变」的帧上。快模型 + 虚拟化重测量的组合下,这个窗口可以很窄。
- 现有测试照不出来:`chat-scroll-following.test.tsx`(28 条)的 `userScrollTo()` 只改 `scrollTop`,内容增长都发生在滚动**之后**——**没有任何一条用例模拟「用户滚动事件与内容增长同帧」**。

HF chat-ui 的 `GESTURE_CHAIN_MS = 150` 就是为这个:一次真实手势的余波在 150ms 内都算用户在滚,不再要求布局静止。

### 6.3 【中】没有键盘意图;思考框还多一条没盖的输入路径

`USER_SCROLL_KEYS`(PageUp/PageDown/Home/End/方向键/空格)一条都没监听。主流水 `.chat-log` 设了 `scrollbar-width: none`(`chat.css:252`),所以**拖滚动条这条路不存在**;但键盘还在。

思考框更麻烦:`.fold .body.scroll`(`record.module.css:1007`)**没有隐藏滚动条**(它还专门留了 `padding-inline-end: 4px` 给滚动条让位),所以那里**拖滚动条是真实输入**,而且 wheel / touch / keydown 一条快捷通道都没有——重建时必须一次性补齐。

### 6.4 【中】方向判定是严格不等,没有亚像素死区

```ts
const scrolledUp = next.scrollTop < previous.scrollTop && layoutStable;
```

0.3px 的抖动就构成一次「上滚」。贴底时被 `!isAtBottom(next)` 挡住了,**离底时没有任何东西挡**。`use-stick-to-bottom` issue #32(Safari 85% 缩放下内容不停跳)就是这一类;shadcn 为此专门定义了 `SCROLL_POSITION_EPSILON = 0.5`;HF chat-ui 用的是 `UNPIN_DRIFT_PX = 3` 累计漂移。

### 6.5 【中】`prefers-reduced-motion` 完全没有,而且 CSS 那道全局闸挡不住

`base.css:106` 在 `prefers-reduced-motion: reduce` 下设了 `scroll-behavior: auto !important`。**这对 JS 的 `scrollTo({behavior:'smooth'})` 无效。** CSSOM-View「perform a scroll」第 5 步(已 fetch 规范原文核对):

> If the user agent honors the scroll-behavior property and one of the following is true: behavior is 'auto' and element is not null and its computed value of the scroll-behavior property is smooth, **or behavior is `smooth`** then perform a smooth scroll…

即显式传 `'smooth'` **绕过 CSS**。于是 `jumpToBottom`(3114)、`scrollAnchorToTop`(3101)、question-form(2499)、rail 导航(4428)四处在 reduce 下照旧动画。

这一条业界**全体缺失**(assistant-ui 唯一那处 reduced-motion 是文字浮现动画,不是滚动)。补上是我们能领先的地方,成本约 5 行。

### 6.6 【中】思考区零跟随

`ExecutionShell.tsx:402` 两态都传 `scroll` → `max-height:96px; overflow-y:auto`,**没有任何写 `scrollTop` 的路径**。流式期间就是一扇卡在推理头 5 行的窗。`Foldable` 已经把 `bodyRef` 透出来了(`Foldable.tsx:94`),接入点是现成的。

两个必须处理的细节:

- `Foldable` 用 `<details>` + `deferBody`:折起来时 body 要么没挂载、要么几何为 0。hook 必须在**关闭态整个停掉**,展开时重新 arm(Lobe Chat 的 `enabled: thinking && showDetail` 就是这么做的)。
- **toggle 事件的回声**:`1626b893df` / OPEND-2557 的教训——React 把受控值写回去也会发 `toggle`,不能拿它当「用户点的」。判据是:回声报的永远是我们已经持有的值,真点击报的永远是相反值。

### 6.7 【低】几处不变量没写下来 / 死代码

- 「我们从不主动向上滚」这条不变量没写在任何注释里,却是 §6.1 全部安全性的地基。
- `stick-to-bottom.ts` 导出的 `isNearBottom` / `resolveResumeBand` / `distanceFromBottom` **全仓零消费**(含测试)。那段关于「12% 视口、40–120px 恢复带」的长注释描述的机制**根本没接上**——实际恢复要求的是 8px 内的 `isAtBottom`。要么接上,要么删掉,别留着骗下一个人。ChatPane 里还把 `distanceFromBottom` 的公式又手抄了一遍(`ChatPane.tsx:2973`)。
- `syncFollowState` 里 `if (el.scrollTop !== el.scrollHeight)` 恒为真(`scrollTop` 上限是 `scrollHeight - clientHeight`),是个永不生效的守卫。
- `is-scrolling` class 全仓无 CSS 消费(见 §5.3)。

### 6.8 【低】首帧会闪一下顶部

初次定位在 rAF 里做,首帧渲染出来的是 `scrollTop: 0`。shadcn 用 `data-pending-scroll` 把视口先藏起来;`scroll-initial-target`(Chrome 133+)可作渐进增强。影响面小,记一笔。

---

## 7. 落地建议(自研)

### 7.1 拆两层,保持现在的可测性

```
apps/web/src/runtime/chat/stick-to-bottom.ts     纯判据(已存在,补 §7.3 的两处)
apps/web/src/runtime/chat/use-follow-bottom.ts   新增:DOM 绑定 + 手势 + RO/MO + 程序标记
```

判据层继续保持纯函数(现在 `stick-to-bottom.test.ts` 只有 3 条用例,可以直接扩)。DOM 那层单独一个 hook,主流水和思考框共用。

### 7.2 hook API 形状

```ts
export interface FollowBottomOptions {
  /** 滚动容器 */
  ref: RefObject<HTMLElement | null>;
  /** 整套开关。思考块折起来 / 不在 chat tab 时给 false —— 关闭态几何为 0,不能拿来判 */
  enabled: boolean;
  /**
   * 几何读数。默认 `{scrollTop, max(clientHeight, scrollHeight), clientHeight}`。
   * 主流水要覆盖它:意图判据必须用**不扣预留空白**的真实几何(见 ChatPane readViewportSample 的注释)。
   */
  measure?: (el: HTMLElement) => ScrollSample;
  /** 贴底容差,默认 8(= shadcn DEFAULT_SCROLL_EDGE_THRESHOLD) */
  bottomTolerancePx?: number;
  /** 方向死区,默认 0.5(= shadcn SCROLL_POSITION_EPSILON) */
  directionEpsilonPx?: number;
  /** 手势余波窗,默认 150(= HF chat-ui GESTURE_CHAIN_MS) */
  gestureWindowMs?: number;
  /** 平滑滚动的程序标记上界(没有 scrollend 时的兜底),默认 180(= shadcn AUTOSCROLLING_CLEAR_DELAY) */
  programmaticGuardMs?: number;
  /** 只在跳变时调用,别每个 scroll 事件都调(use-stick-to-bottom issue #14) */
  onFollowChange?: (following: boolean) => void;
}

export interface FollowBottomHandle {
  /** 读当前意图。内部用 ref 存,不驱动渲染 */
  readonly intent: () => FollowIntent;
  /** 显式挂回:点「回到最新」、发消息、切会话、思考块展开 */
  arm(): void;
  /** 显式松开:展开外层折叠块、anchor-to-top 接管、思考块折起 */
  release(): void;
  /** 唯一的滚动写入口。带程序标记 + 自动刷基线 + reduced-motion 降级 */
  scrollToBottom(behavior?: 'instant' | 'smooth'): void;
  /** 任何会改几何的事情之后调一次:把意图落到屏幕上。**它不改意图** */
  sync(): void;
}
```

**保持现在最重要的那条设计**:`sync()` 只负责「把意图落到屏幕」,**绝不修改意图**。意图只由用户动作和显式调用改。`ChatPane.tsx:2957–2972` 那段注释记录了在这里加「已经贴底就重新挂上跟随」当场废掉 wheel 逃逸路径的教训,必须原样带进 hook。

### 7.3 关键判据伪代码(带出处)

```ts
// —— 判据层:两处修改 ——
function nextFollowIntent(current, previous, next, ctx: { gesture: boolean; eps: number }) {
  // (A) 手势余波期内放宽 layoutStable。
  //     出处:HF chat-ui GESTURE_CHAIN_MS=150。
  //     治的是 §6.2:流式每帧都在长高,恢复侧永远等不到一个「布局静止」的帧。
  const layoutStable = ctx.gesture
    || (next.scrollHeight === previous.scrollHeight && next.clientHeight === previous.clientHeight);

  // (B) 方向判定加亚像素死区。
  //     出处:shadcn SCROLL_POSITION_EPSILON=0.5 / HF UNPIN_DRIFT_PX=3。
  //     治的是 §6.4:分数级缩放下 0.3px 抖动被判成上滚(use-stick-to-bottom #32)。
  const dy = next.scrollTop - previous.scrollTop;
  const scrolledUp   = layoutStable && dy < -ctx.eps;
  const scrolledDown = layoutStable && dy >  ctx.eps;

  let { following, escaped } = current;
  if (scrolledUp && !isAtBottom(next))  { escaped = true;  following = false; }
  // 恢复仍然要求「同一次真实下滚 + 真的到底」—— 这条不放松,它挡的是
  // 「距底几十像素时 Plan/queue/composer 高度变化把差距吃掉」那类误恢复。
  if (scrolledDown && isAtBottom(next)) { escaped = false; following = true;  }
  return { following, escaped };
}
```

```ts
// —— 绑定层 ——
let gestureUntil = 0;        // 用户手势余波
let programmaticUntil = 0;   // 我们自己在滚

// 手势意图:三路,都绕开 scroll 事件。
// 出处:shadcn USER_SCROLL_KEYS + onWheel/onTouchMove/onKeyDown。
// 治的是 §6.2(恢复侧无兜底)和 §6.3(键盘/思考框滚动条)。
const USER_SCROLL_KEYS = new Set(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ']);
function noteGesture(upward: boolean) {
  gestureUntil = now() + gestureWindowMs;
  if (upward) release();            // 快速流式时浏览器会整格吃掉这次滚动,不能等 scroll 事件
}
el.onwheel     = e => noteGesture(e.deltaY < 0);
el.ontouchmove = …                  // 手指下拖 >8px = 看更早内容
el.onkeydown   = e => { if (USER_SCROLL_KEYS.has(e.key)) noteGesture(e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home'); };

function onScroll() {
  // 我们自己滚出来的事件整段吞掉,只刷基线。
  // 治的是 §6.1:平滑滚动的中间帧不再能把自己判成用户上滚。
  if (now() < programmaticUntil) { rememberBaseline(); return; }
  const next = measure(el);
  intent = nextFollowIntent(intent, baseline, next, { gesture: now() < gestureUntil, eps });
  baseline = next;
  sync();
}

function scrollToBottom(behavior: 'instant' | 'smooth' = 'instant') {
  // §6.5:显式 'smooth' 绕过 CSS 的 scroll-behavior(CSSOM-View perform a scroll 第 5 步),
  // 所以必须在 JS 里判 reduced-motion,不能指望 base.css 那条 !important。
  const reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const mode = reduce ? 'instant' : behavior;
  programmaticUntil = now() + (mode === 'smooth' ? programmaticGuardMs : 0);
  if (mode === 'smooth') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  else el.scrollTop = el.scrollHeight;
  rememberBaseline();
}

// scrollend:精确解除程序标记。没有它就靠 programmaticGuardMs 超时。
// ⚠️ 位置没变时不会发 scrollend(csswg-drafts #8218),所以超时兜底不能删。
el.addEventListener('scrollend', () => { programmaticUntil = 0; rememberBaseline(); });
```

**流式期间的贴底一律 `'instant'`。** 跨产品共识(§4 第 2 条),而且平滑会吐中间帧——现有代码注释已经吃过这个亏两次。`'smooth'` 只留给「点回到最新」这种一次性大跳。

### 7.4 思考区接线

```tsx
// ExecutionShell.tsx ThoughtsRow
const follow = useFollowBottom({ ref: bodyRef, enabled: live && open });

<Foldable
  scroll
  bodyRef={bodyRef}
  onToggle={(next) => {
    // ⚠️ toggle 回声(OPEND-2557 / 1626b893df):React 把受控值写回也会发 toggle。
    // 回声报的是我们已持有的值,真点击报的是相反值 —— 只认后者。
    if (next === openRef.current) return;
    openRef.current = next;
    next ? follow.arm() : follow.release();   // 需求表:折叠再展开 = 恢复跟随
  }}
>
```

内容增长由挂在 `bodyRef` 上的 `ResizeObserver` 驱动 `follow.sync()`。

**别做的三件事**(都被产品否决过):不要定高(要 `max-height`,短内容不限高)、不要上下渐隐遮罩(「很难看清」)、不要分步慢速滚(「滚动太慢了」)。要的是瞬时贴底——和 VS Code Copilot Chat 的 `fixedScrolling` 模式**除了遮罩之外**同形。

### 7.5 顺手要修的(都在 §6,成本很低)

1. `ChatPane.tsx:2499` 的 `behavior:'smooth'` 改 `'auto'`,和 2383 那条对齐(它的注释已经把理由写好了)。
2. `scrollAnchorToTop` / `jumpToBottom` / rail 导航走统一的 `scrollToBottom` / 程序标记通道。
3. `stick-to-bottom.ts` 的 `isNearBottom` / `resolveResumeBand` / `distanceFromBottom`:接上或删掉,并把 ChatPane 手抄的那份公式换成调用。
4. 把「**我们从不主动向上滚,除非先 release**」写成 `stick-to-bottom.ts` 里的一条显式不变量。

### 7.6 测试补哪些(现有 28 条用例照不出来的)

`chat-scroll-following.test.tsx` 的 `userScrollTo()` 从不同帧改内容高度,所以以下**全部是新的**:

| 用例 | 钉的是 |
|---|---|
| 用户滚动事件与内容增长**同帧**(`scrollTop` 和 `contentHeight` 一起改)后,下滚到底仍能恢复跟随 | §6.2 |
| question-form 在**流式中**到达,平滑定位的中间帧不得让跟随逃逸 | §6.1 |
| `scrollTop` 抖动 0.3px 不得算作上滚 | §6.4 |
| PageUp / Home 按键必须立即逃逸 | §6.3 |
| `prefers-reduced-motion: reduce` 下,点「回到最新」不得传 `behavior:'smooth'` | §6.5 |
| 思考框:流式中最后一行始终可见;向上滚后停手;滚回底恢复;折起再展开恢复;toggle 回声不得触发 | §6.6 |
| 思考框折起时不得写 `scrollTop`(几何为 0) | §6.6 |

按仓库规矩,每条都要先在无实现的情况下跑红。

---

## 8. 如果反过来决定引库(备查)

只有 `use-stick-to-bottom` 值得单独讨论——其余要么停更(`react-scroll-to-bottom`)、要么是它的薄壳(`ai-elements`)、要么会替掉我们的虚拟化(`react-virtuoso` / `MessageScroller`)、要么许可不合(`@virtuoso.dev/message-list`,Commercial)。

**集成点**:`.chat-log` 拆成 `scrollRef`(外)+ 新增 `contentRef`(内)两层 div,消息从 `.chat-log` 的直接子元素降一层。

**风险清单**:

1. `> .msg:first-of-type { margin-top:auto }` 的贴底配平、逐子元素 `ResizeObserver`、尾部占位块、anchor-to-top,**全部建立在「消息是 chat-log 直接子元素」上**,要一起重做。
2. `useMeasuredVirtualWindow`(>80 条)与它的 `contentRef` 契约需要对齐;`ai-elements` 自己的 issue #103 就是「什么时候支持虚拟化」,上游没答案。
3. 四个已知缺陷(#9 iOS / #14 每事件重渲 / #32 缩放 / #40 容器尺寸)修复 PR 全部挂着未合,上游最近一次发版 2026-06-04,仓库无测试套件 → **装了还得 vendor 补丁**,而这四条正好全都会打在这个页面上(移动端、长会话、缩放、输入框长高)。
4. 自带弹簧动画在快速流式时**故意落后**于真实底部,与「瞬时贴底」的既定选择冲突;关掉弹簧(`animation:"instant"`)之后剩下的就是我们已经有的那 60 行判据。
5. 纯 ESM 且不带 `"use client"`,Next.js App Router 下要自己包一层。
6. 无 `prefers-reduced-motion`。
7. 依赖政策:`CONTRIBUTING.md` 要求 PR 描述里单独用一段说明「拿到什么 vs. 多发多少字节」。2.5 KB gzip 不是问题,**问题是拿到的东西我们已经有了,而它缺的四样我们已经补上了**。

---

## 9. 参考链接(均实际读过)

**源码**
- `use-stick-to-bottom` — [useStickToBottom.ts](https://github.com/stackblitz-labs/use-stick-to-bottom/blob/main/src/useStickToBottom.ts) · [issue #9](https://github.com/stackblitz-labs/use-stick-to-bottom/issues/9) · [#14](https://github.com/stackblitz-labs/use-stick-to-bottom/issues/14) · [#32](https://github.com/stackblitz-labs/use-stick-to-bottom/issues/32) · [#40](https://github.com/stackblitz-labs/use-stick-to-bottom/issues/40)
- shadcn `MessageScroller` — [types.ts](https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/react/src/message-scroller/types.ts) · [components.tsx](https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/react/src/message-scroller/components.tsx) · [2026-06 changelog](https://ui.shadcn.com/docs/changelog/2026-06-chat-components)
- Vercel `ai-elements` — [conversation.tsx](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/conversation.tsx)
- assistant-ui — [useThreadViewportAutoScroll.ts](https://github.com/assistant-ui/assistant-ui/blob/main/packages/react/src/primitives/thread/useThreadViewportAutoScroll.ts) · [viewport-scroll.ts](https://github.com/assistant-ui/assistant-ui/blob/main/packages/store/src/utils/viewport-scroll.ts) · [PR #4141(retina 1px)](https://github.com/assistant-ui/assistant-ui/pull/4141)
- react-virtuoso — [stateFlagsSystem.ts](https://github.com/petyosi/react-virtuoso/blob/main/packages/react-virtuoso/src/stateFlagsSystem.ts) · [followOutputSystem.ts](https://github.com/petyosi/react-virtuoso/blob/main/packages/react-virtuoso/src/followOutputSystem.ts)
- HuggingFace chat-ui — [stickToBottom.ts](https://github.com/huggingface/chat-ui/blob/main/src/lib/utils/scroll/stickToBottom.ts)
- VS Code Copilot Chat — [chatListWidget.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/widget/chatListWidget.ts) · [chatThinkingContentPart.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.ts) · [issue #325549(展开思考块被滚走)](https://github.com/microsoft/vscode/issues/325549)
- LibreChat — [useMessageScrolling.ts](https://github.com/danny-avila/LibreChat/blob/main/client/src/hooks/Messages/useMessageScrolling.ts)
- Lobe Chat — [useAutoScroll.ts](https://github.com/lobehub/lobehub/blob/main/src/hooks/useAutoScroll.ts) · [Thinking/index.tsx](https://github.com/lobehub/lobehub/blob/main/src/features/Conversation/components/Thinking/index.tsx)
- open-webui — [Chat.svelte](https://github.com/open-webui/open-webui/blob/main/src/lib/components/chat/Chat.svelte)
- Chatbot UI — [use-scroll.tsx](https://github.com/mckaywrigley/chatbot-ui/blob/main/components/chat/chat-hooks/use-scroll.tsx)

**规范 / 平台**
- [CSSOM View — perform a scroll(`behavior:'smooth'` 绕过 CSS 的原文)](https://drafts.csswg.org/cssom-view/#scrolling)
- [CSS Scroll Anchoring L1(锚定修正**会**发 scroll 事件)](https://drafts.csswg.org/css-scroll-anchoring-1/)
- [WICG/overscroll-scrollend-events#4(为什么 scrollend 不带来源)](https://github.com/WICG/overscroll-scrollend-events/issues/4)
- [Chrome for Developers — Scrollend, a new JavaScript event](https://developer.chrome.com/blog/scrollend-a-new-javascript-event/)
- [WebKit Features for Safari 26.2(scrollend 落地)](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)
- [caniuse — scrollend](https://caniuse.com/mdn-api_element_scrollend_event)
- [DOM 规范 — `isTrusted`](https://dom.spec.whatwg.org/#dom-event-istrusted)
- [Adam Argyle — A Scrollend Event / scrollyfills](https://nerdy.dev/a-scrollend-event)
- WebKit scroll anchoring:[#171099](https://bugs.webkit.org/show_bug.cgi?id=171099) · [#109640](https://bugs.webkit.org/show_bug.cgi?id=109640)
- [Checka11y.css #55 — `column-reverse` 的可访问性问题](https://github.com/jackdomleo7/Checka11y.css/issues/55)

**产品行为(旁证,非源码)**
- [Bugzilla #1874621 — Mozilla 工程师对 ChatGPT 滚动的诊断](https://bugzilla.mozilla.org/show_bug.cgi?id=1874621)
- [Cursor 论坛 — Shift+Enter 触发自动滚底(输入框长高导致)](https://forum.cursor.com/t/shift-enter-triggers-chat-auto-scroll/140089)
- [Gemini — 向上滚被反复弹回的长期未修问题](https://discuss.ai.google.dev/t/persistent-auto-scrolling-jumping-issue-in-chat-interface/108431)

**本仓**
- `apps/web/src/runtime/chat/stick-to-bottom.ts` / `jump-to-latest.ts`
- `apps/web/src/components/ChatPane.tsx`(2365 初次定位 / 2444 anchor-to-top / 2581 onScroll / 2626 onWheel / 2645 onTouchMove / 2726 ResizeObserver / 2949 syncFollowState / 3095 scrollAnchorToTop / 3104 jumpToBottom / 3524 折叠块 release / 4872 虚拟化)
- `apps/web/src/components/chat/ExecutionShell.tsx:348` `ThoughtsRow` · `primitives/Foldable.tsx:94` `bodyRef` · `primitives/record.module.css:905`(思考容器注释)/ `:930` `.stream` / `:1007` `.fold .body.scroll`
- `apps/web/tests/components/chat-scroll-following.test.tsx`(28 条)· `tests/runtime/chat/stick-to-bottom.test.ts`(3 条)
- `specs/current/chat-panel-dispatch-2026-09-02.md` §产品裁决 1、待拍板清单 #6
- 已删实现:`git show 1626b893df^:apps/web/src/components/chat/primitives/useThinkingStream.ts`
