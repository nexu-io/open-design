/**
 * 「我还在跟着最新输出跑吗」——**一个意图,不是一个从位置反推的量**。
 *
 * 老写法是反推的:`pinnedToBottom = distance < 80`,每来一次 scroll 事件重算。
 * 这在流式输出下会锁死,而且是**结构性**的锁死,门槛调大调小都救不了:
 *
 *   跟随把 `scrollTop` 写回底部 → `distance` 归零 → 反推出「还在跟随」→ 继续跟随
 *
 * 用户往上滚一格(触控板一格 ~40px),下一块内容到达前就被写回底部了,于是他
 * **永远攒不出 80px**。表现就是「整个对话框连向上滚动都不行」(用户 2026-08-27)。
 *
 * 换成:意图**只由用户的动作改变**。内容长高变矮、我们自己写 `scrollTop`、
 * 面板改尺寸,一律不许碰它。用户 2026-08-27 的原话:
 * 「一旦用户手动滚动了别的位置,就应该固定这个位置」。
 *
 * ── 这套状态机照搬 `use-stick-to-bottom`(MIT,stackblitz-labs,周下载 350 万,
 *    Vercel AI SDK 的 `<Conversation>` 用的就是它)的核心,外加 assistant-ui
 *    `useThreadViewportAutoScroll` 的一处更好的判据。为什么是移植不是直接装依赖,
 *    见本文件末尾。
 *
 * ## 三个布尔量,不是一个
 *
 * 这是移植时最容易做错的地方:
 *
 *   · `following` —— 意图锁:此刻该不该贴着最新输出。
 *   · `escaped`   —— 用户主动挣脱过。它和 `following` 不是一回事:
 *                    没有它,「往回滚一点」会立刻被判回跟随,死锁原样复活。
 *   · 「离底部多远」—— 纯几何量,每次现算,**不存**。
 *
 * 出和回用两个不同的条件:
 *   出去只要真的离开了底部;回来必须**主动往下滚并真的到底**。
 * “距底部几十像素”仍是用户选定的阅读位置,不是授权自动吸底。
 *
 * ## 怎么分清「用户滚的」和「内容/我们自己引起的」
 *
 * 不靠计时器,靠一条结构性判据(取自 assistant-ui):
 *
 *   往上滚 := 位置变小 **且 `scrollHeight` 没变**
 *
 * 内容变高变矮引起的位置变化(浏览器夹取、原生 scroll anchoring 在上方内容
 * 回流后对 `scrollTop` 的修正)必然伴随 `scrollHeight` 变化,于是天然被排除 ——
 * 比「记一个时间窗口然后猜」可靠得多。
 *
 * 另外,每次**我们自己**写 `scrollTop` 之后都要把新位置记进基线
 * (`sampleGeometry`),否则下一次用户滚动的位移是拿旧基线算的,方向会算反。
 *
 * ## 为什么不设 `overflow-anchor: none`
 *
 * 直觉上「我自己算滚动位置,就该把浏览器的 scroll anchoring 关掉」——**反了**。
 * 上方内容回流(图片/iframe 迟到、早先内容重排)时不让阅读位置乱跳,靠的正是
 * 浏览器原生的 scroll anchoring;`use-stick-to-bottom` 和 assistant-ui 都**没有**
 * 设过 `overflow-anchor: none`,前者 README 里那句「Correctly handles Scroll
 * Anchoring」说的是「不会把 anchoring 的修正误读成用户滚动」,不是「自己实现了 anchoring」。
 * 我们这边不误读它的机制就是上面那条 `scrollHeight` 判据。
 * (代价:Safari 至今没有 scroll anchoring,那边上方回流仍然会跳 —— 这是浏览器的账,
 * 不是这套状态机能补的。)
 */

export interface ScrollSample {
  scrollTop: number;
  /** 内容总高。调用方负责把 anchor-to-top 预留的空白**扣掉**再传进来。 */
  scrollHeight: number;
  clientHeight: number;
}

export interface FollowIntent {
  /** 此刻该不该贴着最新输出跑。 */
  following: boolean;
  /** 用户主动滚开过 —— 只有主动往下滚才能清掉。 */
  escaped: boolean;
}

