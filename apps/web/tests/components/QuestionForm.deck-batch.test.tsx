// @vitest-environment jsdom
/**
 * 视觉方向那一沓 —— 一批 6 张、换一批、选中的不许被轮换走、网格只铺这一批。
 *
 * 产品口径(2026-08-27,逐字):
 *
 *   「点击换一批时,顺序从 22 个里每次挑 6 个出来」
 *   「但如果用户选中了一个,那要保留选中的这个,不能把用户选中的给轮换出去了,
 *     不然无法取消选择了」
 *   「然后如果已经选满了的话,扇形时就禁止其他卡片选中态」
 *   「然后点击右上角展开成列表按钮时,只展开这次的 6 个」
 *
 * 这四条**推翻**了 2026-08-26 那次「整份目录进一沓」的裁决(那一版:一沓装 25 张,
 * 网格铺 25 张)。推翻的理由就写在产品第二句里:整份目录进一沓时,「换一批」是把
 * 整个数组转过去,被选中的那张会转到看不见的位置 —— 叠放态只有最前面那张能点,
 * 于是那道题**再也取消不了**。改成「一批 6 张 + 选中的钉住」之后,选中的那张
 * 永远在这 6 张里,最多翻五下就能回到它。
 *
 * 纯排布逻辑(哪 6 张、槽位怎么稳)在 `tests/runtime/visual-style-deck.test.ts`;
 * 这个文件守的是**接到组件上之后还成立**。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QuestionFormView } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { visualStyleCardsForContext } from '../../src/runtime/visual-style-catalog';
import { VISUAL_STYLE_BATCH_SIZE } from '../../src/runtime/visual-style-deck';

afterEach(cleanup);

/**
 * 【tone 这道题就是单选】(2026-08-27 产品裁决,逐字:「就是要单选啊,为啥要选两个风格?…
 * 最终 html 只会有一种风格才对吧?」)。discovery 的提示词样例已经从
 * `"type": "checkbox", "maxSelections": 2` 改成 `"type": "radio"`
 * (`apps/daemon/src/prompts/discovery.ts` 与 `packages/contracts/src/prompts/discovery.ts`)。
 *
 * 所以「选中的不许被轮换走」这条**变得更要紧**,不是更不要紧:单选下有且只有一张
 * 被选中的卡,它一旦被轮换出这一批,用户就再也换不掉自己的选择了(叠放态只有
 * 最前面那张能点)。下面的钉子因此以单选为主。
 */
const singleForm = {
  id: 'discovery',
  title: 'Choose a visual direction',
  questions: [
    {
      id: 'tone',
      label: 'Visual direction',
      type: 'radio',
      required: true,
      allowCustom: false,
      options: [{ label: 'Editorial / magazine', value: 'editorial' }],
    },
  ],
} as QuestionForm;

/**
 * 多选、上限 2。
 *
 * tone 已经改单选(见上),但 `maxSelections` 作为**能力**还在:别的 checkbox 题
 * 仍然可以设上限,叠放态照样要处理「选满了」。所以这一族**不删**,只是不再代表
 * tone 那道题 —— 产品口径第三句(「如果已经选满了的话,扇形时就禁止其他卡片选中态」)
 * 在单选下天然不成立(单选没有「满」,再点一张就是改选),它守的是剩下那条通用路径。
 */
const cappedForm = {
  id: 'discovery',
  title: 'Choose a visual direction',
  questions: [
    {
      id: 'tone',
      label: 'Visual direction (pick up to two)',
      type: 'checkbox',
      required: true,
      allowCustom: false,
      maxSelections: 2,
      options: [{ label: 'Editorial / magazine', value: 'editorial' }],
    },
  ],
} as QuestionForm;

function renderDeck(form: QuestionForm) {
  const utils = render(
    <QuestionFormView form={form} interactive visualStyleContext="deck" onSubmit={vi.fn()} />,
  );
  return utils.container;
}

