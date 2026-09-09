// @vitest-environment jsdom
/**
 * OPEND-2641 · 分步进度(`1/4`)跟着**当前问句**走,不坐在卡头里。
 *
 * ── 工单怎么说 ────────────────────────────────────────────────────────
 * Current behavior:卡头左边是卡的标题,`1/4` 渲染在卡头中偏右
 *   —— 「This makes the progress feel detached from the current question and
 *      competes with the selected-count label.」
 * Expected behavior:
 *   · 进度**跟在当前问句后面**(next to or after the question text);
 *   · 卡头只留卡的名字和整卡状态(such as selected count);
 *   · 「The layout should stay readable for long localized question text and
 *      narrow ChatPanel widths.」
 * Suggested fix direction 还点名:compact inline treatment after the question
 *   text,**with wrapping rules that do not collide with required badges**。
 *
 * ── 为什么它在卡头里会「和已选 N 抢位置」──────────────────────────────
 * 卡头是 flex,`.qf-step-progress` 和 `.qf-picked` **各写了一句
 * `margin-inline-start: auto`**。一行里两个 auto 会把剩余空间**对半分**,
 * 于是进度既不贴左也不贴右,停在卡头中间 —— 工单原话的 "near the middle/right"
 * 和 "competes with the selected-count label" 说的就是这一件事。
 * 把进度搬进问句行之后卡头只剩一个 auto,「已选 N」才真正贴到右边界。
 *
 * ── 这份文件的判据分两类,别混着看 ────────────────────────────────────
 * ① **位置**(结构):进度是不是当前问句那一行的兄弟节点、卡头里还有没有它。
 *    jsdom 看 DOM 结构是可信的,这一类全在这里判。
 * ② **窄面板 / 长译文下还读得清**(样式):`1/4` 自己不许断行、长问句要能换行。
 *    jsdom 既不解 `var()` 也不做层叠,`getComputedStyle` 在这里恒为空串,
 *    所以这一类走共享量尺 `tests/helpers/chat-mirror-cascade`(只读,不改一个字),
 *    并且每组先来一条**防真空**断言:先证明量尺确实盖到了这个元素、`var()` 解得开,
 *    再比值。少了那一条,量尺够不着元素时读回 `<unset>` 也是红的,
 *    但红的原因是「没量到」而不是「值不对」。
 *    真实的视觉落点(进度和「必填」角标的包围盒不重叠)在真浏览器里量,不在这里。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { createResolver, hashed, UNSET } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

/**
 * 只点名这两轴 —— 共用一张属性表会让「别的文件加了一项」变成这里的假失败。
 *
 * ⚠️ 这里**没有** `white-space`,是量过之后拿掉的:无头 Chrome 实测(8px 宽的容器),
 * `1/4` 在 `display:inline` + `white-space:normal` 下也只有 1 个行盒 —— 斜杠两侧
 * 根本没有断点,`nowrap` 加不加都一样。断言它等于钉住一句什么都不做的声明,
 * 是「看起来很负责」的假绿。`1/4` 不被拆开真正靠的是 `.qf-step-progress` 的
 * `display: inline-block`(原子行内盒)。
 */
const TARGETS = ['margin-left', 'overflow-wrap'] as const;

/**
 * 产品 `src/index.css` 的导入顺序,只取够得着意图澄清卡的那几张。
 * `primitives.css` 必须在里面:全局裸 `button { white-space: nowrap }` 那条渗漏
 * 就是从它下来的(OPEND-2612 的病根),少注它这一族读数全是假的。
 */
const SHEETS = [
  read('src/styles/tokens.css'),
  read('src/styles/base.css'),
  readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  read('src/styles/viewer/core.css'),
  read('src/styles/viewer/composio.css'),
  hashed(
    read('src/components/chat/ChatRoot.module.css'),
    chatRootStyles as unknown as Record<string, string>,
  ),
];

const CSS = createResolver(
  SHEETS,
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = SHEETS.map((css) => css.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  document.head.append(style);
});

/**
 * 四问的分步表单 —— 工单原文举的就是 `1/4`。
 *
 * 第一问**同时**是必填和多选:必填让「必填」角标出现在同一行(工单要求进度的
 * 换行规则不能和角标撞上),多选让卡头右边长出「已选 N」(工单说的那个抢位置的邻居)。
 * 问句刻意用一条**长中文译文**,照工单的 "long localized question text"。
 */
const LONG_LABEL =
  '这次改版需要覆盖哪几个端和哪几种断点?把你们真正在维护的那几个先勾出来,剩下的之后再补';

const FOUR_STEP_FORM: QuestionForm = {
  id: 'deck-brief',
  title: '还需要确认几件事',
  questions: [
    {
      id: 'surfaces',
      label: LONG_LABEL,
      type: 'checkbox',
      required: true,
      options: [
        { label: '响应式网页', value: 'web' },
        { label: '移动端', value: 'mobile' },
        { label: '大屏', value: 'tv' },
      ],
    },
    { id: 'audience', label: '谁会看到它?', type: 'text' },
    { id: 'length', label: '要做多详细?', type: 'text' },
    { id: 'notes', label: '还有什么要保留的?', type: 'textarea' },
  ],
};

function mount(): HTMLElement {
  return render(
    <I18nProvider>
      <QuestionFormView form={FOUR_STEP_FORM} interactive onSubmit={() => undefined} />
    </I18nProvider>,
  ).container;
}

