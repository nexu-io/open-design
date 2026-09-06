import { describe, expect, it } from 'vitest';

import {
  ANCHOR_RELEASE_SLACK_PX,
  ANCHOR_TOP_PADDING,
  anchorReleasedByScroll,
  anchorScrollTop,
  anchorSpacerHeight,
  isNewTailUserTurn,
  maxScrollTopAfterAnchorSpacer,
  type AnchorGeometry,
} from '../../../src/runtime/chat/anchor-to-top';

/** 一屏 600px 的面板,刚发出的消息落在 4000px 处,下面还没有任何回复。 */
const freshTurn: AnchorGeometry = {
  clientHeight: 600,
  scrollHeight: 4_080,
  spacerHeight: 0,
  messageTopInContent: 4_000,
};

describe('尾部占位块:撑出「刚好够钉到顶」的空白', () => {
  it('回复还没来时,要补上差不多一整屏', () => {
    // 消息下面只有它自己那 80px,想让它顶到上沿还差 600 − 80 − 12 = 508。
    expect(anchorSpacerHeight(freshTurn)).toBe(508);
  });

  it('回复长出来之后单调收缩', () => {
    // `scrollHeight` 是含占位块的读数,所以真内容 4_380 + 占位块 508。
    const growing = { ...freshTurn, scrollHeight: 4_380 + 508, spacerHeight: 508 };
    expect(anchorSpacerHeight(growing)).toBe(208);
    const longer = { ...freshTurn, scrollHeight: 4_780 + 208, spacerHeight: 208 };
    expect(anchorSpacerHeight(longer)).toBe(0);
  });

  it('回复已经比一屏还长时不再预留', () => {
    const overflowing = { ...freshTurn, scrollHeight: 4_080 + 2_000, spacerHeight: 0 };
    expect(anchorSpacerHeight(overflowing)).toBe(0);
  });
});

describe('落点', () => {
  it('顶到上沿,上面留 ANCHOR_TOP_PADDING', () => {
    expect(anchorScrollTop(4_000)).toBe(4_000 - ANCHOR_TOP_PADDING);
    expect(ANCHOR_TOP_PADDING).toBe(12);
  });

  it('会话开头的消息滚不出负数', () => {
    expect(anchorScrollTop(4)).toBe(0);
  });

  /*
   * 这条恒等式是整套机制的地基:占位块正好撑到「落点 == 能滚到的最大位置」。
   * 它一旦不成立,浏览器的夹取就会把钉住的消息往下推,用户看到的就是「只置顶了一半」。
   */
  it('【不变量】占位块定完尺寸后,落点就是能滚到的最大位置', () => {
    for (const scrollHeight of [4_080, 4_200, 4_380, 4_600, 6_000]) {
      const geometry = { ...freshTurn, scrollHeight, spacerHeight: 0 };
      const settled = { ...geometry, spacerHeight: anchorSpacerHeight(geometry) };
      if (anchorSpacerHeight(geometry) === 0) {
        // 回复已经够长,顶端够得着,落点在最大位置之内即可。
        expect(maxScrollTopAfterAnchorSpacer(settled)).toBeGreaterThanOrEqual(
          anchorScrollTop(settled.messageTopInContent),
        );
        continue;
      }
      expect(maxScrollTopAfterAnchorSpacer(settled)).toBe(
        anchorScrollTop(settled.messageTopInContent),
      );
    }
  });
});

describe('松手判据', () => {
  it('落在钉住位置上不算滚开', () => {
    expect(
      anchorReleasedByScroll({ scrollTop: 3_988, messageTopInContent: 4_000 }),
    ).toBe(false);
  });

  it('容差之内的漂移不算滚开', () => {
    expect(
      anchorReleasedByScroll({
        scrollTop: 3_988 + ANCHOR_RELEASE_SLACK_PX,
        messageTopInContent: 4_000,
      }),
    ).toBe(false);
  });

  it('超过容差才算', () => {
    expect(
      anchorReleasedByScroll({
        scrollTop: 3_988 + ANCHOR_RELEASE_SLACK_PX + 1,
        messageTopInContent: 4_000,
      }),
    ).toBe(true);
  });

  /*
   * 平滑滚动为什么不能用:动画中间的每一帧都离落点很远。这里把「从旧底部滚到
   * 落点」的中间位置喂进去 —— 第一帧就被判成「用户滚开了」。
   */
  it('平滑动画的中间帧会被判成用户滚开 —— 所以这一跳必须瞬时', () => {
    const from = 3_400;
    const to = anchorScrollTop(4_000);
    const midway = Math.round(from + (to - from) * 0.25);
    expect(
      anchorReleasedByScroll({ scrollTop: midway, messageTopInContent: 4_000 }),
    ).toBe(true);
  });
});

describe('该不该钉顶:只认「尾条用户消息换人了」', () => {
  it('初次装载整篇转录不算新一轮', () => {
    expect(isNewTailUserTurn(undefined, 'u8')).toBe(false);
  });

  it('换会话之后的第一拍不算', () => {
    expect(isNewTailUserTurn(undefined, 'other-conversation-tail')).toBe(false);
  });

  it('空会话落定成 null 之后,第一条用户消息算新一轮(首页发起走这一格)', () => {
    expect(isNewTailUserTurn(null, 'u1')).toBe(true);
  });

  it('尾条换了就算 —— 不问它是从哪个入口发出来的', () => {
    expect(isNewTailUserTurn('u7', 'u8')).toBe(true);
  });

  it('助手流式期间尾条没变,不重复钉', () => {
    expect(isNewTailUserTurn('u8', 'u8')).toBe(false);
  });

  it('重试(不产生新用户消息)不算新一轮', () => {
    expect(isNewTailUserTurn('u8', 'u8')).toBe(false);
  });

  it('会话被清空不算', () => {
    expect(isNewTailUserTurn('u8', null)).toBe(false);
  });
});
