/**
 * 「刚发出去的这一轮,钉到聊天区顶端」的**纯判据**。
 *
 * 这块几何原来整段写在 `ChatPane` 里,读不出、也测不到:jsdom 没有布局,
 * `scrollHeight` / `clientHeight` / `getBoundingClientRect()` 默认全是 0,
 * 于是「断言滚到顶」的用例在**没有实现**的时候也是绿的(期望值和实际值都是 0)。
 * 判据搬到这里之后,每一条都可以喂显式的几何数字,红绿都是真的。
 *
 * ## 这套机制由三件事组成
 *
 *   1. **尾部占位块**(`anchorSpacerHeight`)——在回复下面撑出一块**真实可滚动**的
 *      空白,好让这条用户消息物理上够得着视口顶端。短回复(甚至还没有回复)时,
 *      没有这块空白就根本滚不上去 —— 用户会觉得「置顶没生效」,而其实是滚不动。
 *   2. **落点**(`anchorScrollTop`)——占位块按 (1) 定过尺寸之后,消息顶到上沿
 *      对应的 `scrollTop`。这两个数是**同一副几何的两面**:占位块正好撑到
 *      「落点 == 能滚到的最大位置」,所以钉住之后再怎么长内容,视图都不会被夹取推走。
 *   3. **松手判据**(`anchorReleasedByScroll`)——用户自己滚开了多远才算「不钉了」。
 *
 * ## 【不变量】钉住这一跳必须是**瞬时**的
 *
 * (3) 分不出「谁发起的滚动」——平台也不打算让它分得出(见 `stick-to-bottom.ts`
 * 里那一整段)。所以 `behavior:'smooth'` 会让这套机制**自己把自己判掉**:
 * 动画中间的每一帧离落点都远远超过 `ANCHOR_RELEASE_SLACK_PX`,第一帧就把钉住
 * 状态清掉了,之后占位块再也不收缩,而贴底跟随可能在动画最后一帧被重新挂上,
 * 把用户拽到底 —— 这正是「有时候置顶了有时候没有」的来源。
 * 调用方必须用 `behavior:'auto'` 并走自己那个「写完就记基线」的写入口。
 */

/** 钉住的消息上边留的那点空隙。 */
export const ANCHOR_TOP_PADDING = 12;

/**
 * 离钉住位置超过这么多像素,才算「用户自己滚开了」。
 *
 * 不能取 0:占位块每一帧都在收缩,浏览器夹取会带来亚像素级的漂移。
 */
export const ANCHOR_RELEASE_SLACK_PX = 40;

export interface AnchorGeometry {
  /** 视口高。 */
  clientHeight: number;
  /** 可滚内容总高,**含**尾部占位块 —— 就是 `el.scrollHeight` 的读数。 */
  scrollHeight: number;
  /** 尾部占位块此刻的高度。 */
  spacerHeight: number;
  /** 被钉住那条用户消息距内容顶端的偏移(与当前 `scrollTop` 无关)。 */
  messageTopInContent: number;
}

/** 这条消息下面还有多少**真内容**(占位块不算)。 */
function contentBelowAnchor(geometry: AnchorGeometry): number {
  return Math.max(
    0,
    geometry.scrollHeight - geometry.spacerHeight - geometry.messageTopInContent,
  );
}

/**
 * 尾部占位块要多高,这条消息才顶得到视口上沿。
 *
 * 回复越长,`needed` 越小,一路单调收缩到 0 —— 所以这是一次**纯缩小**的 resize,
 * 在用户钉在顶端时改不了任何可见内容的位置,不会抖。
 */
export function anchorSpacerHeight(geometry: AnchorGeometry): number {
  return Math.max(
    0,
    geometry.clientHeight - contentBelowAnchor(geometry) - ANCHOR_TOP_PADDING,
  );
}

/** 钉住位置对应的 `scrollTop`。 */
export function anchorScrollTop(messageTopInContent: number): number {
  return Math.max(0, messageTopInContent - ANCHOR_TOP_PADDING);
}

/*
 * ── 松手之后那块预留空白该怎么办 ──────────────────────────────────────
 *
 * 用户自己滚开(`anchorReleasedByScroll`)之后,占位块就不再收缩了 —— 原话是
 * 「预留的空白留着当真实可滚区域,往下滚才不会突然到底」。代价是它**冻在那儿**:
 * 一轮开始撑到 200~300px,整轮不动,而回复在这期间长了好几百像素。用户一旦回到
 * 底部,眼前就是「内容只占上面一小块,下面一大片空白,浮动药丸孤零零挂在最底」。
 *
 * 收它的条件不是「用户离底部多少像素」这种拍出来的门槛,而是**这块空白到底有没有
 * 戳进视口**:
 *
 *     屏幕上露出来的空白 = 占位块高度 − 离底距离
 *
 * 这个量同时把两件事说清楚了:
 *
 *   · 它 > 0 ⇔ 底下已经没有真内容了,剩下的全是我们预留的空 —— 这才是
 *     「用户贴近底部」的真正含义(不是「离底 N 像素」,而是「下面没东西可读了」);
 *   · 它 ≤ 0 ⇔ 空白整块在折线以下,用户正在中间读东西,收不收他都看不见,
 *     那就别动 —— 这正是当初「不收」那条注释要保护的场面。
 *
 * 另外它和「回到最新」浮标是**可证互斥**的:浮标的距离读数把占位块扣掉了
 * (`readContentSample`),所以只要空白还盖在视口里(离底距离 ≤ 占位块高度),
 * 浮标算出来的距离就是 0,压根不显示。两个东西不会同时出现在屏幕上。
 */

