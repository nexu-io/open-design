import { describe, expect, it } from 'vitest';
import {
  isCompositorSnapBack,
  nextFollowIntent,
  upwardGestureCanEscapeBottom,
} from '../../../src/runtime/chat/stick-to-bottom';

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

/*
 * ── 手势那一侧:位移为 0 的手势不算「用户滑走了」 ─────────────────────
 *
 * 逃逸有两条路。`nextFollowIntent` 是事后的(先有位移,再判方向),而快速流式下
 * 那条路会断:同一帧里我们写过 `scrollTop`,浏览器就把这一次滚轮滚动整个取消掉,
 * 连 scroll 事件都不发。所以调用方还挂了 wheel / touch,在位移发生**之前**松手。
 *
 * 那一侧拿不到位移,只能拿手势 —— 于是它必须自己回答「这一格有没有可能真的
 * 离开底部」。答不出来就会把「手势发生了但一个像素都没动」当成挣脱:屏幕上纹丝
 * 不动,跟随却已经松了,后面的流式输出全跑到屏幕外(用户 2026-09-07)。
 */
describe('往上的手势有没有可能挣脱', () => {
  it('内容比视口短:滚到哪儿都在底部,不可能挣脱', () => {
    expect(
      upwardGestureCanEscapeBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 }),
    ).toBe(false);
  });

  it('内容恰好一屏:同样不可能', () => {
    expect(
      upwardGestureCanEscapeBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 }),
    ).toBe(false);
  });

  it('余量小到落在贴底容差里:滚到顶仍然算「在底部」,不可能挣脱', () => {
    /*
     * 这一条是真机上「一屏装得下的对话」的常态,不是构造出来的边角:
     * 打包版 `0.21.2-beta.1` 采样,「刚进会话、内容很少」108 次样本几何恒定
     * 589 / 583 —— 余量 **6px**,产品报的那次就落在这儿。
     * 6 也在下面这一排里。
     */
    for (const travel of [1, 3, 6, 8]) {
      expect(
        upwardGestureCanEscapeBottom({
          scrollTop: travel,
          scrollHeight: 400 + travel,
          clientHeight: 400,
        }),
      ).toBe(false);
    }
  });

  it('已经在顶端:往上的手势位移恒为 0,不可能挣脱', () => {
    expect(
      upwardGestureCanEscapeBottom({ scrollTop: 0, scrollHeight: 2000, clientHeight: 400 }),
    ).toBe(false);
  });

  it('反面:余量超过容差且不在顶端 —— 这一格必须放行', () => {
    // 差一个像素就翻面:容差是 8,余量 9 就能造出「离底 9px」= 挣脱。
    expect(
      upwardGestureCanEscapeBottom({ scrollTop: 9, scrollHeight: 409, clientHeight: 400 }),
    ).toBe(true);
    // 正在跟随的长会话贴在底上 —— 快速流式时的逃逸路径,一格都不许挡。
    expect(
      upwardGestureCanEscapeBottom({ scrollTop: 1600, scrollHeight: 2000, clientHeight: 400 }),
    ).toBe(true);
  });
});

/*
 * ── 合成器夹取不是用户上滑 ────────────────────────────────────────────
 *
 * 真机诊断包(Electron 41 / Chromium 146,用户客户端):
 *
 *   scrollTop 245.5   layoutMax 718   scrollHeight 1307   unreachablePx 472.5
 *
 * 点【滚动到最新】→ `scrollTo({top:1307})` → 位置落在 718.5(布局的真底部);
 * 用户碰一下滚轮,合成器把它甩回自己那份陈旧上限 245.5。`__chatScrollFreeze`
 * 的写入拦截全程武装、零丢弃、覆盖 `scrollTop`/`scrollTo`/`scrollBy`/
 * `scrollIntoView` 四个 API,而这 3.8 秒里**零条 JS 写入记录** —— 没有任何 JS
 * 移过它,是合成器干的。
 *
 * 这一段位移「位置变小 + `scrollHeight` 没变」两条同时成立,正好命中判据里
 * 「用户上滑」的定义,于是每一次夹取都把自动跟随静默关掉。
 *
 * ⚠️ 下面**反向那几条比正向这条更重要**:修法只要多判一次,就是把跟随焊死。
 * 判据只由「这段窗口里的滚轮只朝下」授权,别的一律照旧当成用户上滑。
 */
