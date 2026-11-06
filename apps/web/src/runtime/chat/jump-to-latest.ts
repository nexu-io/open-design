/**
 * 「回到最新」那颗浮标什么时候该在。
 *
 * 为什么单独拿出来:同一个判据原来**在 `ChatPane` 里写死了四遍**(`distance > 120`),
 * 滚动、切回会话、恢复滚动位置、导航到某一轮各写一处 —— 改一个门槛要同时改四处,
 * 漏一处就自相矛盾。这里给一份,四处都调它。
 *
 * 门槛按**视口高度**算,不钉像素:用户 2026-08-27 说「总是有事没事就出现,
 * 只有在很上面时才出现不行吗」。而「很上面」在 400px 的窄面板和 1200px 的宽面板上
 * 本来就不是同一个像素数 —— 钉死 120px 的结果是,随手滚半屏它就浮出来压在
 * 回合状态行上。
 *
 * 出和收用两个门槛(迟滞):只有一个门槛时,停在临界点附近的轻微滚动会让它反复闪。
 */

/** 要滚过视口的这个比例才算「很上面」。 */
const SHOW_RATIO = 0.75;
/** 收起时放宽到这个比例 —— 差出来的这一段就是迟滞。 */
const HIDE_RATIO = 0.5;
/** 面板再矮也得滚过这么多才给入口,免得小窗口里它又变得很敏感。 */
const MIN_SHOW_PX = 320;
/** 面板再高也不该要求滚过好几屏 —— 超过这个距离一律算「很上面」。 */
const MAX_SHOW_PX = 1200;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export interface JumpToLatestInput {
  /** 离底部还有多远(`scrollHeight - scrollTop - clientHeight`)。 */
  distance: number;
  /** 滚动容器的可视高度。 */
  clientHeight: number;
  /**
   * 内容总高。给了就用它判「到底能不能滚」;不给则只按门槛走(老调用点兼容)。
   */
  scrollHeight?: number;
  /** 此刻是不是已经显示着 —— 迟滞要用。 */
  shown: boolean;
  /**
   * 此刻是不是正跟着最新输出跑(见 `stick-to-bottom.ts`)。
   * 跟着跑就没有「回到最新」这回事 —— 你就在最新上。
   */
  following?: boolean;
}

export function shouldShowJumpToLatest({
  distance,
  clientHeight,
  scrollHeight,
  shown,
  following,
}: JumpToLatestInput): boolean {
  /*
   * **正在跟随就不给入口**。这一条压在最前面,而且不看 `shown`。
   *
   * 它替掉的是老写法里那一堆「在这里把浮标点亮 / 在那里把浮标熄掉」的散装赋值:
   * 发消息时无条件点亮、展开折叠块时无条件点亮 —— 都没问过「底下到底有没有东西」。
   * 现在浮标只是跟随意图的影子,散装赋值全部删掉了。
   */
  if (following) return false;
  const height = Number.isFinite(clientHeight) && clientHeight > 0 ? clientHeight : 0;
  /*
   * **滚不动就没有「最新」可回**(用户 2026-08-27:「没法滚动时不要出现这个吧??」)。
   *
   * 这条压在门槛之前,而且不看 `shown` —— 它不是一个更严的门槛,是一条不变量。
   * 需要它是因为 `distance` 只在 scroll 事件里重算:在长会话里滚上去让浮标显形,
   * 再切到一条**短会话**,状态没人复位、短会话又发不出 scroll 事件,
   * 于是它挂在一屏根本没有滚动条的对话上。
   *
   * 1px 的余量给亚像素:内容和容器一样高时 `scrollHeight` 常比 `clientHeight`
   * 大零点几,严格 `>` 会把「其实滚不动」判成「能滚」。
   */
  if (scrollHeight != null && Number.isFinite(scrollHeight) && scrollHeight <= height + 1) {
    return false;
  }
  const showAt = clamp(height * SHOW_RATIO, MIN_SHOW_PX, MAX_SHOW_PX);
  if (!shown) return distance > showAt;
  // 已经在显示:门槛放低,往下滚一点不会立刻消失。
  const hideAt = clamp(height * HIDE_RATIO, MIN_SHOW_PX / 2, MAX_SHOW_PX);
  return distance > hideAt;
}
