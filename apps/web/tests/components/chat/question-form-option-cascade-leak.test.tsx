// @vitest-environment jsdom
/**
 * 选项行上两处**层叠渗漏**——规则文本都没写错,错的是谁压过谁。
 *
 * 上一轮修「选满之后禁用项还会 hover」时(`question-form-maxed-option-hover.test.tsx`)
 * 两处都量到了,但当时只抢回了背景色,这两条留在原地。本文件把它们各自钉死。
 *
 * ── ① 禁用选项的文字层级是**倒**的 ────────────────────────────────────
 * 选项行是 `<button class="qf-chip">`(照抄稿子的 `.opt`),一被 `disabled`
 * 就吃到 `styles/primitives.css` 的全局原语
 * `button:disabled { color: var(--text-faint) }`——特异性 (0,1,1),压过
 * `.qf-chip { color: var(--text) }` 的 (0,1,0),**标题**被刷成 `#bdbdbd`。
 * 而底下那行说明是个 `<span class="qf-chip-desc">`,`button:disabled` 根本
 * 匹配不到它,于是**保留** `--text-muted` `#5c5c5c`。
 * 结果:标题 `#bdbdbd` 比它自己的说明 `#5c5c5c` 还淡——主次颠倒,
 * 再叠上 `.qf-chip-disabled` 的 `opacity: .48` 一起变淡。
 *
 * 同一条渗漏还有第二个受害者:**已提交表单里被选中的那一项**也是 `disabled`,
 * `.qf-chip-on { color: var(--select-ink) }` 只有 (0,1,0),同样输给 (0,1,1),
 * 选中项的深色也被刷成 `#bdbdbd`。
 *
 * 判据(不自造):稿子 `8015870095:docs/design/chat-panel/src/components.css`
 *   · L1437-1444 `.opt { … color: var(--text); }`      ← 静息档
 *   · L1457-1459 `.opt.is-on { color: var(--select-ink); … }`  ← 选中档
 *   · `.opt` 一族**零处** `:disabled` / `.is-disabled`——稿子没画禁用态,
 *     禁用态照静息还原(同 `.btn:disabled:hover`「把静息值原样重述」那条规矩)。
 *
 * ── ② 可点的**选中**项,鼠标扫过会把勾的描边描出来 ────────────────────
 * 稿子 L1511 `.opts.mod-multi .opt.is-on .box { border-color: transparent; … }`
 * 是 (0,5,0),稳压 L1485 `.opt:hover .box { border-color: var(--text-soft) }`
 * 的 (0,3,0)——选中的勾在 hover 时**不该**被描回一圈灰边。
 * 我们搬过来时把 `.opts` 那层祖先和 `.opt` 那格元素类都省了,写成
 * `.qf-chip-on .qf-chip-box`,只剩 (0,2,0),于是输给 hover 那条。
 * 这就是规格里踩坑 25 的同一类事故(`specs/current/chat-panel-next.md`
 * 「搬交付稿的 CSS 时把祖先省掉,层叠就反了」),那条的处方也一样:
 * **把祖先补回去,并且要严格大于,不许打平靠源码顺序**。
 *
 * 上一轮给 hover 那条加了 `:not(:disabled)`,把**已锁**表单那一半挡住了
 * (那条回归护栏在 maxed-option-hover 那个文件里);**可点**的那一半没人管。
 *
 * ── 量法照 `question-form-maxed-option-hover.test.tsx` ─────────────────
 * 不用 CSS Module 代理;按 `index.css` 的顺序注入整条样式链自己算层叠
 * (`primitives.css` 是 ① 的病根,少注它这条 bug 根本量不出来);
 * hover 用真事件并当场核实指针位置;断言盯**具体色值**,不盯「两边相等」。
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

const TARGETS = ['color', 'border-top-color'] as const;

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

/** 指针停在选项行上时的读数;`target` 默认就是选项行自己。 */
function whileHovering(chip: Element, target: Element = chip): Record<string, string> {
  fireEvent.mouseOver(chip);
  if (!chip.matches(':hover')) throw new Error('指针没停上去 —— 这一量是假的');
  return CSS.resolved(target);
}

/** 静息态读数。先把指针挪开并**当场核实** —— `fireEvent.click` 会把指针留在点过的那一颗上。 */
function atRest(chip: Element, target: Element = chip): Record<string, string> {
  fireEvent.mouseOut(chip);
  if (chip.matches(':hover')) throw new Error('指针没挪走 —— 量到的其实是 hover 态');
  return CSS.resolved(target);
}

/* ── 夹具 ───────────────────────────────────────────────────────────── */

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

