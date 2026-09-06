// @vitest-environment jsdom
/**
 * 多选题选满之后,**选不了的那几项不该再对鼠标有反应**。
 *
 * ── 用户报的是什么 ────────────────────────────────────────────────
 * 「这个下面两个禁用态,好像还能 hover,要么不让 hover?」
 * 截图:题头写着 `2/5`「已选 2」(`maxSelections: 2`,已选满),前两项是选中的
 * 勾;后两项整块变灰、**整行还带一块浅灰底**;最后一项「自己填」是正常的。
 *
 * ── 量出来其实是两件事叠在一起,不是一件 ──────────────────────────
 * 「一块浅灰底」有两种可能长得一模一样:hover 底色,或者**常驻**底色。
 * 本文件把两态分开量,结论是**两条都成立**:
 *
 *   ① 常驻的那一块是 `styles/primitives.css` 的全局
 *      `button:disabled { background: var(--bg-subtle) }`。特异性 (0,1,1) ——
 *      压过 `.qf-chip { background: transparent }` 的 (0,1,0)。选项行在我们这儿
 *      是 `<button class="qf-chip">`(D52,照抄稿子的 `.opt`),于是一被
 *      `disabled` 就吃到这条全局原语,被刷成一枚灰药丸。
 *      **稿子的 `.opt` 从头到尾只有 `transparent` 一种底,没有画过禁用态**
 *      (`8015870095:docs/design/chat-panel/src/components.css`,`.opt` 一族
 *       零处 `:disabled` / `.is-disabled`)。
 *
 *   ② hover 仍然照常响应:`.qf-chip:hover { background: var(--bg-panel) }`
 *      特异性 (0,2,0),又压过上面那条 —— 鼠标一移上去,底色从 `#ededed`
 *      跳成 `#fafafa`,勾选圈的描边从 `#bdbdbd` 跳成 `#848484`。
 *      **`:hover` 在禁用按钮上照样命中**(浏览器如此,jsdom 也照着实现;
 *      本文件第一条用例就是拿一颗光秃秃的 `<button disabled>` 把这件事量出来),
 *      光把按钮 `disabled` 掉挡不住它。
 *
 * ── 判据出处(不自造) ────────────────────────────────────────────
 * · 静息底色:稿子 `.opt { background: transparent }`,禁用态稿子没画 → 照静息。
 *   同一件事仓库里已经做过一遍:`.qf-visual-card.qf-visual-card-disabled` 写成
 *   两个类 (0,2,0),专门把底色和描边**从全局 `button:disabled` 手里抢回来**,
 *   注释原文「会把卡刷成 --bg-subtle 的灰片…写成两个类 (0,2,0) 才压得回去」。
 *   「选不了」只由 `opacity` 表达 —— 那一路也是这么做的。
 * · hover 不许有反馈:稿子对禁用态的规矩写在 `.btn:disabled:hover` ——
 *   把静息值**原样重述**一遍,即「hover 照终态」。
 * · 光标:稿子 `.btn:disabled { cursor: not-allowed }`,产品里
 *   `.qf-visual-card-disabled` / `.qf-chip-disabled` 声明的也都是 `not-allowed`。
 *
 * ── 为什么自己算层叠 ──────────────────────────────────────────────
 * 这次的差异**纯粹**是层叠结果(几条规则的文本都没问题,错的是谁压谁),
 * 而 jsdom 既不做特异性层叠也不解 `var()`,`getComputedStyle` 在这里只给空值。
 * 解析器用 `tests/helpers/chat-mirror-cascade.ts`,按 `index.css` 的顺序读真表。
 * hover 本身**不模拟**:jsdom 的 `:hover` 跟着真实鼠标事件走,所以直接
 * `fireEvent.mouseOver` / `mouseOut`,再当场核实指针确实在 / 确实不在上面 ——
 * 核实这一步是必需的,`fireEvent.click` 自己就会把指针留在点过的那一颗上,
 * 少了它「静息态」可能量的其实是 hover 态。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { createResolver, hashed } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const TARGETS = ['background-color', 'color', 'cursor', 'opacity', 'border-top-color'] as const;

/** 产品 `index.css` 的导入顺序(只取够得着选项行的那几张)。 */
const CSS = createResolver(
  [
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
  ],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/**
 * 指针停在**选项行**上时,`target`(选项行自己,或它里面的勾选圈)的读数。
 *
 * 指针一律停在选项行上,不停在勾选圈上 —— 这既是真实手势(鼠标压在这一行),
 * 也是这几条规则真正需要的条件(`.qf-chip:hover .qf-chip-box` 要的是**选项行**
 * 进入 `:hover`)。
 *
 * 一处如实的偏差:jsdom 的 `:hover` **只标事件目标本身,不往祖先传**。
 * 真浏览器会把整条祖先链都标上。本族用得着的 hover 规则逐条查过,条件都落在
 * 选项行自己身上(`composio.css` 里 `.qf-*` 一族的 `:hover` 没有一条是挂在
 * 选项行的祖先上的),所以这处偏差在这里够不着。哪天有人写了
 * `.question-form:hover .qf-chip` 这种规则,这套量法就得跟着改。
 */
function whileHovering(chip: Element, target: Element = chip): Record<string, string> {
  fireEvent.mouseOver(chip);
  if (!chip.matches(':hover')) throw new Error('指针没停上去 —— 这一量是假的');
  return CSS.resolved(target);
}

/** 静息态读数。先把指针挪开并**当场核实**,见文件头。 */
function atRest(chip: Element, target: Element = chip): Record<string, string> {
  fireEvent.mouseOut(chip);
  if (chip.matches(':hover')) throw new Error('指针没挪走 —— 量到的其实是 hover 态');
  return CSS.resolved(target);
}

/* ── 夹具:选满两项的多选题 ─────────────────────────────────────────── */

const CAPPED: QuestionForm = {
  id: 'surfaces',
  title: '还需要确认一件事',
  lang: 'zh-CN',
  questions: [
    {
      id: 'surfaces',
      label: '这次要覆盖哪几个端?',
      type: 'checkbox',
      maxSelections: 2,
      options: [
        { label: '响应式网页(推荐)', value: 'web', description: '一套版式适配桌面和手机。' },
        { label: '桌面网页', value: 'desktop' },
        { label: 'iOS', value: 'ios', description: '按 Human Interface Guidelines 出图。' },
        { label: 'Android', value: 'android' },
      ],
    },
  ],
};

function mount(form: QuestionForm, submitted?: Record<string, string | string[]>): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <div className="app">
        <div className={chatRootStyles.root} data-chat-root="">
          <div className="chat-log">
            <div className="msg assistant">
              <div className="prose-block">
                <QuestionFormView
                  form={form}
                  interactive
                  submittedAnswers={submitted}
                  onSubmit={() => {}}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </I18nProvider>,
  );
  return container;
}

