// @vitest-environment jsdom
/**
 * 翻面不许和限高互相喂输入 —— 否则每帧一翻,肉眼可见闪烁。
 *
 * 2026-08-27 真机(CDP 连采 30 帧,`data-placement` + rect + computed style):
 *
 *     below | top=514 | height=337 | max-height: none
 *     above | top=298 | height=185 | max-height: 185.469px
 *     序列:below, above, below, above, below, above …  每帧一翻
 *
 * 把这两个状态代回去解,只有一组几何自洽:锚点 [489,508]、夹取框
 * `bottom = 707.469`(聊天流下缘)、自然高度 337、gap 6、PAD 8。环是这么转的:
 *
 *  1. 在 `below`:没限高 → 量到的高度是**自然的 337** → 下面只剩 193 → 翻 `above`
 *  2. 在 `above`:限高 185.469 生效 → 量到的高度变成 **185** → 下面 193 塞得下了
 *     → 判回 `below` → 限高撤掉 → 高度弹回 337 → 回到 1
 *
 * 根子是判据取的是**被自己改过的量**:`placement` 决定 `maxHeight`,
 * `maxHeight` 又改变了下一轮 `placement` 的输入。和上一轮修的横向 bug 是同一族
 * (那次是「记的是我告诉 DOM 的值」,这次是「拿被自己改过的量做决策」)。
 *
 * ⚠️ 这一组的断言形状很关键:**断言收敛,不断言具体值**。振荡的每一帧都有一个
 * 「看起来正确」的 placement,单帧断言照样绿 —— 第一版红测就是这么假绿的。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AnchoredMenuShell } from '../../../src/components/chat/AnchoredMenuShell';

const MENU_CLS = 'share-menu-popover chrome-unified-popover';
const WRAP_CLS = 'share-menu chrome-share-menu chrome-share-menu--unified';
const ANCHOR_ID = 'publish:x.html';
const GAP = 6;

function box(left: number, top: number, width: number, height: number): DOMRect {
  const b = { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height };
  return { ...b, toJSON: () => b } as DOMRect;
}

let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1770, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 861, configurable: true });
  originalRect = HTMLElement.prototype.getBoundingClientRect;
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  cleanup();
  document.querySelectorAll('[data-artifact-anchor]').forEach((el) => el.remove());
  document.querySelectorAll('.scroller').forEach((el) => el.remove());
});

/**
 * 忠实模拟真实排版里参与这个环的那几条:
 *  · 菜单高度 = min(自然高度, 已生效的 maxHeight)   ← 限高真的会改变量到的高度
 *  · 菜单纵向位置随 `data-placement` 走(既有 CSS 的 `top` / `bottom` 两档)
 *  · `scrollHeight` 始终是**自然内容高度** —— 被限高之后它仍旧是 337,
 *    这正是「不受限高影响的高度」的来源
 */
function mount(opts: {
  anchor: { top: number; height: number; left?: number; width?: number };
  clip: { top: number; bottom: number; left?: number; right?: number };
  naturalHeight: number;
  naturalWidth?: number;
}) {
  const aLeft = opts.anchor.left ?? 600;
  const aWidth = opts.anchor.width ?? 58;
  const cLeft = opts.clip.left ?? 0;
  const cRight = opts.clip.right ?? 1770;
  const natW = opts.naturalWidth ?? 248;

  const scroller = document.createElement('div');
  scroller.className = 'scroller';
  scroller.style.overflowY = 'auto';
  scroller.getBoundingClientRect = () => box(cLeft, opts.clip.top, cRight - cLeft, opts.clip.bottom - opts.clip.top);
  document.body.appendChild(scroller);

  const anchor = document.createElement('button');
  anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
  anchor.getBoundingClientRect = () => box(aLeft, opts.anchor.top, aWidth, opts.anchor.height);
  scroller.appendChild(anchor);

  const aBottom = opts.anchor.top + opts.anchor.height;

  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('share-menu-popover')) {
      const capH = Number.parseFloat(this.style.maxHeight);
      const height = Number.isFinite(capH) ? Math.min(opts.naturalHeight, capH) : opts.naturalHeight;
      const capW = Number.parseFloat(this.style.maxWidth);
      const width = Number.isFinite(capW) ? Math.min(natW, capW) : natW;
      const above = this.getAttribute('data-placement') === 'above';
      const top = above ? opts.anchor.top - GAP - height : aBottom + GAP;
      // `right: 0` 贴着包裹盒右缘
      const host = this.parentElement as HTMLElement | null;
      const hostLeft = Number.parseFloat(host?.style.left ?? String(aLeft)) || aLeft;
      return box(hostLeft + aWidth - width, top, width, height);
    }
    return originalRect.call(this);
  };

  render(
    <AnchoredMenuShell anchorId={ANCHOR_ID} wrapperClassName={WRAP_CLS} className={MENU_CLS} testId="m">
      <button type="button">row</button>
    </AnchoredMenuShell>,
  );
  const menu = screen.getByTestId('m');
  // 自然内容高度:限高之后它**不变** —— 这就是判据该取的那个量
  Object.defineProperty(menu, 'scrollHeight', { get: () => opts.naturalHeight, configurable: true });
  Object.defineProperty(menu, 'scrollWidth', { get: () => natW, configurable: true });
  return menu;
}

