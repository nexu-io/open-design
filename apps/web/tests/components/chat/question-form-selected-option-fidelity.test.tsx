// @vitest-environment jsdom
/**
 * 选项行「选中态」的两处小账 —— 都是上一轮修层叠渗漏
 * (`question-form-option-cascade-leak.test.tsx`)时路过看到、按守住范围没动的。
 *
 * ── ① 选中项的字重跟稿子差一档 ─────────────────────────────────────────
 * 最新稿 `361b78253e:docs/design/chat-panel/src/components.css` L1410-1412(交付稿
 * `8015870095` L1457-1459 同值):
 *   `.opt.is-on { color: var(--select-ink); font-weight: 500; }`
 * 上面那段注释(`361b78253e:1407-1408`)写得很明白:「选中态因此只剩两处变化:前面的控件
 * 填实(--pick),**文字使用 500** 并换成 --select-ink」。
 * 我们写的是 600。
 *
 * **600 不是抄错,是稿子改了我们没跟。** 上一版稿子 `1bbdce0b06`(2026-08-21)
 * 同一格写的就是 `font-weight: 600`,注释原文「文字**加粗到 600** 并换成
 * --brand-text」;我们那条是 `38aa03bff4`(2026-08-26,照那一版稿子重建聊天面板)
 * 落的,当时对。2026-09-01 稿子在 `8015870095` 里把这一档降到 500(顺带把
 * --brand-text 换成 --select-ink —— 颜色那一半我们已经跟上了,字重这一半漏了)。
 * 本分支对齐的是**最新稿** `361b78253e`(这一格 `853da24ea5` / `8015870095` 三版同值),
 * 所以这一格照 500。
 *
 * ── ② 「自己填」那颗勾的描边:hover 压过了选中 ──────────────────────────
 * 稿子 `361b78253e:1438` `.opt:hover .box { border-color: var(--text-soft) }` 是 (0,3,0),
 * 稳输给 `:1446` / `:1464` 的 `.opts.mod-* .opt.is-on .box`(0,5,0)—— 选中的勾在
 * hover 时不会被描回一圈灰边。
 *
 * 我们搬过来时,固定选项那一路(`.qf-chip-box`)上一轮已经把祖先补回去了
 * (`.qf-options .qf-chip.qf-chip-on .qf-chip-box`,(0,4,0));**「自己填」展开态
 * 用的是另一颗盒子** `.qf-chip-own-box`(稿子是静态 `<span class="box">`,产品
 * 换成真 `<button>` 以便键盘操作),它那一对没跟着改:
 *   `.qf-chip-other:hover .qf-chip-own-box`  → 2 类 + 1 伪类 = (0,3,0)
 *   `.qf-chip-on .qf-chip-own-box`           → 2 类        = (0,2,0)
 * 后者**低一档**,于是鼠标一扫,勾外面就描出一圈 `--text-soft` 的灰边 ——
 * 和缺陷 ② 一模一样的事故,只是换了一颗盒子。
 * (交接口径里把这两条记成「特异性打平、靠源码顺序碰巧赢」——量下来不是打平,
 *  是选中那条真的输了;`:hover` 本身就占一格类级。)
 *
 * 处方同上一轮:把祖先补回去、并且**严格大于**,不打平靠源码顺序
 * (`specs/current/chat-panel-next.md` 踩坑 25)。所以本文件除了盯色值,还
 * 直接把两条规则的**特异性大小关系**钉住 —— 只盯色值的话,哪天有人把它改回
 * 打平,色值仍然是对的(靠写在后面),护栏就漏过去了。
 *
 * ── 量法照 `question-form-maxed-option-hover.test.tsx` ────────────────────
 * 不用 CSS Module 代理;按 `index.css` 的顺序注入整条样式链自己算层叠
 * (`primitives.css` 里还有一条全局 `button { font-weight: 500 }` 在跟选项行抢
 *  同一个属性,少注它就量不出「到底是谁给的」);hover 用真事件并**当场核实**
 * 指针位置;断言盯具体值。
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
import { createResolver, hashed, specificity, type Rule } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const TARGETS = ['font-weight', 'border-top-color'] as const;

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

/** 指针停在 `chip` 上时 `target` 的读数;`target` 默认就是 `chip` 自己。 */
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

/** 指认「给这个属性下过声明、且选择器里含 `needle`」的**那一条**规则。 */
function soleRule(el: Element, prop: string, needle: string): Rule {
  const hits = CSS.declaring(el, prop).filter((r) => r.selector.includes(needle));
  if (hits.length !== 1) {
    throw new Error(
      `期望正好一条含 "${needle}" 且声明 ${prop} 的规则,实得 ${hits.length} 条:` +
        hits.map((r) => r.selector).join(' | '),
    );
  }
  return hits[0]!;
}