/**
 * 小到这个程度就还算「贴着底」。
 *
 * 不能取 1px:`devicePixelRatio: 2` 的屏幕上浏览器会把 `scrollTop` 截得比真实底部
 * 少一个像素,严格判据于是**永远不成立**(assistant-ui PR #4141 就是修这个);
 * 分数级缩放下更差(use-stick-to-bottom issue #32)。这里给 8px。
 */
export const AT_BOTTOM_TOLERANCE_PX = 8;

/** 「滚回底部附近」那条带子,按视口比例算 —— 窄面板和宽面板的「差不多到底了」不是同一个像素数。 */
const RESUME_BAND_RATIO = 0.12;
const RESUME_BAND_MIN_PX = 40;
const RESUME_BAND_MAX_PX = 120;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function resolveResumeBand(clientHeight: number): number {
  const height = Number.isFinite(clientHeight) && clientHeight > 0 ? clientHeight : 0;
  return clamp(height * RESUME_BAND_RATIO, RESUME_BAND_MIN_PX, RESUME_BAND_MAX_PX);
}

/** 离内容底部还有多远。内容比视口矮时算 0。 */
export function distanceFromBottom({ scrollTop, scrollHeight, clientHeight }: ScrollSample): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

/** 内容根本装不满一屏,或者就贴在底上。 */
export function isAtBottom(sample: ScrollSample): boolean {
  if (sample.scrollHeight <= sample.clientHeight) return true;
  return distanceFromBottom(sample) <= AT_BOTTOM_TOLERANCE_PX;
}

/** 近到可以重新跟上了。 */
export function isNearBottom(sample: ScrollSample): boolean {
  if (sample.scrollHeight <= sample.clientHeight) return true;
  return distanceFromBottom(sample) <= resolveResumeBand(sample.clientHeight);
}

/** 能滚到的最大位置。「底部离用户有多远」的分母。 */
function maxScrollTopOf(sample: ScrollSample): number {
  return Math.max(0, sample.scrollHeight - sample.clientHeight);
}

/**
 * 一个「往回看」的手势(滚轮往上、手指往下拖),在这块几何上**有没有可能**
 * 真的把用户带离底部。
 *
 * ## 为什么手势那一侧需要单独一条判据
 *
 * 意图正常只由 `nextFollowIntent` 改,而它是**事后**的:先有位移,再判方向。
 * 但快速流式下这条路会断 —— 同一帧里我们写过 `scrollTop`,浏览器就把这一次滚轮
 * 滚动整个取消掉,连 scroll 事件都不发。所以调用方还挂了 wheel / touch 监听,
 * 在位移发生**之前**就松手(`use-stick-to-bottom` 同样为此单独挂了 wheel)。
 *
 * 代价是那一侧拿不到位移,只能拿手势。于是它必须自己回答一个问题:
 * **这一格手势有没有可能产生一次「离开底部」?** 答不出来就会把
 * 「手势发生了但一个像素都没动」误判成「用户滑走了」。
 *
 * ## 判据
 *
 * 往上的手势只能减小 `scrollTop`,所以它能造出的**最大**离底距离就是
 * `maxScrollTop`(一路滚到顶)。而 `nextFollowIntent` 认定挣脱的门槛是
 * `!isAtBottom(next)`,也就是离底 > `AT_BOTTOM_TOLERANCE_PX`。两条合起来:
 *
 *   · `maxScrollTop <= AT_BOTTOM_TOLERANCE_PX` —— 这块几何里**没有一个位置**
 *     算「不在底部」。用户此刻在底部,滚到顶还是在底部。挣脱在物理上不成立。
 *   · `scrollTop <= 0` —— 已经在顶端,往上的手势位移恒为 0。
 *
 * 两条都是**必要**条件,不是充分条件:通过了也只说明「有可能」,真正的判定仍然
 * 由随后的 scroll 事件交给 `nextFollowIntent`。这里只负责把不可能的那些挡在外面。
 *
 * ## 为什么不是 `scrollHeight > clientHeight`
 *
 * 那是「余量严格大于 0」,和这套状态机其余部分用的 8px 容差**对不上**。
 *
 * 「一屏装得下的对话余量就是 0」是**错的**,而且不是差一两个像素的错。
 * 打包版 `0.21.2-beta.1` 真机采样(800ms 一次,只读),「刚进会话、内容很少」
 * 这个状态出现 108 次,几何**恒定**:
 *
 *   scrollHeight = 589   clientHeight = 583   余量 = 6px
 *
 * (另有 37 次是 583 / 583,余量 0 —— 那一档旧判据本来就挡住了。)
 * 注意 6px **不是**亚像素取整能解释的:取整误差是零点几到一两个像素,而且会抖;
 * 108 个样本一动不动的 6px 是**真实的内容溢出**(padding / margin 那一层),
 * 只是它小到用户在屏幕上完全看不出来。所以这里要挡的不是「取整噪声」,
 * 是「小到滚了等于没滚」的那一整段区间。
 *
 * 严格判据于是漏掉了整整一类「用户觉得自己一格都没滚动」的手势:
 * 屏幕上纹丝不动,跟随却已经被松开,后面的流式输出全跑到屏幕外
 * (用户 2026-09-07:「刚进入会话后向上滚了几次,此时滚不动,因为界面没什么内容,
 * 然后后续的流式输出就不会自动吸底了」——真机确认走的是滚轮/触控板这条路)。
 *
 * ⚠️ 门槛复用 `AT_BOTTOM_TOLERANCE_PX` 是**推导**出来的,不是调出来的:
 * 挣脱的定义就是 `!isAtBottom`,手势侧和判定侧必须同一把尺子,否则又会分叉。
 * 真机那 6px 落在 8px 以内是**验证**,不是这个数字的来源 —— 换句话说,如果哪天
 * 量到 12px 的余量,该改的是这条不变量之外的东西,不是把 8 调大。
 */
