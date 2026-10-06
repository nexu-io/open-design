/**
 * 内层滚动框的**贴底跟随**:agent 一边写一边滚,用户一翻阅就让开,回到底部再接上。
 *
 * ⚠️ **名字比它的职责窄**:2026-09-03 起终端输出块(`TerminalOutput`)也吃这一只 ——
 * 产品原话「这个也要参考 thinking 的那个卡片,感觉应该是一样的……用户滚动了不能跟
 * 用户抢滚动条」。里面没有任何 thinking 专属的东西,是通用的「内层框贴底跟随」。
 * 改名会连带动 `thinking-follow.test.tsx` 里那条按路径读源码的守卫,单独一次改名
 * 提交更干净,所以这一轮**只加复用、不改名**。
 *
 * 用户裁决(2026-09-02):
 *   「thinking 要自动跟随的,agent 一边写一边滚,但是用户如果**手动滚动到上面**,
 *     那就说明用户在翻阅,不能自动跟随滚动了;但用户如果**折叠起来再展开**,此时继续
 *     自动滚动;或者**用户手动滚动到最底部**,那说明也要继续自动跟随。
 *     反正就是常见的那种流式的产品体验。」
 *
 * ── 这不是那只被推翻的窗 ────────────────────────────────────────────
 *
 * 上一版(`useThinkingStream.ts`,已删)是**一步一停的慢速分步滚**:96px 定高窗 +
 * 上下渐隐 + rAF 缓动,走一步、停住让人读完、再走一步。用户否掉的是那两样:
 *   「滚动太慢了,也很难看清」
 * 「慢」说的是分步缓动,「看不清」说的是那两道渐隐。**跟随本身没被否**——
 * 我一度把三件事混成一件,把该留的也删了,这段注释就是为了别再绕一遍:
 *
 *   高度  ✗ 定高(短内容也撑满一屏)      ✓ `max-height`(`.body.scroll`,和完成态同款)
 *   滚动  ✗ 一步一停的慢速分步滚          ✓ 跟随,但**一次写到底**,正常速度
 *   遮罩  ✗ 上下渐隐                       ✓ 一律没有
 *
 * 所以这里没有 rAF、没有缓动、没有节奏 —— 只有一句 `scrollTop = max`。
 *
 * ── 判据复用,不另写一份 ────────────────────────────────────────────
 *
 * 「跟没跟上」这件事 `ChatPane` 早就有一套,而且刚修过一轮。语义完全一致,所以
 * 直接吃 `runtime/chat/stick-to-bottom.ts` 的 `nextFollowIntent`,不在这儿重新发明:
 *
 *   · 8px 贴底容差 —— 高 DPI 屏上浏览器会把 `scrollTop` 截得比真实底部少一个像素,
 *     严格判据永远不成立(assistant-ui PR #4141)。
 *   · **只有位置变小且 `scrollHeight`/`clientHeight` 没变**才算用户往上滚。内容长高、
 *     浏览器夹取、原生 scroll anchoring 的修正必然伴随几何变化,于是天然被排掉 ——
 *     这正是「内容增长不得伪装成用户动作」那条坑的解法。
 *   · 清 `escaped` 和重挂 `following` 必须是**同一次**用户下滚到底:布局收缩把距离
 *     压进容差不算,用户没动手就不许把他拽回去。
 *
 * ── 基线必须跟着几何走 ──────────────────────────────────────────────
 *
 * 每次几何落定(ResizeObserver)之后都要把当前样本记成新基线,**不管跟没跟随**。
 * 漏了这一步,逃逸期间内容长高会让基线停在旧的 `scrollHeight` 上,用户下一次真滚动
 * 算出来的 `layoutStable` 是假的,方向判不出来,恢复跟随那一路就死了。
 */
import { useEffect, type RefObject } from 'react';
import {
  nextFollowIntent,
  type FollowIntent,
  type ScrollSample,
} from '../../../runtime/chat/stick-to-bottom';

export function useThinkingFollow(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const box = ref.current;
    if (!box || !active) return;

    /** 一进来就跟着 —— 思考刚开始写的时候用户还没表达过任何意图 */
    let intent: FollowIntent = { following: true, escaped: false };

    const sample = (): ScrollSample => ({
      scrollTop: box.scrollTop,
      scrollHeight: box.scrollHeight,
      clientHeight: box.clientHeight,
    });
    let last = sample();

    /** 一次到底。没有缓动、没有分步 —— 那是被推翻的那一套。 */
    const stick = (): void => {
      const max = box.scrollHeight - box.clientHeight;
      if (max <= 0) return;
      if (box.scrollTop !== max) box.scrollTop = max;
    };

    /**
     * 几何落定。跟随就贴底,然后**无论如何**刷新基线 ——
     * 基线代表「上一次已知的几何」,和跟不跟随无关。
     */
    const onGeometry = (): void => {
      if (intent.following) stick();
      last = sample();
    };

    const onScroll = (): void => {
      const next = sample();
      intent = nextFollowIntent(intent, last, next);
      last = next;
    };
    box.addEventListener('scroll', onScroll, { passive: true });

    /*
     * 折叠再展开 = 重新挂上跟随(用户裁决)。收起来的时候他看不见,展开是「我要接着看」,
     * 不是「我要停在上次那个位置」。
     */
    const fold = box.closest('details');
    const onToggle = (): void => {
      if (!fold?.open) return;
      intent = { following: true, escaped: false };
      stick();
      last = sample();
    };
    fold?.addEventListener('toggle', onToggle);

    /*
     * 内容长高由 ResizeObserver 通知。它只用来**触发贴底**,从不喂给 `nextFollowIntent`
     * —— 意图只由 `scroll` 事件改,而那条路上还有 `layoutStable` 兜着。
     * 盒子自己被 `max-height` 截住之后就不再长了,所以内容那一层也要观察。
     */
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(onGeometry);
      observer.observe(box);
      for (const child of Array.from(box.children)) observer.observe(child);
    }
    /*
     * ⚠️ 光有 ResizeObserver **接不住终端那一档**,原因有两条,缺一条都不够:
     *   · 盒子自己被 `max-height` 截住之后就不再长了 —— 观察 `box` 收不到通知;
     *   · 终端是**一行一个 `<div>`**,新输出等于**新增子元素**,而上面那圈
     *     `Array.from(box.children)` 是挂载那一刻的快照,新来的子元素没人观察。
     * 思考正文那一档碰巧躲过了(它的子元素是同一批,长的是自己的高度),
     * 于是这条缺口一直没暴露。补一只 MutationObserver:内容动了就重新对一次几何。
     *
     * 它**只触发贴底 / 刷新基线**,不喂给 `nextFollowIntent` —— 意图仍然只由
     * `scroll` 事件改,那条路上还有 `layoutStable` 兜着,内容变化不会被误判成用户动作。
     */
    let mutations: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      mutations = new MutationObserver(onGeometry);
      mutations.observe(box, { childList: true, subtree: true, characterData: true });
    }
    onGeometry();

    return () => {
      box.removeEventListener('scroll', onScroll);
      fold?.removeEventListener('toggle', onToggle);
      observer?.disconnect();
      mutations?.disconnect();
    };
  }, [ref, active]);
}