/** 勾两项 —— 卡头右边长出「已选 2」,进度和它同时在场。 */
function mountWithPicks(): HTMLElement {
  const container = mount();
  for (const label of ['响应式网页', '移动端']) {
    const chip = [...container.querySelectorAll<HTMLElement>('.qf-chip')].find((node) =>
      node.textContent?.includes(label),
    );
    if (!chip) throw new Error(`找不到选项:${label}`);
    fireEvent.click(chip);
  }
  return container;
}

function progressOf(root: HTMLElement): HTMLElement {
  const el = root.querySelector<HTMLElement>('.qf-step-progress');
  if (!el) throw new Error('`.qf-step-progress` 没渲染 —— 分步进度整个不见了');
  return el;
}

describe('OPEND-2641 · 进度跟着当前问句,不在卡头里', () => {
  it('防真空:四问表单确实进了分步态,进度念的是 `1/4`', () => {
    const progress = progressOf(mount());
    expect(progress.textContent).toBe('1/4');
    // 分步态只渲染当前那一问 —— 后面几问不在页面上,「当前问句」才是唯一的
    const labels = [...mount().querySelectorAll('.qf-label')];
    expect(labels).toHaveLength(1);
    expect(labels[0]!.textContent).toContain(LONG_LABEL);
  });

  it('进度住在当前问句那一行里,不在卡头里', () => {
    const container = mount();
    const progress = progressOf(container);

    expect(
      progress.closest('.question-form-head'),
      '进度还坐在卡头里 —— 工单要求它跟着当前问句走',
    ).toBeNull();
    expect(
      progress.closest('.qf-label'),
      '进度不在当前问句那一行里',
    ).toBe(container.querySelector('.qf-label'));
  });

  it('进度跟在问句文字**后面**,而且排在「必填」角标之后', () => {
    const label = mount().querySelector<HTMLElement>('.qf-label')!;
    const progress = progressOf(label);
    const required = label.querySelector<HTMLElement>('.qf-required');
    expect(required, '这一问是必填,角标应该在同一行').toBeTruthy();

    // 「跟在问句后面」:问句文字节点在前,进度是这一行的最后一个元素
    expect(label.lastElementChild).toBe(progress);
    expect(
      progress.compareDocumentPosition(label.firstChild!) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    // 「不和必填角标撞上」:两者是**各自独立的兄弟节点**,角标在前,进度不套在角标里
    expect(required!.contains(progress)).toBe(false);
    expect(progress.contains(required!)).toBe(false);
    expect(
      required!.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('卡头只剩卡的名字和整卡状态 —— 进度不再和「已选 N」抢位置', () => {
    const container = mountWithPicks();
    const head = container.querySelector<HTMLElement>('.question-form-head')!;

    expect(head.querySelector('.question-form-title')?.textContent).toBe('还需要确认几件事');
    expect(head.querySelector('.qf-picked'), '「已选 N」应该留在卡头').toBeTruthy();
    expect(
      head.querySelector('.qf-step-progress'),
      '卡头里还有进度 —— 它会和「已选 N」抢同一块位置',
    ).toBeNull();
    // 进度并没有因此消失,只是换了地方
    expect(progressOf(container).textContent).toBe('1/4');
  });

  it('可读名字照旧念得出「第几 / 共几」', () => {
    expect(progressOf(mount()).getAttribute('aria-label')).toBe('1 / 4');
  });
});

describe('OPEND-2641 · 窄面板 + 长译文下仍然读得清', () => {
  it('防真空:量尺盖到了这两个元素', () => {
    const container = mount();
    // 反向对照:同一把尺子在**别的**元素上读得出非默认值,说明尺子本身是活的
    expect(
      CSS.resolved(container.querySelector('.qf-required')!)['margin-left'],
      '量尺连「必填」角标的外距都读不到 —— 样式链没接上,下面的读数都不算数',
    ).toBe('4px');
    expect(
      CSS.resolved(progressOf(container))['margin-left'],
      '没人给进度写过行首外距',
    ).not.toBe(UNSET);
    expect(
      CSS.resolved(container.querySelector('.qf-label')!)['overflow-wrap'],
      '没人给问句行写过 overflow-wrap',
    ).not.toBe(UNSET);
  });

  /*
   * 工单原话:"with wrapping rules that do not collide with required badges"。
   * 角标和进度在 JSX 里是**贴着的两个兄弟节点**(中间没有空白文本节点),
   * 所以这口气只能由进度自己的外距给。无头 Chrome 实测:置 0 之后两者间距
   * 就是 0.0px,`1/4` 紧贴角标的圆边框。
   */
  it('和「必填」角标之间留着一口气,不会贴上去', () => {
    expect(CSS.resolved(progressOf(mount()))['margin-left']).toBe('6px');
  });

  /*
   * 工单原话:"stay readable for long localized question text and narrow ChatPanel widths"。
   * 无头 Chrome 实测(300px 宽的卡 + 一条德语式不可断复合词):
   *   没有这条 → `.qf-label` 的 scrollWidth 412 / clientWidth 298,问句整段溢出卡外;
   *   有这条   → 412 收回 298,问句和行尾的进度都留在卡里。
   */
  it('长问句能在行内折行,不会连着进度一起溢出卡外', () => {
    expect(CSS.resolved(mount().querySelector('.qf-label')!)['overflow-wrap']).toBe('break-word');
  });
});
