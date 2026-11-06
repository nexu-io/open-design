/**
 * 松手之后那块预留空白怎么收 —— **判据本身的不变量**。
 *
 * 组件那一层(`tests/components/chat-anchor-to-top.test.tsx` 的 W105 组)钉的是
 * 「一轮真实交互跑下来结果对不对」;这里钉的是三条**跨全部几何都成立**的性质,
 * 因为方案 B 最怕的两个坑都不是某一条路径的问题,而是判据本身的问题:
 *
 *   · 阈值边界上反复微滚,空白会不会一涨一缩;
 *   · 收缩会不会把画面「跳」走。
 *
 * 这两条只能对着一片几何扫过去证,单点用例证不了。
 */
import { describe, expect, it } from 'vitest';

import {
  TAIL_SPACER_COLLAPSE_STEP_PX,
  TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX,
  nextCollapsingTailSpacerHeight,
  shouldStartCollapsingTailSpacer,
  tailSpacerBlankOnScreen,
} from '../../../src/runtime/chat/anchor-to-top';
import { shouldShowJumpToLatest } from '../../../src/runtime/chat/jump-to-latest';

/**
 * 收缩这一帧会把画面挪动多少。
 *
 * 浏览器只在 `scrollTop` 超出新的最大可滚位置时才夹取,夹取量正好是
 * 「收缩量 − 离底距离」。这就是用户眼里的「跳」。
 */
function viewportShift(spacerHeight: number, next: number, distanceFromBottom: number): number {
  return Math.max(0, spacerHeight - next - Math.max(0, distanceFromBottom));
}

/** 扫一片有代表性的几何,而不是挑几个好看的点。 */
function geometrySweep() {
  const out: { spacerHeight: number; targetHeight: number; distanceFromBottom: number }[] = [];
  for (const spacerHeight of [0, 8, 52, 53, 120, 215, 301, 508, 588]) {
    for (const targetHeight of [0, 8, 52, 200, 508, 900]) {
      for (const distanceFromBottom of [0, 1, 8, 24, 40, 52, 96, 150, 320, 522, 800]) {
        out.push({ spacerHeight, targetHeight, distanceFromBottom });
      }
    }
  }
  return out;
}

describe('起手门槛:空白得真的戳进视口', () => {
  it('露出来正好 52px 不算 —— 门槛不含,这一条就是边界的护栏', () => {
    // 占位块 300,离底 248 ⇒ 屏幕上露出 52。
    expect(
      shouldStartCollapsingTailSpacer({
        spacerHeight: 300,
        targetHeight: 0,
        distanceFromBottom: 248,
      }),
    ).toBe(false);
    // 再往下 1px 就够了。
    expect(
      shouldStartCollapsingTailSpacer({
        spacerHeight: 300,
        targetHeight: 0,
        distanceFromBottom: 247,
      }),
    ).toBe(true);
  });

  it('空白整块在折线以下(离底 ≥ 占位块)一律不起手 —— 用户在中间读东西', () => {
    for (const distanceFromBottom of [508, 560, 800, 5_000]) {
      expect(
        shouldStartCollapsingTailSpacer({
          spacerHeight: 508,
          targetHeight: 8,
          distanceFromBottom,
        }),
      ).toBe(false);
    }
  });

  it('目标不比现状小就不起手(内容变矮时不许把空白涨回去)', () => {
    expect(
      shouldStartCollapsingTailSpacer({
        spacerHeight: 200,
        targetHeight: 400,
        distanceFromBottom: 0,
      }),
    ).toBe(false);
  });

  /*
   * 和「回到最新」浮标**可证互斥**。
   *
   * 浮标的距离读数把占位块扣掉了(`ChatPane.readContentSample`),而起手要求
   * 离底距离 < 占位块高度 —— 两个条件对着同一副几何时,浮标算出来的距离必然是 0。
   * 所以不会出现「一边告诉用户下面还有东西可回,一边把下面那块空白收掉」。
   */
  it('起手成立的那一刻,「回到最新」浮标必定不在场', () => {
    for (const geometry of geometrySweep()) {
      if (!shouldStartCollapsingTailSpacer(geometry)) continue;
      const contentDistance = Math.max(
        0,
        geometry.distanceFromBottom - geometry.spacerHeight,
      );
      for (const shown of [false, true]) {
        expect(
          shouldShowJumpToLatest({
            distance: contentDistance,
            clientHeight: 600,
            scrollHeight: 5_000,
            shown,
            following: false,
          }),
        ).toBe(false);
      }
    }
  });
});