const cards = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('.qf-visual-stack .qf-visual-card'));
const titles = (root: HTMLElement) => cards(root).map((el) => el.getAttribute('title'));
const front = (root: HTMLElement) => cards(root)[0]!;
const reshuffle = (root: HTMLElement) =>
  fireEvent.click(root.querySelector('[data-action="reshuffle"]')!);
const toggleView = (root: HTMLElement) =>
  fireEvent.click(root.querySelector('[data-action="toggle-view"]')!);
const next = (root: HTMLElement) => fireEvent.click(root.querySelector('[data-nav="next"]')!);

describe('一沓里只放这一批的 6 张', () => {
  it('叠放态渲染 6 张,不是整份目录', () => {
    const root = renderDeck(singleForm);
    const catalog = visualStyleCardsForContext('deck').length;

    // 先证明这道断言不是「目录本来就只有 6 张」蒙对的
    expect(catalog).toBeGreaterThan(VISUAL_STYLE_BATCH_SIZE);
    expect(cards(root)).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
  });

  it('每一张都是目录里真实存在的一张,且不重复', () => {
    const root = renderDeck(singleForm);
    const catalogTitles = visualStyleCardsForContext('deck').map((c) => c.title);
    const shown = titles(root);

    expect(shown.every((t) => catalogTitles.includes(t!))).toBe(true);
    expect(new Set(shown).size).toBe(VISUAL_STYLE_BATCH_SIZE);
  });
});

describe('换一批', () => {
  it('6 张全换掉了 —— 「换」不是「洗一洗」', () => {
    const root = renderDeck(singleForm);
    const before = titles(root);

    reshuffle(root);
    const after = titles(root);

    expect(after).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(after).not.toEqual(before);
    expect(after.filter((t) => before.includes(t))).toEqual([]);
  });

  it('换过之后这一沓翻回第一张 —— 不然新的一批还压在旧的翻页位置上', () => {
    // 甲:先翻两下再换一批。乙:直接换一批。两边看到的顺序必须一模一样 ——
    // 翻页位置没归零的话,甲的最前面那张会是新一批的第三张。
    const withNav = renderDeck(singleForm);
    next(withNav);
    next(withNav);
    reshuffle(withNav);
    const afterNav = titles(withNav);
    cleanup();

    const clean = renderDeck(singleForm);
    reshuffle(clean);
    expect(afterNav).toEqual(titles(clean));
  });
});