/* ── 夹具 ───────────────────────────────────────────────────────────── */

const FORM: QuestionForm = {
  id: 'surfaces',
  title: '还需要确认一件事',
  lang: 'zh-CN',
  questions: [
    {
      id: 'surfaces',
      label: '这次要覆盖哪几个端?',
      type: 'checkbox',
      options: [
        { label: '响应式网页(推荐)', value: 'web', description: '一套版式适配桌面和手机。' },
        { label: '桌面网页', value: 'desktop' },
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

/** 固定选项行(不含「自己填」那一颗 —— 它是 `.qf-chip-other`)。 */
function options(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('.qf-chip:not(.qf-chip-other)')];
}

/** 「自己填」那一项(收起态是 `<button>`,展开态是 `<div>`)。 */
function otherChip(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.qf-chip-other');
  if (!el) throw new Error('没有「自己填」这一项 —— 夹具或组件变了,先修这里');
  return el;
}

/** 展开「自己填」,返回展开后那一行和它里面那颗勾选圈。 */
function expandOther(container: HTMLElement): { row: HTMLElement; box: HTMLElement } {
  fireEvent.click(otherChip(container));
  const row = otherChip(container);
  if (!row.classList.contains('qf-chip-on')) {
    throw new Error('「自己填」没展开 —— 它展开态才带 qf-chip-on');
  }
  const box = row.querySelector<HTMLElement>('.qf-chip-own-box');
  if (!box) throw new Error('展开态里没有 .qf-chip-own-box —— 组件结构变了,先修这里');
  return { row, box };
}

/* ── 稿子的原值(light,`361b78253e` 的 `.opt` 一族) ─────────────────── */

/*
 * ⚠️ 2026-09-02 改过一次(W86)。这里原来写的是 `静息 = 500`,理由是
 * 「稿子 `body { font-weight: 500 }` 是基线,而 `.opt` 一个字重都不写,所以继承 500」。
 * **那条推理错在前提上**:`<button>` 的字重默认**不继承** —— 浏览器 UA 给按钮用的是
 * `font` 简写(Chrome `font: 400 13.3333px Arial`),简写把 `font-weight` 一并压成 400。
 * 稿子的全局复位只写 `font-family: inherit`,所以稿子的静息选项行停在 UA 的 400。
 * 同一条推理 `638596f84a` 已经在 `typography-baseline.test.ts` 上纠过一次。
 *
 * 实测(系统 Chrome headless,交付稿 `729fa43ce7` 的组件全集页,同一次会话注一颗 400、
 * 一颗 500 的按钮做防真空,读回 400 / 500):
 *   `.opt`(静息)          → 400 × 12,一个例外都没有
 *   `.opt > span`(选项文案) → 400(继承按钮),只有 `.is-on` 那行的 span 是 500
 *   `.opt.is-on`           → 500(它自己亲自写)
 *   `.opt .own-l`          → 500(它自己亲自写,见下面 OPT_WEIGHT)
 */
const OPT_AT_REST_WEIGHT = '400';
/** `.opt .own-l { font-weight: 500 }` —— 稿子在这一格**亲自写了** 500,实测 500。 */
const OPT_WEIGHT = '500';
const OPT_WEIGHT_ON = '500'; // `.opt.is-on { font-weight: 500 }`(`361b78253e:1410-1412`)
const STALE_WEIGHT_ON = '600'; // 上一版稿子 `1bbdce0b06:1524` 的旧值,选项行已经不在这儿了
const BOX_HOVER = '#848484'; // `.opt:hover .box { border-color: var(--text-soft) }`(`:1438`)
const BOX_ON = 'transparent'; // `.opts.mod-* .opt.is-on .box { border-color: transparent }`

describe('① 选中的选项行照最新稿的 500,不是上一版稿子的 600', () => {
  it('防真空:解析器确实看得见全局原语那条 `button { font-weight: 500 }`', () => {
    // 它和选项行抢同一个属性。解析器要是根本没读到 primitives.css,
    // 下面「静息档是谁给的」就无从分辨,几条断言会在解析器瞎了的时候假绿。
    const container = mount(FORM);
    const sources = CSS.declaring(options(container)[0]!, 'font-weight').map((r) => r.selector);
    expect(sources).toContain('button');
  });

  it('没选中那一档是稿子的 400(比较的另一端不是空读数)', () => {
    const container = mount(FORM);
    const chip = options(container)[0]!;
    expect(chip.getAttribute('aria-checked')).toBe('false');
    expect(atRest(chip)['font-weight']).toBe(OPT_AT_REST_WEIGHT);
  });

  it('点中之后是 500', () => {
    const container = mount(FORM);
    fireEvent.click(options(container)[0]!);
    const on = options(container)[0]!;
    expect(on.getAttribute('aria-checked')).toBe('true');

    const weight = atRest(on)['font-weight'];
    expect(weight).not.toBe(STALE_WEIGHT_ON);
    expect(weight).toBe(OPT_WEIGHT_ON);
  });

  it('护栏:选中那条**自己**给了 500,不是从静息档漏下来的', () => {
    /*
     * 基线抬到 500 之后静息和选中同档,只盯读数就分不出「选中那条还在不在」——
     * 把 `.qf-options .qf-chip.qf-chip-on` 整条删掉,读数照样是 500(静息给的)。
     * 所以这里直接指认那条规则,并钉住它**严格压得过**静息档(踩坑 25 的口径:
     * 不打平靠源码顺序)。稿子那边同理:`.opt.is-on { font-weight: 500 }`
     * 是显式写着的一条,不是省略。
     */
    const container = mount(FORM);
    fireEvent.click(options(container)[0]!);
    const on = options(container)[0]!;
    const onRule = soleRule(on, 'font-weight', 'qf-chip-on');
    const restRule = CSS.declaring(on, 'font-weight').find((r) => r.selector === '.qf-chip');
    expect(restRule, '静息那条不叫 `.qf-chip` 了 —— 先修这里').toBeDefined();
    expect(specificity(onRule.selector)).toBeGreaterThan(specificity(restRule!.selector));
  });

  it('已提交表单里选中的那一项,同样是 500', () => {
    const container = mount(FORM, { surfaces: ['web'] });
    const on = options(container).find((chip) => chip.getAttribute('aria-checked') === 'true');
    expect(on).toBeDefined();
    expect(atRest(on!)['font-weight']).toBe(OPT_WEIGHT_ON);
  });

  it('「自己填」那句标题和稿子一致,是 500 不是旧稿的 600', () => {
    /*
     * 最新稿 `361b78253e:components.css:1489`(`853da24ea5:1488` / `8015870095:1536` 同值)写的是
     * `.opt .own-l { display: block; font-weight: 500 }`;600 出自**上一版**
     * `1bbdce0b06:1524`,那一版的 `body` 还没有字重、全局基线是 400,
     * 所以标题要靠自己加粗才跳得出来。基线抬到 500 之后这一档跟着降到 500。
     *
     * 稿子里 `.own-l` 只存在于展开态(收起态是个没有类名的裸 `<span>`),
     * 我们两态复用同一个 `qf-own-label` —— 两态现在都是 500,不再需要用祖先
     * `.qf-own` 把 600 圈在展开态里。
     */
    const container = mount(FORM);
    const { row } = expandOther(container);
    const label = row.querySelector('.qf-own .qf-own-label');
    expect(label).not.toBeNull();
    expect(CSS.resolved(label!)['font-weight']).toBe(OPT_WEIGHT);
  });
});

describe('② 「自己填」展开后,鼠标扫过不会把勾的描边描出来', () => {
  it('防真空:没选中的固定选项**确实**量得出 hover 描边(否则本组全是假绿)', () => {
    const container = mount(FORM);
    const pickable = options(container)[0]!;
    expect(pickable.getAttribute('aria-checked')).toBe('false');
    expect(whileHovering(pickable, pickable.querySelector('.qf-chip-box')!)['border-top-color']).toBe(
      BOX_HOVER,
    );
  });

  it('静息态那颗勾是无边的(照稿子 `.opts.mod-* .opt.is-on .box`)', () => {
    const container = mount(FORM);
    const { row, box } = expandOther(container);
    expect(atRest(row, box)['border-top-color']).toBe(BOX_ON);
  });

  it('鼠标扫过整行,那颗勾仍然无边', () => {
    const container = mount(FORM);
    const { row, box } = expandOther(container);
    const hovered = whileHovering(row, box)['border-top-color'];
    expect(hovered).not.toBe(BOX_HOVER);
    expect(hovered).toBe(BOX_ON);
  });

  it('护栏:选中那条的特异性**严格大于** hover 那条,不许打平靠源码顺序', () => {
    // 只盯色值挡不住回退成打平 —— 打平时色值仍然是对的(选中那条写在后面)。
    // 踩坑 25 栽的就是这一下,所以这里直接把大小关系钉死。
    const container = mount(FORM);
    const { row, box } = expandOther(container);
    fireEvent.mouseOver(row);
    expect(row.matches(':hover')).toBe(true);

    const hoverRule = soleRule(box, 'border-top-color', ':hover');
    const onRule = soleRule(box, 'border-top-color', 'qf-chip-on');
    expect(hoverRule.selector).toContain('.qf-chip-own-box');
    expect(onRule.selector).toContain('.qf-chip-own-box');
    expect(specificity(onRule.selector)).toBeGreaterThan(specificity(hoverRule.selector));
  });
});