describe('收缩的两条不变量', () => {
  it('只减不增 —— 任何几何下都不会把空白还回去', () => {
    for (const geometry of geometrySweep()) {
      expect(nextCollapsingTailSpacerHeight(geometry)).toBeLessThanOrEqual(
        geometry.spacerHeight,
      );
      expect(nextCollapsingTailSpacerHeight(geometry)).toBeGreaterThanOrEqual(
        Math.min(geometry.targetHeight, geometry.spacerHeight),
      );
    }
  });

  it('单帧画面位移永远不超过一格预算 —— 这就是「往下滚不会跳」', () => {
    for (const geometry of geometrySweep()) {
      const next = nextCollapsingTailSpacerHeight(geometry);
      expect(
        viewportShift(geometry.spacerHeight, next, geometry.distanceFromBottom),
      ).toBeLessThanOrEqual(TAIL_SPACER_COLLAPSE_STEP_PX);
    }
  });

  it('一格预算比一格触控板滚动(~40px)还小 —— 收缩跑不赢用户自己的手', () => {
    expect(TAIL_SPACER_COLLAPSE_STEP_PX).toBeLessThan(40);
  });

  it('闩上之后一路收到位,不会停在半路', () => {
    let spacerHeight = 508;
    const targetHeight = 8;
    const trace = [spacerHeight];
    for (let frame = 0; frame < 200 && spacerHeight !== targetHeight; frame += 1) {
      // 贴着底看(离底 0)—— 最不利的一侧:每一帧只能收一格。
      spacerHeight = nextCollapsingTailSpacerHeight({
        spacerHeight,
        targetHeight,
        distanceFromBottom: 0,
      });
      trace.push(spacerHeight);
    }
    expect(spacerHeight).toBe(targetHeight);
    // 500px 在 21 帧里收完,约 350ms —— 和本仓库 UI 动效的时长同量级。
    expect(trace.length - 1).toBe(21);
    for (let i = 1; i < trace.length; i += 1) {
      expect(trace[i]!).toBeLessThan(trace[i - 1]!);
    }
  });

  it('离底越远收得越狠,而画面一动不动 —— 中间读内容的人看不见这件事', () => {
    // 空白整块在折线以下:一帧收完 500px,画面零位移。
    expect(
      nextCollapsingTailSpacerHeight({
        spacerHeight: 508, targetHeight: 8, distanceFromBottom: 520,
      }),
    ).toBe(8);
    expect(viewportShift(508, 8, 520)).toBe(0);
    // 只露出一点点时也一帧收完,而画面只挪了 20px —— 仍在一格预算之内。
    expect(
      nextCollapsingTailSpacerHeight({
        spacerHeight: 508, targetHeight: 8, distanceFromBottom: 480,
      }),
    ).toBe(8);
    expect(viewportShift(508, 8, 480)).toBe(20);
  });
});

describe('屏幕上露出来多少空白', () => {
  it('贴着底时整块都在眼前,离得越远露得越少,过了就是 0', () => {
    expect(tailSpacerBlankOnScreen({
      spacerHeight: 301, targetHeight: 0, distanceFromBottom: 0,
    })).toBe(301);
    expect(tailSpacerBlankOnScreen({
      spacerHeight: 301, targetHeight: 0, distanceFromBottom: 200,
    })).toBe(101);
    expect(tailSpacerBlankOnScreen({
      spacerHeight: 301, targetHeight: 0, distanceFromBottom: 522,
    })).toBe(0);
  });

  it('门槛这个数就是药丸让位 —— 不是拍出来的', () => {
    expect(TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX).toBe(52);
  });
});