export function upwardGestureCanEscapeBottom(sample: ScrollSample): boolean {
  if (sample.scrollTop <= 0) return false;
  return maxScrollTopOf(sample) > AT_BOTTOM_TOLERANCE_PX;
}

/**
 * 一次滚动之后,跟随意图该变成什么。
 *
 * **只有这里(以及几处显式动作:点「回到最新」、发消息、切会话)能改意图。**
 * 内容长高变矮一律不许改 —— 那正是老写法的病根。
 *
 * ## 【调用方的不变量】自己写位置时,基线和落点必须在同一拍里一致
 *
 * 这里分不出「谁发起的滚动」,平台也不打算让它分得出:`scrollend` 明确不带来源
 * (WICG/overscroll-scrollend-events#4),而程序触发的 scroll 事件 `isTrusted`
 * 同样是 `true`。所以判据只能靠「方向 + 几何」,而它成立**依赖调用方守规矩**:
 *
 * > 自己发起的滚动一律**瞬时**(`behavior:'auto'`);要用动画,先 `release()`。
 *
 * `behavior:'smooth'` 破坏的正是这一点 —— 调用方按预测记完基线,浏览器才开始动,
 * 随后吐出来的一串中间位置全在基线的另一侧,在这里就是一次用户滚动。
 * 更麻烦的是流式:浏览器的落点在调用那一刻算死,内容还在长,于是动画落在一个
 * 早就不是底部的位置上,连「最后一帧贴底顺手救回来」都没有。
 * (`ChatPane` 的 question-form 定位在这上面栽过一次,两份拷贝只修了一份。)
 */
