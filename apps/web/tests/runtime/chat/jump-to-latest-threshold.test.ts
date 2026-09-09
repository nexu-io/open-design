/**
 * 红测:「回到最新」不该有事没事就冒出来。
 *
 * 用户 2026-08-27 指认:「这个总是有事没事就出现,能不能加一些阈值啊,
 * 只有在很上面时才出现不行吗」。原来的判据是**写死的 120px** —— 半屏字都不到,
 * 随手滚一下就弹出来,而且它就浮在回合状态行上方,挡住〔继续剩余任务〕那一排。
 *
 * 两条:
 *  · 阈值跟着**视口高度**走,「很上面」在大屏小屏都得是同一件事;
 *  · 出和收用**两个**阈值(迟滞),否则在临界点上下微动会闪。
 */
import { describe, expect, it } from 'vitest';

import { shouldShowJumpToLatest } from '../../../src/runtime/chat/jump-to-latest';

describe('回到最新的出现阈值', () => {
  const H = 600;

  it('stays hidden for the small scrolls that used to trigger it', () => {
    // 120px 正是旧判据的门槛 —— 现在这个距离必须还是不出现
    expect(shouldShowJumpToLatest({ distance: 120, clientHeight: H, shown: false })).toBe(false);
    expect(shouldShowJumpToLatest({ distance: 300, clientHeight: H, shown: false })).toBe(false);
  });

  it('appears once the reader is genuinely far up', () => {
    expect(shouldShowJumpToLatest({ distance: 900, clientHeight: H, shown: false })).toBe(true);
  });

  it('scales with the pane instead of pinning a pixel count', () => {
    // 同一个绝对距离,在矮面板里算「很上面」,在高面板里不算
    const distance = 500;
    expect(shouldShowJumpToLatest({ distance, clientHeight: 400, shown: false })).toBe(true);
    expect(shouldShowJumpToLatest({ distance, clientHeight: 1200, shown: false })).toBe(false);
  });

  it('has hysteresis so it does not flicker on the boundary', () => {
    // 已经显示着的时候,门槛更低 —— 往下滚一点不会立刻消失
    const onBoundary = { distance: 380, clientHeight: H };
    expect(shouldShowJumpToLatest({ ...onBoundary, shown: false })).toBe(false);
    expect(shouldShowJumpToLatest({ ...onBoundary, shown: true })).toBe(true);
  });

  it('always disappears once the reader is back at the bottom', () => {
    expect(shouldShowJumpToLatest({ distance: 0, clientHeight: H, shown: true })).toBe(false);
    expect(shouldShowJumpToLatest({ distance: 40, clientHeight: H, shown: true })).toBe(false);
  });

  it('never demands more than a sane ceiling on very tall panes', () => {
    // 面板特别高时不该要求滚过好几屏才给入口
    expect(shouldShowJumpToLatest({ distance: 1400, clientHeight: 4000, shown: false })).toBe(true);
  });
});

/**
 * 滚不动的时候一律不出现(用户 2026-08-27:「没法滚动时不要出现这个吧??」)。
 *
 * 怎么会出现的:门槛只由 `distance` 决定,而 `distance` 只在 **scroll 事件**里重算。
 * 在长会话里滚上去 → 浮标显形;**切到一条短会话**后,`scrolledFromBottom` 这个状态
 * 没人复位,新的短会话又滚不动、一个 scroll 事件都不会发 —— 于是它就挂在一屏
 * 根本没有滚动条的对话上。
 *
 * 所以判据里补一条**不变量**:内容没有溢出容器 = 没有「最新」可回,一律 false。
 * 这条比门槛更硬 —— 不看迟滞、不看 `shown`。
 *
 * ⚠️ 断言形状要挑对:`distance: 0` 那种老代码本来就返回 false,写出来是**空转**
 * (第一版就是这么写的,4 条全绿)。能证伪的是「distance 还是大的、可内容已经
 * 不溢出了」—— 正是内容收缩后、下一个 scroll 事件到来之前的那一拍。
 */
describe('滚不动就别出现', () => {
  const H = 800;

  it('距离还挂着旧值,但内容已经不溢出 —— 收掉', () => {
    expect(shouldShowJumpToLatest({
      distance: 900, clientHeight: H, scrollHeight: H, shown: true,
    })).toBe(false);
  });

  it('未显示时同理,不许因为旧距离而冒出来', () => {
    expect(shouldShowJumpToLatest({
      distance: 900, clientHeight: H, scrollHeight: H, shown: false,
    })).toBe(false);
  });

  it('真的能滚、也确实滚上去了 —— 照常出现(否则上面两条就是把功能删了)', () => {
    expect(shouldShowJumpToLatest({
      distance: 900, clientHeight: H, scrollHeight: 3000, shown: false,
    })).toBe(true);
  });

  it('不传 scrollHeight 时按老规矩走,不因为缺参数就静默收掉', () => {
    expect(shouldShowJumpToLatest({ distance: 900, clientHeight: H, shown: false })).toBe(true);
  });
});

/*
 * 「正在跟着最新输出跑」这一条压在门槛之前。
 *
 * 它和上面那条不变量守的不是同一件事:那条问「还能不能滚」,这条问「我在不在最新上」。
 * 需要它是因为浮标以前是**散装赋值**出来的 —— 发消息时点亮一次、展开折叠块时点亮一次,
 * 都没问过底下有没有东西。现在浮标只是跟随意图的影子:跟着跑就没有「回到最新」可言。
 */
describe('跟着跑的时候没有「回到最新」这回事', () => {
  const H = 800;

  it('正在跟随:哪怕距离还挂着一个大数,也不给入口', () => {
    expect(shouldShowJumpToLatest({
      distance: 2000, clientHeight: H, scrollHeight: 6000, shown: true, following: true,
    })).toBe(false);
  });

  it('同样的几何、只是没在跟随 —— 就该给(否则上一条是把功能删了)', () => {
    expect(shouldShowJumpToLatest({
      distance: 2000, clientHeight: H, scrollHeight: 6000, shown: true, following: false,
    })).toBe(true);
  });

  it('不传 following 时按老规矩走,不因为缺参数就静默收掉', () => {
    expect(shouldShowJumpToLatest({
      distance: 2000, clientHeight: H, scrollHeight: 6000, shown: false,
    })).toBe(true);
  });
});
