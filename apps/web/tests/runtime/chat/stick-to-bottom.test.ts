import { describe, expect, it } from 'vitest';
import { nextFollowIntent } from '../../../src/runtime/chat/stick-to-bottom';

describe('chat stick-to-bottom intent', () => {
  it('does not treat scroll anchoring during layout growth as a user scroll-down', () => {
    const intent = { following: false, escaped: true };
    const previous = { scrollTop: 1570, scrollHeight: 2000, clientHeight: 400 };
    // Content above the viewport grew by 30px. Native scroll anchoring moves
    // scrollTop by the same amount so the paragraph under the pointer stays put.
    const anchored = { scrollTop: 1600, scrollHeight: 2030, clientHeight: 400 };

    expect(nextFollowIntent(intent, previous, anchored)).toEqual(intent);
  });

  it('keeps the escape latch until a user scroll actually reaches the bottom', () => {
    const escaped = { following: false, escaped: true };
    const previous = { scrollTop: 1000, scrollHeight: 2000, clientHeight: 400 };
    const thirtyPixelsAboveBottom = {
      scrollTop: 1570,
      scrollHeight: 2000,
      clientHeight: 400,
    };

    const nearBottom = nextFollowIntent(escaped, previous, thirtyPixelsAboveBottom);
    expect(nearBottom).toEqual(escaped);

    // A sibling (Plan/queue/composer) disappearing can make those last 30px
    // vanish without another user gesture. That layout change must not rearm.
    const bottomAfterLayout = {
      scrollTop: 1570,
      scrollHeight: 2000,
      clientHeight: 430,
    };
    expect(nextFollowIntent(nearBottom, thirtyPixelsAboveBottom, bottomAfterLayout)).toEqual(
      escaped,
    );
  });

  it('does not rearm when scrollHeight shrink erases the final 30px', () => {
    const escaped = { following: false, escaped: true };
    const previous = { scrollTop: 1000, scrollHeight: 2000, clientHeight: 400 };
    const thirtyPixelsAboveBottom = {
      scrollTop: 1570,
      scrollHeight: 2000,
      clientHeight: 400,
    };

    const nearBottom = nextFollowIntent(escaped, previous, thirtyPixelsAboveBottom);
    expect(nearBottom).toEqual(escaped);

    // An in-log card/media row becoming 30px shorter puts this same scrollTop
    // at the mathematical bottom. There was no user scroll, so escaped stays.
    const bottomAfterLayout = {
      scrollTop: 1570,
      scrollHeight: 1970,
      clientHeight: 400,
    };
    expect(nextFollowIntent(nearBottom, thirtyPixelsAboveBottom, bottomAfterLayout)).toEqual(
      escaped,
    );
  });
});

/*
 * ── 恢复侧:内容长高不许把用户的下滚吞掉 ──────────────────────────────
 *
 * 逃逸有 wheel / touch 兜底,恢复一个都没有 —— 它只能走这里。原来这里要求
 * `layoutStable`(高度**完全**不变),而流式期间内容每一帧都在长,虚拟化重测量
 * 也会改 `scrollHeight`:用户滚回底部那一下只要撞上一个「内容也长了」的帧,
 * 整个事件就被丢掉,他白滚一次。
 *
 * 放宽的判据是「底部没有朝用户挪过来」(`maxScrollTop` 不减少),不是时间窗 ——
 * 下面两条一起钉住它放开了什么、又仍然挡住什么。
 */
describe('恢复跟随时的布局变化', () => {
  const escaped = { following: false, escaped: true } as const;
  const followed = { following: true, escaped: false };

  it('内容在同一帧长高,用户仍然滚到了底 —— 必须恢复跟随', () => {
    const previous = { scrollTop: 1000, scrollHeight: 2000, clientHeight: 400 };
    // 模型又吐了 300px,同一个 scroll 事件里用户也滚到了新的底部。
    // 内容长高只会把底部推远,所以「还是落在底上」只能是用户真滚了那么多。
    const grewAndReachedBottom = { scrollTop: 1900, scrollHeight: 2300, clientHeight: 400 };

    expect(nextFollowIntent(escaped, previous, grewAndReachedBottom)).toEqual(followed);
  });

  it('但内容变矮把最后一段吃掉时,即使位置也往下动了一点,仍然不许恢复', () => {
    /*
     * 这一条是上一条的**代价检查**。放宽 `layoutStable` 之后,「位置变大 + 落在底部」
     * 就不再自动等于「用户滚够了」:如果同一帧里内容**变矮**,底部会朝用户迎上来,
     * 用户只动了 10px 也可能被推到底。那不是他的意思,不许挂回跟随。
     */
    const previous = { scrollTop: 1000, scrollHeight: 2000, clientHeight: 400 };
    // 用户只往下动了 10px,而一张卡片同时矮了 590px —— 底部自己迎上来了。
    const shrankAndLanded = { scrollTop: 1010, scrollHeight: 1410, clientHeight: 400 };

    expect(nextFollowIntent(escaped, previous, shrankAndLanded)).toEqual(escaped);
  });

  it('视口变矮(队列/Plan 出现)把距离压没时也不算用户滚到底', () => {
    const previous = { scrollTop: 1000, scrollHeight: 2000, clientHeight: 400 };
    // composer 上方多了一条队列,可视区矮了 —— maxScrollTop 反而变大,底部远离,
    // 所以这一格是「允许恢复」的方向;但用户没滚到底,依旧不恢复。
    const shorterViewport = { scrollTop: 1010, scrollHeight: 2000, clientHeight: 320 };

    expect(nextFollowIntent(escaped, previous, shorterViewport)).toEqual(escaped);
  });
});

/*
 * ── 【不变量】自己发起的滚动一律瞬时 ──────────────────────────────────
 *
 * 判据分不出「谁发起的滚动」,平台也不打算让它分得出(`scrollend` 不带来源,
 * 程序触发的 scroll 事件 `isTrusted` 同样是 true)。所以它的正确性**依赖调用方**:
 * 自己写位置时,记下的基线必须和落点在同一拍里一致。
 *
 * 下面这条把「违反了会怎样」变成可执行的:先按预测记基线、再让浏览器一帧帧挪
 * (也就是 `behavior:'smooth'` 的形状),判据必然把中间帧读成用户上滚。
 * 它是给下一个想在 chat-log 上加平滑滚动的人看的 —— 加之前先 `release()`。
 */
describe('不变量:程序滚动的中间帧会被判成用户滚动', () => {
  it('基线记成预测终点、再回放动画中间帧 —— 跟随当场就没了', () => {
    const following = { following: true, escaped: false };
    // 调用方按预测把基线记成终点(question-form 定位就是这么做的)。
    const predictedDestination = { scrollTop: 1600, scrollHeight: 2000, clientHeight: 400 };
    // 浏览器这才开始动,中间位置全在终点的另一侧。
    const midAnimation = { scrollTop: 1200, scrollHeight: 2000, clientHeight: 400 };

    expect(nextFollowIntent(following, predictedDestination, midAnimation)).toEqual({
      following: false,
      escaped: true,
    });
  });

  it('瞬时滚动没有这个窗口:落点就是基线,判据什么都不改', () => {
    const following = { following: true, escaped: false };
    const landed = { scrollTop: 1600, scrollHeight: 2000, clientHeight: 400 };

    expect(nextFollowIntent(following, landed, landed)).toEqual(following);
  });
});