/** 选项行(不含「自己填」那一颗 —— 它是 `.qf-chip-other`)。 */
function options(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('.qf-chip:not(.qf-chip-other)')];
}

function box(chip: Element): Element {
  const el = chip.querySelector('.qf-chip-box');
  if (!el) throw new Error('选项里没有勾选圈 —— 夹具或组件变了,先修这里');
  return el;
}

/** 点满 `maxSelections` 项,让其余项进入「选不了」。 */
function fillToCap(container: HTMLElement): {
  picked: HTMLButtonElement[];
  maxed: HTMLButtonElement[];
} {
  const all = options(container);
  fireEvent.click(all[0]!);
  fireEvent.click(all[1]!);
  const after = options(container);
  return { picked: [after[0]!, after[1]!], maxed: [after[2]!, after[3]!] };
}

/* ── 稿子的原值(light,`8015870095` 的 `.opt` 一族) ─────────────────── */

const OPT_BG_REST = 'transparent'; // `.opt { background: transparent }`
const OPT_BG_HOVER = '#fafafa'; // `.opt:hover { background: var(--bg-panel) }`
const BOX_REST = '#bdbdbd'; // `.opt .box { border: 1.5px solid var(--border-strong) }`
const BOX_HOVER = '#848484'; // `.opt:hover .box { border-color: var(--text-soft) }`

