/**
 * 反向对照:把流水底部的预留从 20px 抬到 52px,**不能**让「新消息滚到屏幕最顶」
 * 那块动态空白跟着一起变大。
 *
 * ── 为什么专门给这一条写测试 ───────────────────────────────────────────
 * 底部空间其实是**两块叠起来**的:
 *
 *     底部空间 = `.chat-log` 的 padding-bottom(静态地板,给药丸让位)
 *              + `.chat-log-tail-spacer` 的高度(动态顶补,给 anchor-to-top 用)
 *
 * 用户同一天报了方向相反的两条:滚到底时空白**不够**(药丸压字),
 * 和刚发完消息时空白**过多**。所以「抬高地板」必须先证明它不会把顶补也一起抬高,
 * 否则修一条会加重另一条。
 *
 * ── 为什么它天然不会 ───────────────────────────────────────────────────
 * `contentBelowAnchor` 是从 `scrollHeight` 减出来的,而 `scrollHeight` **含**容器内距。
 * 地板抬高 32px ⇒ `scrollHeight` +32 ⇒ `contentBelowAnchor` +32 ⇒ 占位块 −32。
 * 两块加起来是常数 —— 顶补自己把地板的增量吃掉了。
 *
 * 这条恒等式只在 anchor 还活着(占位块仍在被重算)时成立;anchor 被用户滚动释放之后
 * 占位块会冻住(`ChatPane` 的 onScroll 明写「We do NOT collapse the tail spacer」),
 * 那一路见报告里的待拍板项,不在这条测试的范围内。
 */
import { describe, expect, it } from 'vitest';
import {
  anchorScrollTop,
  anchorSpacerHeight,
  maxScrollTopAfterAnchorSpacer,
} from '../../../src/runtime/chat/anchor-to-top';

/**
 * 真机量到的一档:viewport 476,内容 2905(不含容器内距)。
 *
 * 被钉的那条消息取 2800 —— 它下面只剩 105px 真内容,占位块因此是**活的**
 * (回复才刚开始流)。这正是这条恒等式唯一有话可说的区间:内容长满之后
 * 占位块两档都会夹到 0,那时候比什么都相等,测了等于没测。
 */
const CLIENT_HEIGHT = 476;
const CONTENT_WITHOUT_PADDING = 2905;
const MESSAGE_TOP = 2800;

const OLD_PAD = 20;
const NEW_PAD = 52;

function geometryFor(padBottom: number, spacerHeight: number) {
  return {
    clientHeight: CLIENT_HEIGHT,
    // `el.scrollHeight` 含容器内距 —— 地板就是这样进到这笔账里的
    scrollHeight: CONTENT_WITHOUT_PADDING + padBottom + spacerHeight,
    spacerHeight,
    messageTopInContent: MESSAGE_TOP,
  };
}

describe('W95 反向 · 抬高药丸预留不会撑大 anchor-to-top 的空白', () => {
  it('占位块把地板的增量正好吃掉:两块之和不变', () => {
    const before = anchorSpacerHeight(geometryFor(OLD_PAD, 0));
    const after = anchorSpacerHeight(geometryFor(NEW_PAD, 0));

    // 顶补正好少 32,等于地板多出来的 32
    expect(before - after).toBe(NEW_PAD - OLD_PAD);
    // 底部总空间(地板 + 顶补)分毫不差
    expect(OLD_PAD + before).toBe(NEW_PAD + after);
  });

  it('「顶到屏幕最上」的落点不受影响 —— 恒等式仍旧成立', () => {
    for (const pad of [OLD_PAD, NEW_PAD]) {
      const spacer = anchorSpacerHeight(geometryFor(pad, 0));
      const geometry = geometryFor(pad, spacer);
      expect(maxScrollTopAfterAnchorSpacer(geometry)).toBe(anchorScrollTop(MESSAGE_TOP));
    }
  });

  it('内容长满之后两档都收到 0 —— 此时底部只剩地板,正是药丸要的那块', () => {
    const tall = CLIENT_HEIGHT * 4;
    expect(anchorSpacerHeight({
      clientHeight: CLIENT_HEIGHT,
      scrollHeight: MESSAGE_TOP + tall + OLD_PAD,
      spacerHeight: 0,
      messageTopInContent: MESSAGE_TOP,
    })).toBe(0);
    expect(anchorSpacerHeight({
      clientHeight: CLIENT_HEIGHT,
      scrollHeight: MESSAGE_TOP + tall + NEW_PAD,
      spacerHeight: 0,
      messageTopInContent: MESSAGE_TOP,
    })).toBe(0);
  });

  /**
   * 防真空:这个量法必须**看得见**地板的变化。
   * 如果 `anchorSpacerHeight` 压根不理会 `scrollHeight`,上面那条「差值 = 32」
   * 会因为两边都算出同一个数而假绿 —— 这里先证明它确实随 scrollHeight 变。
   */
  it('量法能看见地板:占位块确实随 scrollHeight 单调收缩', () => {
    const a = anchorSpacerHeight(geometryFor(OLD_PAD, 0));
    const b = anchorSpacerHeight(geometryFor(OLD_PAD + 100, 0));
    expect(a).toBeGreaterThan(b);
    expect(a - b).toBe(100);
  });
});