describe('选中的那张不许被轮换走', () => {
  /*
   * 【单选是 tone 现在的形态】(2026-08-27 裁决)。单选下这条钉子的理由**变了**,
   * 但没变弱:
   *
   *  · 多选时的理由是产品原话「不然无法取消选择了」—— 叠放态只有最前面那张能点,
   *    选中的卡被轮换走就再也够不着,那道题卡死。
   *  · 单选时你本来就不用「取消」(再点另一张就是改选)。真正的问题是
   *    **牌面和答案会对不上**:选中的那张被轮换走之后,6 张卡一张都不高亮,
   *    而表单已经算「答完了」、「下一步」是亮的,提交上去的仍然是那张看不见的卡。
   *    用户没法确认自己选的是什么,也没法在原地改主意。
   *
   * 所以单选下更要钉:有且只有一张要保住,保不住就是整道题的可见状态在说谎。
   */
  it('[单选] 换一批之后,选中的那张仍在牌面上,而且仍然显示为选中', () => {
    const root = renderDeck(singleForm);
    const picked = front(root).getAttribute('title');
    fireEvent.click(front(root));
    expect(front(root).classList.contains('qf-visual-card-on')).toBe(true);

    reshuffle(root);

    expect(titles(root)).toContain(picked);
    // 仍在原来的槽位(第 1 张),而且高亮还在 —— 牌面和答案对得上
    expect(front(root).getAttribute('title')).toBe(picked);
    expect(front(root).classList.contains('qf-visual-card-on')).toBe(true);
    // 而且它当场就能改主意:最前面这张是能点的
    expect(front(root).hasAttribute('disabled')).toBe(false);
  });

  /**
   * 配对的正面:钉住的**只有选中的那张**,别的五张照换。
   * 少了这一条,上面那条可以靠「换一批干脆什么都不换」变绿。
   */
  it('[单选] 其余五张照换不误', () => {
    const root = renderDeck(singleForm);
    const picked = front(root).getAttribute('title');
    fireEvent.click(front(root));
    const before = titles(root);

    reshuffle(root);
    const after = titles(root);

    const stayed = after.filter((t, i) => t === before[i]);
    expect(stayed).toEqual([picked]);
  });

  /**
   * 钉的是【槽位】,不只是「还在牌面上」。
   *
   * 光断言 `toContain` 是不够的:每次渲染都会跑一遍 `resolveVisualStyleBatch`,
   * 它为了另一件事(「随机」可能从整份目录里抽中一张不在牌面上的卡)会把选中的值
   * **拉回**牌面 —— 于是就算「换一批」把它轮走了,它也会被拉回来,只是换了个槽。
   * 那种情况下 `toContain` 照样绿,而用户看到的是自己的选择在牌面上跳位置。
   * 所以这里钉到第几槽。(实测:把 `shuffle()` 里的 `keep` 改成 `[]`,
   * 只断言 `toContain` 的版本仍然是绿的;断言槽位的这一版会红。)
   */
  it('[单选] 选中的那张在第三个槽位时,连槽位一起钉住', () => {
    const root = renderDeck(singleForm);
    // 翻两下,让第三张来到最前面再选它
    next(root);
    next(root);
    const picked = front(root).getAttribute('title');
    fireEvent.click(front(root));

    reshuffle(root);
    // 换一批会把翻页位置归零,所以 DOM 顺序就是这一批的槽位顺序
    expect(titles(root)).toContain(picked);
    expect(titles(root)[2]).toBe(picked);
  });

  /**
   * 单选特有的那一半:改选之后,**钉子跟着挪**。
   * 少了这一条,「钉住」可以退化成「第一张永远不换」——那不是钉住选中的,
   * 那是根本没在换。
   */
  it('[单选] 改选另一张之后,旧的那张不再被钉住', () => {
    const root = renderDeck(singleForm);
    const firstPick = front(root).getAttribute('title');
    fireEvent.click(front(root));
    next(root);
    const secondPick = front(root).getAttribute('title');
    fireEvent.click(front(root));
    expect(secondPick).not.toBe(firstPick);

    reshuffle(root);

    expect(titles(root)).toContain(secondPick);
    expect(titles(root)).not.toContain(firstPick);
  });

  /**
   * 多选那条路仍然在(`maxSelections` 是一项还活着的能力,别的 checkbox 题会用),
   * 所以产品原话那条理由「不然无法取消选择了」照旧钉住。
   */
  it('[多选] 换一批之后它还在牌面上,而且还能被取消掉', () => {
    const root = renderDeck(cappedForm);
    const picked = front(root).getAttribute('title');
    fireEvent.click(front(root));
    expect(front(root).classList.contains('qf-visual-card-on')).toBe(true);

    reshuffle(root);

    expect(titles(root)).toContain(picked);
    expect(front(root).getAttribute('title')).toBe(picked);
    fireEvent.click(front(root));
    expect(front(root).classList.contains('qf-visual-card-on')).toBe(false);
  });
});