function desc(chip: Element): Element {
  const el = chip.querySelector('.qf-chip-desc');
  if (!el) throw new Error('这一项没有说明文字 —— 换一颗带 description 的选项');
  return el;
}

/* ── 稿子的原值(light,`8015870095` 的 `.opt` 一族) ─────────────────── */

const OPT_INK = '#494949'; // `.opt { color: var(--text) }`         静息标题
const OPT_INK_ON = '#353535'; // `.opt.is-on { color: var(--select-ink) }` 选中标题
const DESC_INK = '#5c5c5c'; // `.qf-chip-desc { color: var(--text-muted) }`(说明是产品自己加的一行)
const FAINT = '#bdbdbd'; // `primitives.css` 的 `button:disabled { color: var(--text-faint) }`
const BOX_HOVER = '#848484'; // `.opt:hover .box { border-color: var(--text-soft) }`

describe('① 禁用选项的文字层级:标题不该比它自己的说明还淡', () => {
  it('防真空:解析器确实看得见全局原语那条 `button:disabled` 在给 color', () => {
    // 它就是把标题刷淡的来源。解析器要是根本没读到 primitives.css,
    // 下面「标题是 #494949」会在解析器瞎了的时候假绿。
    const container = mount(CAPPED);
    const all = options(container);
    fireEvent.click(all[0]!);
    fireEvent.click(all[1]!);
    const maxed = options(container)[2]!;
    expect(maxed.disabled).toBe(true);
    expect(CSS.declaring(maxed, 'color').map((r) => r.selector)).toContain('button:disabled');
  });

  it('防真空:说明那一行确实是 `#5c5c5c`(比较的另一端不是空读数)', () => {
    const container = mount(CAPPED);
    const pickable = options(container)[0]!;
    expect(pickable.disabled).toBe(false);
    expect(CSS.resolved(desc(pickable)).color).toBe(DESC_INK);
  });

  it('选不了的那一项:标题照稿子的 `.opt` 静息色,不是全局原语刷的 `#bdbdbd`', () => {
    const container = mount(CAPPED);
    const all = options(container);
    fireEvent.click(all[0]!);
    fireEvent.click(all[1]!);
    const maxed = options(container)[2]!;
    expect(maxed.disabled).toBe(true);

    // 标题没有自己的类,颜色是从选项行继承下来的 —— 所以量的就是选项行的 color
    const title = atRest(maxed).color;
    expect(title).not.toBe(FAINT);
    expect(title).toBe(OPT_INK);
    // 层级正过来:标题(#494949)比说明(#5c5c5c)深
    expect(CSS.resolved(desc(maxed)).color).toBe(DESC_INK);
  });

  it('已提交表单里选中的那一项:仍是稿子的选中色,没被同一条渗漏刷淡', () => {
    // 同一条 `button:disabled` (0,1,1) 也压过 `.qf-chip-on` 的 (0,1,0)。
    const container = mount(CAPPED, { surfaces: ['web'] });
    const on = options(container).find((chip) => chip.getAttribute('aria-checked') === 'true');
    expect(on).toBeDefined();
    expect(on!.disabled).toBe(true);
    expect(atRest(on!).color).toBe(OPT_INK_ON);
  });
});

describe('② 可点的选中项:鼠标扫过不会把勾的描边描出来', () => {
  it('防真空:没选中的那一项**确实**量得出 hover 描边(否则本组全是假绿)', () => {
    const container = mount(CAPPED);
    const pickable = options(container)[0]!;
    expect(pickable.getAttribute('aria-checked')).toBe('false');
    expect(whileHovering(pickable, box(pickable))['border-top-color']).toBe(BOX_HOVER);
  });

  it('选中之后仍然可点(这一颗没有 disabled,上一轮那条 `:not(:disabled)` 够不着它)', () => {
    const container = mount(CAPPED);
    fireEvent.click(options(container)[0]!);
    const on = options(container)[0]!;
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(on.disabled).toBe(false);
  });

  it('鼠标扫过选中项,勾的描边仍是 transparent —— 照稿子 `.opts.mod-multi .opt.is-on .box`', () => {
    const container = mount(CAPPED);
    fireEvent.click(options(container)[0]!);
    const on = options(container)[0]!;
    expect(on.disabled).toBe(false);

    expect(atRest(on, box(on))['border-top-color']).toBe('transparent');
    expect(whileHovering(on, box(on))['border-top-color']).not.toBe(BOX_HOVER);
    expect(whileHovering(on, box(on))['border-top-color']).toBe('transparent');
  });
});