describe('选满之后,选不了的选项不再对鼠标有反应', () => {
  it('机制:禁用的 `<button>` **照样**吃 `:hover` —— 光 disabled 挡不住样式', () => {
    // 整个 bug 的前提。这一条不涉及产品代码,量的是平台行为本身;
    // 它要是不成立(比如哪天 jsdom 改了),后面「hover 前后一致」全部变成假绿。
    const { container } = render(
      <div>
        <button type="button" disabled>
          停用
        </button>
      </div>,
    );
    const dead = container.querySelector('button')!;
    expect(dead.disabled).toBe(true);
    fireEvent.mouseOver(dead);
    expect(dead.matches(':hover')).toBe(true);
  });

  it('防真空:可点的选项**确实**量得出 hover 变化(否则本文件全是假绿)', () => {
    const container = mount(CAPPED);
    const pickable = options(container)[0]!;
    expect(pickable.disabled).toBe(false);

    expect(atRest(pickable)['background-color']).toBe(OPT_BG_REST);
    expect(whileHovering(pickable)['background-color']).toBe(OPT_BG_HOVER);
    expect(atRest(pickable, box(pickable))['border-top-color']).toBe(BOX_REST);
    expect(whileHovering(pickable, box(pickable))['border-top-color']).toBe(BOX_HOVER);
  });

  it('防真空:解析器确实看得见全局原语那条 `button:disabled`', () => {
    // 它就是常驻灰底的来源。解析器要是根本没读到 primitives.css,
    // 下面「静息是透明的」会在解析器瞎了的时候假绿。
    const container = mount(CAPPED);
    const { maxed } = fillToCap(container);
    const sources = CSS.declaring(maxed[0]!, 'background-color').map((r) => r.selector);
    expect(sources).toContain('button:disabled');
  });

  it('选满之后,多出来的选项**真的**点不动(不是只做了个灰样子)', () => {
    const container = mount(CAPPED);
    const { picked, maxed } = fillToCap(container);
    expect(picked.every((chip) => chip.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(maxed.every((chip) => chip.disabled)).toBe(true);

    fireEvent.click(maxed[0]!);
    expect(maxed[0]!.getAttribute('aria-checked')).toBe('false');
    // 选中数不变 —— 卡头那枚「已选 N」是同一个来源
    expect(
      options(container).filter((chip) => chip.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(2);
  });

  it('静息态照稿子的 `.opt`:透明底,不是全局原语刷的那枚灰药丸', () => {
    const container = mount(CAPPED);
    const { maxed } = fillToCap(container);
    expect(atRest(maxed[0]!)['background-color']).toBe(OPT_BG_REST);
  });

  it('鼠标移上去,选不了的那一项一个像素都不变', () => {
    const container = mount(CAPPED);
    const { maxed } = fillToCap(container);
    const chip = maxed[0]!;
    const restChip = atRest(chip)['background-color'];
    const restBox = atRest(chip, box(chip))['border-top-color'];
    expect(whileHovering(chip)['background-color']).toBe(restChip);
    expect(whileHovering(chip, box(chip))['border-top-color']).toBe(restBox);
    // 盯的是具体值,不是「两边都算不出来」的空过
    expect(restChip).toBe(OPT_BG_REST);
    expect(restBox).toBe(BOX_REST);
  });

  it('「选不了」由 opacity + not-allowed 表达 —— 和视觉方向卡那一路同一个做法', () => {
    const container = mount(CAPPED);
    const { maxed } = fillToCap(container);
    expect(atRest(maxed[0]!).opacity).toBe('0.48');
    expect(atRest(maxed[0]!).cursor).toBe('not-allowed');
  });

  it('键盘也到不了它 —— 原生 disabled 已经把它移出 Tab 序列', () => {
    const container = mount(CAPPED);
    const { maxed } = fillToCap(container);
    // 没有人手动加 tabindex 把它捞回来
    expect(maxed[0]!.hasAttribute('tabindex')).toBe(false);
    expect(maxed[0]!.disabled).toBe(true);
  });

  it('回归护栏:已答表单里选中的那一项,鼠标扫过不会把勾抹掉', () => {
    // `.qf-chip-on .qf-chip-box { border-color: transparent }` 是勾的底,
    // hover 那条一旦盖过来,已锁的表单会在鼠标扫过时露出一圈灰描边。
    const container = mount(CAPPED, { surfaces: ['web'] });
    const on = options(container).find((chip) => chip.getAttribute('aria-checked') === 'true');
    expect(on).toBeDefined();
    expect(on!.disabled).toBe(true);
    expect(whileHovering(on!, box(on!))['border-top-color']).toBe('transparent');
  });
});