describe('合成器夹取 vs 用户上滑', () => {
  const following = { following: true, escaped: false } as const;
  const escaped = { following: false, escaped: true };

  // 真机那一组数:clientHeight = 1307 − 718 = 589,布局能滚到 718。
  const atLayoutBottom = { scrollTop: 718.5, scrollHeight: 1307, clientHeight: 589 };
  const clampedToStaleCeiling = { scrollTop: 245.5, scrollHeight: 1307, clientHeight: 589 };

  it('朝下的滚轮把位置甩到上面去 —— 跟随不许关', () => {
    expect(
      nextFollowIntent(following, atLayoutBottom, clampedToStaleCeiling, {
        downwardEvents: 1,
        upwardEvents: 0,
        atScrollTop: 718.5,
      }),
    ).toEqual(following);
  });

  /*
   * ── 反向锚点 ───────────────────────────────────────────────────────
   * 一模一样的两份几何,只换滚轮方向。用户上滑必须照旧松手。
   */
  it('【反向】同样的位移,滚轮朝上 —— 必须松手', () => {
    expect(
      nextFollowIntent(following, atLayoutBottom, clampedToStaleCeiling, {
        downwardEvents: 0,
        upwardEvents: 1,
        atScrollTop: 718.5,
      }),
    ).toEqual(escaped);
  });

  it('【反向】根本没有滚轮(拖滚动条 / 键盘 / 触摸)—— 必须松手', () => {
    expect(
      nextFollowIntent(following, atLayoutBottom, clampedToStaleCeiling, {
        downwardEvents: 0,
        upwardEvents: 0,
        atScrollTop: 718.5,
      }),
    ).toEqual(escaped);
    // 调用方压根不传见证时,行为和这个参数出现之前一模一样。
    expect(nextFollowIntent(following, atLayoutBottom, clampedToStaleCeiling)).toEqual(escaped);
    expect(nextFollowIntent(following, atLayoutBottom, clampedToStaleCeiling, null)).toEqual(
      escaped,
    );
  });

  it('【反向】一次轻扫里掉过头:有一格朝上就作废 —— 必须松手', () => {
    /*
     * 触控板一次轻扫在两个 scroll 事件之间能吐十几格,中途完全可能上下都有。
     * 净方向朝下也不行:只要用户要过一次上滑,这一段就归他。
     */
    expect(
      nextFollowIntent(following, atLayoutBottom, clampedToStaleCeiling, {
        downwardEvents: 9,
        upwardEvents: 1,
        atScrollTop: 718.5,
      }),
    ).toEqual(escaped);
  });

  it('【反向】朝下的滚轮把位置往下带 —— 恢复跟随这条路一格都没挡', () => {
    const away = { scrollTop: 200, scrollHeight: 1307, clientHeight: 589 };
    expect(
      nextFollowIntent(escaped, away, atLayoutBottom, {
        downwardEvents: 3,
        upwardEvents: 0,
        atScrollTop: 200,
      }),
    ).toEqual(following);
  });
});

describe('isCompositorSnapBack', () => {
  const previous = { scrollTop: 718.5, scrollHeight: 1307, clientHeight: 589 };
  const clamped = { scrollTop: 245.5, scrollHeight: 1307, clientHeight: 589 };
  const downOnly = { downwardEvents: 1, upwardEvents: 0, atScrollTop: 718.5 };

  it('朝下的滚轮 + 位置反而往上跑 + 布局没动 = 夹取', () => {
    expect(isCompositorSnapBack(previous, clamped, downOnly)).toBe(true);
  });

  it('没有见证 / 见证里有朝上的一格 / 一格朝下的都没有 —— 都不是', () => {
    expect(isCompositorSnapBack(previous, clamped, null)).toBe(false);
    expect(isCompositorSnapBack(previous, clamped, undefined)).toBe(false);
    expect(
      isCompositorSnapBack(previous, clamped, {
        downwardEvents: 1,
        upwardEvents: 1,
        atScrollTop: 718.5,
      }),
    ).toBe(false);
    expect(
      isCompositorSnapBack(previous, clamped, {
        downwardEvents: 0,
        upwardEvents: 0,
        atScrollTop: 718.5,
      }),
    ).toBe(false);
  });

  it('内容动过就不是这个现象 —— 那种位移归 layoutStable 管', () => {
    expect(
      isCompositorSnapBack(previous, { ...clamped, scrollHeight: 1400 }, downOnly),
    ).toBe(false);
    expect(isCompositorSnapBack(previous, { ...clamped, clientHeight: 600 }, downOnly)).toBe(
      false,
    );
  });

  it('位移方向朝下、或小到落在贴底容差里 —— 都不是', () => {
    // 起点换成 245.5,条子也跟着换 —— 否则这一条会因为「位置对不上」而通过,
    // 量到的就不是方向那一条判据了。
    expect(
      isCompositorSnapBack(clamped, previous, { ...downOnly, atScrollTop: 245.5 }),
    ).toBe(false);
    // 8px 是容差本身,要**超过**才算。高 DPI / 分数缩放下的亚像素抖动全在这以内。
    expect(
      isCompositorSnapBack(previous, { ...previous, scrollTop: 710.5 }, downOnly),
    ).toBe(false);
    expect(
      isCompositorSnapBack(previous, { ...previous, scrollTop: 710.4 }, downOnly),
    ).toBe(true);
  });
  /*
   * ── 条子只解释它记下的那一段 ──────────────────────────────────────
   *
   * nettee 在 #7898 上点名的过度抑制,结构性的那一半就堵在这里:一格朝下的滚轮
   * 落在已经到底的日志上,位置不动、不发 scroll 事件,条子没人用掉;等基线被别的
   * 东西挪走之后(切会话、我们自己写 `scrollTop`),它还留着,就会去解释一段和它
   * 毫无关系的位移 —— 一次真实的用户位置变化被判成夹取,跟随焊死。
   */
  it('条子记的位置不是这一段位移的起点 —— 一律不算夹取', () => {
    // 差 0.5px 都不行:对不上就说明中间有别的东西动过这个滚动条。
    for (const atScrollTop of [718, 719, 0, 245.5, 1307]) {
      expect(
        isCompositorSnapBack(previous, clamped, { ...downOnly, atScrollTop }),
      ).toBe(false);
    }
    // 对得上才算 —— 正向那一半不许被这条顺手废掉。
    expect(isCompositorSnapBack(previous, clamped, { ...downOnly, atScrollTop: 718.5 })).toBe(
      true,
    );
  });
});
