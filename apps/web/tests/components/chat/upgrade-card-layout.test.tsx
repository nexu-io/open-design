// @vitest-environment jsdom
/**
 * 升级卡(组件 18)的**版式契约** —— PR #7170 把 CTA 从卡头搬到了底排。
 *
 * 设计源(`8015870:docs/design/chat-panel/src/body-scene.html`)的 before/after
 * 是一处纯结构改动:
 *
 *   旧: .up > .h[ .amt + button ]            +  p.why
 *   新: .up > .h[ .amt ]                     +  .up-bottom[ p.why + button ]
 *
 * 也就是说,**「余额」这一行和「为什么现在告诉你 + 出口」这一排被分成了两段**,
 * 中间压一条细线。这条改动不是挪个盒子的事,它换掉了这张卡的读法:
 * 卡头只报事实(还剩多少),底排才是「所以呢 / 那我能做什么」——
 * 说明句和它对应的那颗按钮从此在同一行里,眼睛不用在两段之间来回跳。
 *
 * ## 为什么用结构断言而不是类名
 *
 * `components/chat/AGENTS.md` §5 明令不断 CSS 类名(Module 类名带哈希,
 * 而且改名不该让一条讲版式的用例变红)。所以这里问的全是**元素之间的关系**:
 * 谁和谁同父、谁在谁前面、哪个盒子里装着哪段字。这三件事正是这次改动的全部内容,
 * 类名怎么改都不影响它们成不成立。
 *
 * ## 两档共用同一副版式
 *
 * 低余额(> 0)和归零(= 0)在设计稿里是**同一个 `.up.mod-glow`**,只有金额的
 * 颜色和那句话不同。所以每条结构断言都跑两档 —— 「只把低余额那档改对」是这次
 * 最容易留下的半成品。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { UpgradeCard } from '../../../src/components/chat/UpgradeCard';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const card = () => screen.getByTestId('chat-upgrade-card');
const cta = () => screen.getByRole('button');
/** 那句「为什么现在告诉你」—— 卡里唯一的段落,不靠类名认 */
const why = () => {
  const p = card().querySelector('p');
  if (!p) throw new Error('升级卡里没有说明段落');
  return p;
};
/** 金额那个数 —— 卡里唯一的 <b>,同样不靠类名认 */
const amount = () => {
  const b = card().querySelector('b');
  if (!b) throw new Error('升级卡里没有金额');
  return b;
};

/** a 在 b 之前(文档顺序) */
function precedes(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

/** 低余额 $3.20 与归零 $0.00 —— 稿子这两格用的就是这两个数 */
const BALANCES: ReadonlyArray<readonly [label: string, usd: number]> = [
  ['低余额', 3.2],
  ['归零', 0],
];

describe('升级卡 · CTA 搬到底排(PR #7170)', () => {
  for (const [label, usd] of BALANCES) {
    describe(label, () => {
      it('说明句和 CTA 同属底排的一个盒子', () => {
        render(<UpgradeCard balanceUsd={usd} onUpgrade={() => {}} />);
        // 旧版式里按钮的父级是卡头、说明句的父级是卡本身 —— 两者不同父。
        expect(cta().parentElement).toBe(why().parentElement);
      });

      it('卡头只剩余额:那一段里不再装着 CTA', () => {
        render(<UpgradeCard balanceUsd={usd} onUpgrade={() => {}} />);
        const bottom = cta().parentElement;
        expect(bottom).not.toBeNull();
        // 金额和按钮不再共处一个盒子 —— 这正是「余额头部与底部说明分离」。
        expect(bottom!.contains(amount())).toBe(false);
      });

      it('读的顺序是 余额 → 说明 → 出口', () => {
        render(<UpgradeCard balanceUsd={usd} onUpgrade={() => {}} />);
        expect(precedes(amount(), why())).toBe(true);
        // 旧版式里按钮排在说明句**前面**(它在卡头里)。
        expect(precedes(why(), cta())).toBe(true);
      });

      it('金额和说明句仍分属两段,不被压进同一个盒子', () => {
        render(<UpgradeCard balanceUsd={usd} onUpgrade={() => {}} />);
        expect(amount().parentElement).not.toBe(why().parentElement);
      });
    });
  }

  it('两档共用同一副版式 —— 盒子的嵌套深度一模一样', () => {
    const depth = (el: Element, root: Element): number => {
      let d = 0;
      let cur: Element | null = el;
      while (cur && cur !== root) { d += 1; cur = cur.parentElement; }
      return d;
    };

    const { unmount } = render(<UpgradeCard balanceUsd={3.2} onUpgrade={() => {}} />);
    const low = { why: depth(why(), card()), cta: depth(cta(), card()) };
    unmount();

    render(<UpgradeCard balanceUsd={0} onUpgrade={() => {}} />);
    expect({ why: depth(why(), card()), cta: depth(cta(), card()) }).toEqual(low);
  });

  it('CTA 文案走词典,不是写死的 Upgrade', () => {
    // 「绝对不要硬编码 Upgrade」:zh-CN 下这颗按钮念的是词典里的「升级」。
    render(<UpgradeCard balanceUsd={3.2} onUpgrade={() => {}} />);
    expect(cta().textContent).toContain('升级');
    expect(cta().textContent).not.toContain('Upgrade');
  });
});