describe('铺开成网格时只铺这一批', () => {
  it('网格里就是这 6 张,不是整份目录', () => {
    const root = renderDeck(singleForm);
    const catalog = visualStyleCardsForContext('deck').length;
    expect(catalog).toBeGreaterThan(VISUAL_STYLE_BATCH_SIZE);

    toggleView(root);
    expect(root.querySelector('.qf-visual-picker')?.getAttribute('data-view')).toBe('grid');
    expect(cards(root)).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
  });

  /** 「6 张」不够 —— 必须是【这次的】6 张,不是另外随便 6 张。 */
  it('铺开的正是叠放态里的那 6 张,顺序一致', () => {
    const root = renderDeck(singleForm);
    const inFan = titles(root);

    toggleView(root);
    expect(titles(root)).toEqual(inFan);
  });

  it('换一批之后再铺开,铺的是新的那 6 张', () => {
    const root = renderDeck(singleForm);
    const before = titles(root);
    reshuffle(root);
    const after = titles(root);

    toggleView(root);
    expect(titles(root)).toEqual(after);
    expect(titles(root)).not.toEqual(before);
  });
});

/*
 * 【这一族守的不再是 tone】。tone 2026-08-27 改成了单选,单选没有「满」这回事 ——
 * 再点一张就是改选。但 `maxSelections` 作为能力还在,别的 checkbox 题设了上限
 * 就会走到这里,所以这一族保留、不删,只是不再为它做额外的专门设计。
 */
describe('选满之后(仅 checkbox 上限那条路):扇形里其他卡不可选', () => {
  /** 先把两个名额占掉。 */
  function fillToLimit(root: HTMLElement): string[] {
    const picked: string[] = [];
    fireEvent.click(front(root));
    picked.push(front(root).getAttribute('title')!);
    next(root);
    fireEvent.click(front(root));
    picked.push(front(root).getAttribute('title')!);
    return picked;
  }

  it('没选满时,没有一张卡是 disabled —— 证明下面那条不是天生就绿', () => {
    const root = renderDeck(cappedForm);
    fireEvent.click(front(root));
    expect(cards(root).filter((el) => el.hasAttribute('disabled'))).toEqual([]);
  });

  it('选满两张之后,没被选中的四张都不可选', () => {
    const root = renderDeck(cappedForm);
    const picked = fillToLimit(root);

    const rest = cards(root).filter((el) => !picked.includes(el.getAttribute('title')!));
    expect(rest).toHaveLength(VISUAL_STYLE_BATCH_SIZE - 2);
    expect(rest.every((el) => el.hasAttribute('disabled'))).toBe(true);
  });

  /**
   * 「不可选」在结构上就是:那张卡是 `disabled` 的 `<button>`,而且**点了没反应**。
   * 视觉上那一半(勾选圈收掉、hover 不放大、光标不再是 grab)是层叠的事,
   * jsdom 不跑层叠 —— 钉在 `tests/components/chat/visual-at-limit-affordance.test.ts`。
   * 这里只钉行为:点上限之外的卡,选中集合一动不动。
   */
  it('点不可选的那张,什么都不会发生', () => {
    const root = renderDeck(cappedForm);
    const picked = fillToLimit(root);
    const on = () =>
      cards(root)
        .filter((el) => el.classList.contains('qf-visual-card-on'))
        .map((el) => el.getAttribute('title'));
    expect(on().sort()).toEqual([...picked].sort());

    const blocked = cards(root).find((el) => el.hasAttribute('disabled'))!;
    fireEvent.click(blocked);
    expect(blocked.classList.contains('qf-visual-card-on')).toBe(false);
    expect(on().sort()).toEqual([...picked].sort());
  });

  it('选满之后仍然翻得动,翻到自己选的那张就能取消', () => {
    const root = renderDeck(cappedForm);
    const picked = fillToLimit(root);
    // 此刻最前面那张是第二次选中的那张
    expect(front(root).getAttribute('title')).toBe(picked[1]);

    // 往前翻回第一张选中的
    fireEvent.click(root.querySelector('[data-nav="prev"]')!);
    expect(front(root).getAttribute('title')).toBe(picked[0]);
    expect(front(root).hasAttribute('disabled')).toBe(false);

    fireEvent.click(front(root));
    expect(front(root).classList.contains('qf-visual-card-on')).toBe(false);
    // 让出一个名额之后,其余的卡立刻恢复可选
    expect(cards(root).filter((el) => el.hasAttribute('disabled'))).toEqual([]);
  });
});