export function nextFollowIntent(
  current: FollowIntent,
  previous: ScrollSample,
  next: ScrollSample,
): FollowIntent {
  // 位置变小**且内容总高没变** = 用户的手。内容变化引起的位移(浏览器夹取、
  // scroll anchoring 修正)必然伴随 `scrollHeight` 变化,在这里就被排掉了。
  const layoutStable =
    next.scrollHeight === previous.scrollHeight && next.clientHeight === previous.clientHeight;
  const scrolledUp = next.scrollTop < previous.scrollTop && layoutStable;
  /*
   * 下滚**不要求布局静止**,只要求「底部没有朝用户挪过来」。
   *
   * 严格的 `layoutStable` 在恢复这一侧是错的:流式期间内容每一帧都在长,
   * 虚拟化重测量也会改 `scrollHeight`,于是用户滚回底部那一下只要撞上一个
   * 「内容也长了」的帧,整个事件被丢掉,他白滚一次 —— 而逃逸那一侧有 wheel /
   * touch 兜底,恢复这一侧一个都没有。这个不对称就是「怎么也回不到跟随」的来源。
   *
   * 放宽到 `maxScrollTop` 不减少是**可证的**,不是调出来的经验值:
   *   · 内容长高 / 视口变矮 ⇒ 底部**远离**用户。位置不动的话距离只会变大,
   *     所以「位置变大且落在底部」必然意味着用户真的往下滚了至少那么多。
   *   · 内容变矮 ⇒ 底部**朝用户挪**,距离会自己缩进容差里 —— 这正是原来那条
   *     注释要挡的「Plan / queue / composer 高度变化把几十像素吃掉」,继续挡住。
   *   · scroll anchoring 在上方插内容会同时抬高 `scrollTop` 和 `scrollHeight`,
   *     距底不变,造不出「贴底」这个结果。
   * 所以这一条不需要任何时间窗,也就没有「窗口开多大」这种没法离线验的参数。
   */
  const bottomDidNotApproach = maxScrollTopOf(next) >= maxScrollTopOf(previous);
  const scrolledDown = next.scrollTop > previous.scrollTop && bottomDidNotApproach;

  let { following, escaped } = current;
  // 还贴在底上的一两个像素抖动不算挣脱 —— 高 DPI 屏上这种抖动是常态。
  if (scrolledUp && !isAtBottom(next)) {
    escaped = true;
    following = false;
  }
  // 清掉 escaped 和重启 following 必须是**同一次用户下滚到底**。
  // 不能在“距底几十像素”时先清 latch:随后 Plan / queue / composer 高度变化
  // 就可能让这几十像素自然消失,尽管用户没再动,也会被错误挂回跟随。
  if (scrolledDown && isAtBottom(next)) {
    escaped = false;
    following = true;
  }
  return { following, escaped };
}

/*
 * ## 为什么是移植,不是 `pnpm add use-stick-to-bottom`
 *
 * `CONTRIBUTING.md`:「**No new top-level dependencies** without a paragraph in the PR
 * description on what we get vs. what bytes we ship.」—— 是要理由,不是禁止。所以真去评了:
 *
 *  · 装它划得来的部分:2.7KB min+gzip、零运行时依赖、MIT。
 *  · 划不来的部分:它要求把滚动容器和内容各绑一个 ref、内容外面**再包一层 div**。
 *    `.chat-log` 现在是 flex 列容器,`> .msg:first-of-type { margin-top: auto }` 的配平、
 *    逐个子元素挂 ResizeObserver、anchor-to-top 的尾部占位块,全都建立在
 *    「消息是 chat-log 的直接子元素」上。插一层 wrapper 要把这些一起重做。
 *  · 它自带一套弹簧动画(自己跑 rAF 积分)。快速流式时它是**故意落在真实底部后面**的
 *    (实测 1200px/s 时稳态滞后 ~196px)。而这里现有实现是瞬时贴底,并且代码注释写明
 *    平滑滚动会吐出中间 scroll 事件、打断跟随 —— 引入弹簧等于把那个坑再挖一遍。
 *  · 三个已知缺陷正好都会打在这个页面上,而且 PR 都挂着没合(仓库上一次发版
 *    2026-06-04):不观察滚动容器本身(输入框长高/软键盘弹出会静默失准,issue #40)、
 *    每次 scroll 事件都 setState 重渲整棵子树(issue #14)、iOS 上没有 touch 逃逸路径
 *    (issue #9)。装了也得 vendor 补丁。
 *  · 它是纯 ESM 且不带 `"use client"`。
 *
 * 结论:**拿走这套状态机(约 60 行),不拿那套动画和 DOM 契约。**
 * 上面每一处非显然的判据都标了出处。
 */