/** 连跑 N 轮重算,记下每一轮的 (placement, maxHeight)。 */
function sample(menu: HTMLElement, rounds = 12): string[] {
  const seen: string[] = [];
  for (let i = 0; i < rounds; i++) {
    act(() => { window.dispatchEvent(new Event('resize')); });
    seen.push(`${menu.getAttribute('data-placement')}|${menu.style.maxHeight || 'none'}`);
  }
  return seen;
}

/* 真机那一组几何 */
const REAL = {
  anchor: { top: 489, height: 19 },
  clip: { top: 289, bottom: 707.469 },
  naturalHeight: 337,
};

describe('翻面必须收敛,不许每帧一翻', () => {
  it('真机那组几何:连续 12 轮重算后状态不再变化', () => {
    const menu = mount(REAL);
    const seen = sample(menu);
    const tail = seen.slice(-5);
    expect(
      new Set(tail).size,
      `后 5 轮仍在变:${JSON.stringify(seen)}`,
    ).toBe(1);
  });

  it('整个采样序列最多只出现两种状态之一次切换(收敛而非往复)', () => {
    const menu = mount(REAL);
    const seen = sample(menu);
    // 允许开头一两轮从估值过渡到实测,但不许来回翻
    let flips = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) flips++;
    // 面板挂上之后就该一步到位:**一次都不许变**。允许「先错一帧再改对」等于
    // 允许一帧的跳动,而竖向预算按锚点算之后本来就不需要那一帧。
    expect(flips, `状态切换了 ${flips} 次,序列:${JSON.stringify(seen)}`).toBe(0);
  });

  /**
   * 收敛到**哪一边**也要钉住。自然高度 337 塞不进下方的 193,所以正确答案是
   * `above`;而如果判据退回「被限高改小之后的高度」,它会收敛到 `below` ——
   * 一样不振荡,却是错的落位。只断言「收敛」照样绿,所以这一条单独拎出来。
   */
  it('收敛到的是**正确的那一边**:自然高度塞不下就得在上面', () => {
    const menu = mount(REAL);
    sample(menu);
    expect(
      menu.getAttribute('data-placement'),
      '收敛到了 below —— 判据多半又取了被限高改过的高度',
    ).toBe('above');
    // 而且限高要用**上方**的预算(锚点上缘 − 夹取框上缘 − 余量),
    // 不是下方那份(那是从面板旧位置算出来的,差一帧就差一个数)
    const expected = REAL.anchor.top - GAP - REAL.clip.top - 8;
    expect(Number.parseFloat(menu.style.maxHeight)).toBeCloseTo(expected, 1);
  });
});

