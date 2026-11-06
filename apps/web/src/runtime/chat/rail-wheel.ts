// 消息导轨的滚轮账:导轨自己吃不下的那部分,要交给聊天记录。
//
// 缺陷
// ----
// `.chat-message-rail` 是一条绝对定位、20px 宽、**整个 log viewport 高**的覆盖层
// (`chat.css`:`position: absolute; top: 0; bottom: 0; width: 20px`)。指针落在它
// 上面时,滚轮对聊天记录完全无效,上下两个方向都死。
//
// 根因是结构性的,不是某条属性写错:导轨是 `.chat-log` 的**兄弟节点** —— 两者
// 叠在 `.chat-log-viewport` 的同一个 grid cell 里(`composio.css`:
// `.chat-log-viewport { display: grid; grid-template: minmax(0,1fr) / minmax(0,1fr) }`
// 加 `.chat-log-viewport > .chat-log { grid-area: 1 / 1 }`)。Chromium 沿**祖先链**
// 找滚动容器,chat log 从来不在导轨的那条链上;往上找到的
// `.chat-log-viewport` / `.chat-log-wrap` / `.pane` 都不接受滚轮。所以浏览器
// 没有任何理由把这个滚轮交给聊天记录 —— 得由代码交。
//
// 顺带记一句已经反证掉的方向:track 上的 `overscroll-behavior: contain` **不是**
// 原因。实测把它改成 `auto`、把 track 滚到底再发滚轮,日志仍然不动 —— 因为
// scroll chaining 只会往**祖先**传,而 log 不是祖先。摘掉它不构成修复。
//
// 伤害面
// ------
// 出现条件只是「≥2 条用户消息」(`CHAT_RAIL_MIN_USER_MESSAGES`),几乎每段对话
// 都有。导轨平时 `opacity: 0` 但照样吃输入,而 `.chat-log` **故意没有滚动条**
// (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`,注释里写明
// 导轨就是滚动条的替代品),于是用户按肌肉记忆把指针停在右边缘 —— 正好落进死区,
// 屏幕上还没有任何线索说明为什么滚不动。
//
// 为什么账算在这里,而不是在组件里
// ------------------------------
// jsdom 不做排版:它给每个元素报的 `scrollHeight` / `clientHeight` 都是 0,
// 于是「导轨还剩多少余量」在组件层面根本量不出来。把判据留成一个不碰 DOM 的
// 纯函数,规格就能直接喂真实几何(track 不可滚 / 可滚但已到底 / 可滚且有余量),
// 而组件那边只剩「读三个数、按结果写两个 scrollTop」。

import { wheelDeltaToPx } from '../../observability/chat-scroll-freeze-detector';

/** 一个滚动容器能被问到的三个数。 */
export interface RailWheelGeometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** 一次滚轮的去向,单位是像素,带符号(正 = 向下)。 */
export interface RailWheelSplit {
  /** 导轨自己吃下的位移。 */
  track: number;
  /** 导轨吃不下、要转发给聊天记录的位移。 */
  log: number;
}

const NOTHING: RailWheelSplit = { track: 0, log: 0 };

/**
 * 把一次滚轮位移拆成「导轨吃多少 / 聊天记录吃多少」。
 *
 * 判据,按顺序:
 *  1. 导轨在**这个方向**还有余量 → 先给导轨,最多给到余量为止
 *     (向下的余量是 `scrollHeight - clientHeight - scrollTop`,向上是 `scrollTop`);
 *  2. 剩下的 —— 导轨压根不可滚、已经到底/到顶、或者只吃得下一部分 —— 全部交给聊天记录。
 *
 * 「先给导轨」不是可有可无的礼貌:长会话里导轨自己就是一列滚动的短横
 * (`data-wheel='true'` 那一档),指针停在上面时用户多半是想拨那一列。
 *
 * @param deltaPx 已经归一化成像素的位移(见 `railWheelDeltaPx`)。
 * @param track   导轨轨道的几何;`null` 表示轨道还没挂上,那就整份给聊天记录。
 */
export function splitRailWheelDelta(
  deltaPx: number,
  track: RailWheelGeometry | null,
): RailWheelSplit {
  if (!Number.isFinite(deltaPx) || deltaPx === 0) return NOTHING;
  if (track == null) return { track: 0, log: deltaPx };

  const travel = Math.max(0, track.scrollHeight - track.clientHeight);
  // 夹一次:真实容器不会越界,但几何是外面读进来的,越界的输入不该算出负余量。
  const top = Math.min(Math.max(track.scrollTop, 0), travel);
  const room = deltaPx > 0 ? travel - top : top;

  const magnitude = Math.abs(deltaPx);
  const toTrack = Math.min(magnitude, Math.max(0, room));
  const toLog = magnitude - toTrack;
  const sign = deltaPx > 0 ? 1 : -1;
  // `0 === -0` 为真,但 `Object.is` 不是 —— 断言和快照会把 `-0` 当成另一个值。
  // 「没有位移」只有一种写法。
  return {
    track: toTrack === 0 ? 0 : sign * toTrack,
    log: toLog === 0 ? 0 : sign * toLog,
  };
}

/**
 * 滚轮位移归一化成像素。
 *
 * 这一步在「浏览器自己滚」的年代不需要 —— 现在需要了:接管之后位移是我们自己
 * 写进 `scrollTop` 的,而 `WheelEvent.deltaY` 的单位由 `deltaMode` 决定。
 * macOS / Windows Chromium 一律是 `DOM_DELTA_PIXEL(0)`,但 Firefox 在部分平台上
 * 用 `DOM_DELTA_LINE(1)` —— 一格滚轮的 `deltaY` 是 3。不归一化的话,那些平台上
 * 转发给聊天记录的就是 3px,滚动等于纹丝不动。
 *
 * @param viewportPx `DOM_DELTA_PAGE(2)` 下一页有多高;传聊天记录的可视高度。
 */
export function railWheelDeltaPx(
  deltaY: number,
  deltaMode: number,
  viewportPx: number,
): number {
  if (!Number.isFinite(deltaY)) return 0;
  const viewport = viewportPx > 0 ? viewportPx : RAIL_WHEEL_FALLBACK_VIEWPORT_PX;
  return wheelDeltaToPx(deltaY, deltaMode, viewport);
}

/** 首帧之前读不到可视高度时,`DOM_DELTA_PAGE` 按这个数折算。同 chat-scroll-takeover。 */
export const RAIL_WHEEL_FALLBACK_VIEWPORT_PX = 800;