/**
 * 露出这么多空白才动手。
 *
 * 52 = 药丸让位(`.chat-log.has-plan-pill-reserve` 的 `padding-bottom`)。
 * 比这还小的一条缝就是流水底部本来就该有的呼吸位,为它挪动画面不划算 ——
 * 而且这个下限就是边界抖动的护栏:门槛以下一次都不动手。
 */
export const TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX = 52;

/**
 * 一帧最多把可见内容挪动这么多。
 *
 * 收掉尾部空白必然要动画面(浏览器会把 `scrollTop` 往回夹),所以问题不是
 * 「动不动」而是「一次动多少」。上限取 24px:比一格触控板滚动(~40px,
 * `stick-to-bottom.ts` 里引的就是这个数)还小,于是这套收缩在任何一帧里都
 * **跑不赢用户自己最小的一次有意滚动**,读起来是「落定」而不是「跳」。
 * 500px 的空白因此在 21 帧(约 350ms)里收完,和本仓库 UI 动效的时长同量级。
 */
export const TAIL_SPACER_COLLAPSE_STEP_PX = 24;

export interface TailSpacerCollapseGeometry {
  /** 占位块此刻的高度。 */
  spacerHeight: number;
  /** 它最终该收到多少 —— 就是 `anchorSpacerHeight` 算出来的那个数。 */
  targetHeight: number;
  /** 离**真实**滚动底部还有多远(含占位块,`readViewportSample` 那一份)。 */
  distanceFromBottom: number;
}

/** 这块预留空白此刻在屏幕上露出来多少。 */
export function tailSpacerBlankOnScreen(geometry: TailSpacerCollapseGeometry): number {
  return Math.max(
    0,
    geometry.spacerHeight - Math.max(0, geometry.distanceFromBottom),
  );
}

/**
 * 现在该不该**开始**收。
 *
 * 只管起手,不管收到一半 —— 起手之后由调用方把闩扣上一路收到位。分开的理由是
 * 边界抖动:门槛附近来回微滚时,如果每一帧都重问一次「还够不够 52px」,答案就会
 * 跟着手来回翻,占位块也跟着一涨一缩。闩上之后这个问题一轮里只问一次。
 */
export function shouldStartCollapsingTailSpacer(
  geometry: TailSpacerCollapseGeometry,
): boolean {
  if (geometry.targetHeight >= geometry.spacerHeight) return false;
  return tailSpacerBlankOnScreen(geometry) > TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX;
}

/**
 * 收缩中的下一帧该是多高。
 *
 * 【不变量】**这一帧把可见内容挪动的距离 ≤ `TAIL_SPACER_COLLAPSE_STEP_PX`。**
 * 证明:浏览器只在 `scrollTop > 新的最大可滚位置` 时才夹取,夹取量正好是
 * (收缩量 − 离底距离)。这里的收缩量上限是 (离底距离 + 24),所以夹取量 ≤ 24。
 * 离底距离越大,这一帧越是「白收」——那正是用户在中间读东西的场面,画面一动不动。
 *
 * 【不变量】**只减不增。** 内容变矮(折叠块收起、工具卡收拢)会让目标值回涨,
 * 这里不跟 —— 涨回去就是抖。
 */
export function nextCollapsingTailSpacerHeight(
  geometry: TailSpacerCollapseGeometry,
): number {
  if (geometry.targetHeight >= geometry.spacerHeight) return geometry.spacerHeight;
  const budget = Math.max(0, geometry.distanceFromBottom) + TAIL_SPACER_COLLAPSE_STEP_PX;
  return Math.max(geometry.targetHeight, geometry.spacerHeight - budget);
}

/**
 * 占位块按 `anchorSpacerHeight` 定过尺寸之后,能滚到的最大位置。
 *
 * 它**恒等于** `anchorScrollTop` ——「刚好够钉到顶,一个像素都不多」正是占位块的定义。
 * 单独导出是为了让这条恒等式可以被断言,而不是只写在注释里。
 */
export function maxScrollTopAfterAnchorSpacer(geometry: AnchorGeometry): number {
  const below = contentBelowAnchor(geometry);
  const total = geometry.messageTopInContent + below + anchorSpacerHeight(geometry);
  return Math.max(0, total - geometry.clientHeight);
}

/** 这一次滚动是不是把用户带离了钉住位置。 */
export function anchorReleasedByScroll(input: {
  scrollTop: number;
  messageTopInContent: number;
}): boolean {
  return (
    Math.abs(input.scrollTop - anchorScrollTop(input.messageTopInContent))
    > ANCHOR_RELEASE_SLACK_PX
  );
}

/**
 * 尾部这条用户消息是不是「刚刚新出现的一轮」——**该不该钉顶,只由这一条决定**。
 *
 * 老写法是每个发送入口各自举手(`anchorPendingRef.current = true`),而举手的
 * 只有输入框那一个入口。首页发起、question-form 交答案、批注发起、队列排到、
 * 失败后的「继续」、生图重试 …… 一条都不走输入框,于是它们全都钉不了顶。
 * 「有时候有有时候没有」的另一半就是这个。
 *
 * 改成认**结构**:尾条用户消息的 id 换了 = 屏幕上多了一轮新的用户消息,和它是
 * 从哪个按钮出来的无关。少一份状态,也就少一处「新入口忘了接」。
 *
 * `settledTailUserId === undefined` 表示这条会话还没落定过(初次装载 / 刚切会话)。
 * 那一拍**不钉**:整篇转录一次性到齐,不是新发了一轮。空会话落定成 `null`,
 * 所以它的第一条用户消息仍然算新的一轮(首页发起走的就是这一格)。
 */
export function isNewTailUserTurn(
  settledTailUserId: string | null | undefined,
  tailUserId: string | null,
): boolean {
  if (settledTailUserId === undefined) return false;
  if (tailUserId === null) return false;
  return tailUserId !== settledTailUserId;
}