describe('反向对照:翻面本身不许被关掉', () => {
  it('下面塞得下 → 稳定停在 below,且不限高', () => {
    const menu = mount({
      anchor: { top: 100, height: 19 },
      clip: { top: 0, bottom: 861 },
      naturalHeight: 200,
    });
    const seen = sample(menu);
    expect(new Set(seen.slice(-5)).size, `没收敛:${JSON.stringify(seen)}`).toBe(1);
    expect(menu.getAttribute('data-placement')).toBe('below');
    expect(menu.style.maxHeight, '放得下却限了高').toBeFalsy();
  });

  it('下面完全塞不下、上面很宽敞 → 稳定翻到 above(证明翻面还活着)', () => {
    const menu = mount({
      // 锚点贴近夹取框下缘:下面只剩 40,上面有 500
      anchor: { top: 560, height: 19 },
      clip: { top: 60, bottom: 620 },
      naturalHeight: 300,
    });
    const seen = sample(menu);
    expect(new Set(seen.slice(-5)).size, `没收敛:${JSON.stringify(seen)}`).toBe(1);
    expect(menu.getAttribute('data-placement'), '该翻上去却没翻 —— 修复把翻面关掉了').toBe('above');
  });

  it('两边都塞不下 → 仍然收敛(挑空间大的那边并限高)', () => {
    const menu = mount({
      anchor: { top: 300, height: 19 },
      clip: { top: 200, bottom: 460 },
      naturalHeight: 400,
    });
    const seen = sample(menu);
    expect(new Set(seen.slice(-5)).size, `两边都不够时来回跳:${JSON.stringify(seen)}`).toBe(1);
    expect(menu.style.maxHeight, '塞不下却不限高').toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * 横轴同样不许成环
 * ------------------------------------------------------------------ *
 * 限宽也会改变量到的宽度,所以判据同样必须取自然宽度。这一条比竖轴更隐蔽:
 * `.chrome-unified-popover` 是 `width: max-content`,一旦被 `max-width` 夹住,
 * 内容会**重新折行**,用掉的宽度往往**比上限还小**(折完之后最宽那行的宽度)。
 *
 * 于是拿「当前宽度」当判据就成环:
 *   限宽 244 → 折行后实际用了 230 → 「230 < 244,不用限了」→ 撤掉限宽
 *   → 宽度弹回 300 → 又超了 → 再限 244 → …
 *
 * `scrollWidth` 不随 `max-width` 变,拿它判就没有这个环。
 * (Floating UI 维护者对横轴给的另一个建议是给浮层钉死 `width: max-content` ——
 *  我们的 CSS 本来就有,但那挡的是「换边时宽度变化」,挡不住这里这个。)
 */
describe('横轴:限宽判据也必须取自然宽度', () => {
  it('限宽后内容折行变窄,不许把限宽撤掉再加回来', () => {
    const NAT_W = 300;
    const REFLOWED = 230; // 折行之后实际用掉的宽度,比上限小
    const scroller = document.createElement('div');
    scroller.className = 'scroller';
    scroller.style.overflowX = 'hidden';
    // 夹取框只有 260 宽 → 可用 244
    scroller.getBoundingClientRect = () => box(0, 0, 260, 861);
    document.body.appendChild(scroller);
    const anchor = document.createElement('button');
    anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
    anchor.getBoundingClientRect = () => box(200, 100, 58, 21);
    scroller.appendChild(anchor);

    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('share-menu-popover')) {
        const capW = Number.parseFloat(this.style.maxWidth);
        // 被限宽时内容折行,用掉的宽度比上限还小 —— 这是 `width: max-content` 的常态
        const width = Number.isFinite(capW) ? Math.min(REFLOWED, capW) : NAT_W;
        const host = this.parentElement as HTMLElement | null;
        const hostLeft = Number.parseFloat(host?.style.left ?? '200') || 200;
        return box(hostLeft + 58 - width, 127, width, 150);
      }
      return originalRect.call(this);
    };

    render(
      <AnchoredMenuShell anchorId={ANCHOR_ID} wrapperClassName={WRAP_CLS} className={MENU_CLS} testId="m">
        <button type="button">row</button>
      </AnchoredMenuShell>,
    );
    const menu = screen.getByTestId('m');
    Object.defineProperty(menu, 'scrollWidth', { get: () => NAT_W, configurable: true });
    Object.defineProperty(menu, 'scrollHeight', { get: () => 150, configurable: true });

    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      act(() => { window.dispatchEvent(new Event('resize')); });
      seen.push(menu.style.maxWidth || 'none');
    }
    expect(new Set(seen).size, `限宽在撤销和加回之间来回:${JSON.stringify(seen)}`).toBe(1);
    expect(seen[seen.length - 1], '根本没限宽').not.toBe('none');
  });
});
