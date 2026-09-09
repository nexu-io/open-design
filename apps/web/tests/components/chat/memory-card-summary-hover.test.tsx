// @vitest-environment jsdom
/**
 * 记忆卡的标题行(`<summary>`)悬停要有底色。
 *
 * ## 稿子怎么写的
 *
 * 记忆卡的底座是稿子的通用折叠行 `.fold`(`OdCard.module.css` 的注释已经把这层
 * 对应关系写清楚了)。而 `.fold` 的标题行在稿子里是**能点的**,所以带 hover:
 *
 *   `docs/design/chat-panel/src/components.css:908`(`853da24ea5`,`8015870095` / `853da24ea5` / `361b78253e` 三版同一行同一值)
 *     .fold > summary:hover { background: var(--bg-fill-tertiary); }
 *
 * 我们这边 `.appliedCard > summary` 只搬了静息态,hover 那条漏了 ——
 * 于是这一行是唯一一个「手型是指针、按下去会展开、但鼠标移上去没有任何反馈」
 * 的可点区域。
 *
 * ## 尺子
 *
 * 差异纯粹在**层叠**上(哪条规则最终赢),jsdom 既不算特异性也不解 `var()`,
 * `getComputedStyle` 在这里只给空值。所以用共享量尺
 * `tests/helpers/chat-mirror-cascade.ts` 按 `index.css` 的顺序读真表自己算。
 *
 * hover 本身不模拟:jsdom 的 `:hover` 跟着真实鼠标事件走,所以
 * `fireEvent.mouseOver` / `mouseOut`,并且**当场核实**指针确实在 / 确实不在
 * 上面 —— 少了这步,「静息态」可能量的其实是 hover 态。
 *
 * 判据写成「hover 和静息**不同**,且 hover 等于稿子那支 token 的实际颜色」两条:
 * 只写后一条的话,两边碰巧都是 `<unset>` 时会空过。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { OdCardView } from '../../../src/components/OdCard';
import odCardStyles from '../../../src/components/OdCard.module.css';
import { UNSET, createResolver, hashed } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const TARGETS = ['background-color', 'cursor'] as const;

/** 产品 `index.css` 的导入顺序(只取够得着记忆卡的那几张);Module 排最后并先过 `hashed()`。 */
const CSS = createResolver(
  [
    read('src/styles/tokens.css'),
    read('src/styles/base.css'),
    readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
    read('src/styles/primitives.css'),
    read('src/styles/chat.css'),
    hashed(
      read('src/components/OdCard.module.css'),
      odCardStyles as unknown as Record<string, string>,
    ),
  ],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/**
 * 稿子那支 token 的**字面值**,不是「我们某个 token 的值」——
 * 验收判据是「算出来的值和稿子逐字节相同」。
 *
 * `361b78253e:docs/design/chat-panel/src/tokens.css:42`
 *   --bg-fill-tertiary: rgba(0, 0, 0, 0.03);
 * (稿子的 `tokens.css` 在 `8015870095` / `853da24ea5` / `361b78253e` 三版
 *  md5 相同,这一支从头到尾没动过。)
 */
const DESIGN_FILL_TERTIARY = 'rgba(0, 0, 0, 0.03)';

/** 我们 `tokens.css` 亮色 `:root` 里的同名 token。 */
const OUR_FILL_TERTIARY = (() => {
  const hit = /--bg-fill-tertiary:\s*([^;]+);/.exec(read('src/styles/tokens.css'));
  if (!hit) throw new Error('tokens.css 里找不到 --bg-fill-tertiary');
  return hit[1]!.trim();
})();

const CARD = {
  kind: 'memory-applied' as const,
  summary: '已记住 3 条偏好',
  used: [
    { id: 'm1', type: 'project' as const, name: '商品卡做成可复用的共享组件' },
    { id: 'm2', type: 'feedback' as const, name: '卡片圆角统一 12px' },
    { id: 'm3', type: 'user' as const, name: '不要暖色背景' },
  ],
};

function summary(): Element {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <OdCardView card={CARD} />
    </I18nProvider>,
  );
  const el = container.querySelector('summary');
  if (!el) throw new Error('记忆卡没渲染出 <summary>');
  return el;
}

/**
 * 两态各渲染一份、各自量一次。
 *
 * 不在同一个节点上「移上去再移开」:jsdom 的 `:hover` 在 `<summary>` 上既不
 * 二次点亮也不熄灭(两个方向都实测过),那样量出来的静息态其实是 hover 态。
 * 两态各自开一份新 DOM 就没有这个顺序陷阱 —— 而且**当场核实**指针在不在,
 * 核实这一步是必需的:少了它,假绿会长得和真绿一模一样。
 */
function whileHovering(el: Element): Record<string, string> {
  fireEvent.mouseOver(el);
  if (!el.matches(':hover')) throw new Error('指针没停上去 —— 这一量是假的');
  return CSS.resolved(el);
}

function atRest(el: Element): Record<string, string> {
  if (el.matches(':hover')) throw new Error('这颗刚渲染就带着 hover —— 量到的其实是 hover 态');
  return CSS.resolved(el);
}

describe('记忆卡 · 标题行悬停', () => {
  it('先证明这把尺子看得见 hover(拿一条已知的 hover 规则校准)', () => {
    // `.fold > summary` 同一族里,`.briefChip:hover` 是**已经搬过来**的一条:
    // 它两态不同,说明「量 hover」这条链路本身是通的。
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <OdCardView card={{ kind: 'task-brief', title: 'x', fields: [], note: '' } as never} />
      </I18nProvider>,
    );
    const chip = container.querySelector(`.${(odCardStyles as Record<string, string>).briefChip}`);
    expect(chip, '夹具变了 —— 找不到 briefChip,校准这一步就没了对象').not.toBeNull();
    const rest = atRest(chip!)['background-color'];
    const hover = whileHovering(chip!)['background-color'];
    expect(rest).not.toBe(UNSET);
    expect(hover).not.toBe(rest);
  });

  it('标题行是可点的(所以才该有 hover 反馈)', () => {
    expect(atRest(summary())['cursor']).toBe('pointer');
  });

  it('悬停底色和静息不同 —— 现在完全没反馈', () => {
    const rest = atRest(summary())['background-color'];
    const hover = whileHovering(summary())['background-color'];
    expect(
      hover,
      '记忆卡标题行是可点区域,鼠标移上去必须有底色变化(稿子 `.fold > summary:hover`)',
    ).not.toBe(rest);
  });

  it('悬停底色逐字节等于稿子的 rgba(0, 0, 0, 0.03)', () => {
    // 先钉「我们的 token 和稿子同值」——两边一旦分叉,下面那条会红在一个
    // 看不懂的地方;分成两条,红出来直接指认是 token 漂了还是规则漏了。
    expect(
      OUR_FILL_TERTIARY,
      '我们的 --bg-fill-tertiary 和稿子对不上了 —— 这是 token 漂移,不是这条规则的事',
    ).toBe(DESIGN_FILL_TERTIARY);
    expect(whileHovering(summary())['background-color']).toBe(DESIGN_FILL_TERTIARY);
  });
});
