// @vitest-environment jsdom
/**
 * 意图澄清卡里几格**没跟上最新稿**的账。
 *
 * ── 基线 ──────────────────────────────────────────────────────────────
 * `729fa43ce7:docs/design/chat-panel/src/components.css`
 * (`origin/design/chat-cards-surface` 的头)。**永远跟最新版。**
 *
 * ⚠️ 基线从 `361b78253e` 前移到 `729fa43ce7` 时,这张卡上只动了**一条**:
 *   `17841fa8e1`  `.opt { font-size: var(--t-mini) → var(--t-body) }`(12 → 13)
 * 下面「防真空」那条拿 `.qf-chip` 当量尺标定件,期望值因此从 `T_MINI` 换成
 * `T_BODY`。`.opt` 里面那格 `.own-ta` 稿子**没动**,仍是 `--t-mini` ——
 * 半迁移护栏在 `tests/components/chat/w67-text-axes.test.tsx`。
 * 本文件涉及的其余几段(字号梯子 / `.language-*` / `.color-*` / `.amount-*` /
 * `.answered`)在 `853da24ea5 → 729fa43ce7` 之间逐字节未变。
 *
 * ── 验收判据:1:1,拿稿子的**字面值**当期望值 ─────────────────────────
 * 断言里写的每一个数都是稿子那条规则算出来的**最终值**,不是「用了哪个变量」:
 *   `var(--t-cap)` / `var(--t-mini)` → `12px`,`var(--t-lead)` → `14px`,
 *   `var(--text-muted)` → `#5c5c5c`,`var(--text-strong)` → `#202020`,
 *   `var(--text-soft)` → `#848484`,`var(--brand-text)` → `#0d5400`,
 *   `var(--border)` → `#dbdbdb`,`var(--border-strong)` → `#bdbdbd`,
 *   `var(--selected)` → `#353535`,`var(--radius-pill)` → `999px`,
 *   `var(--stroke-thin)` → `1px`,`var(--duration-faster)` → `100ms`。
 * 这些字面值取自稿子自己的 `docs/design/chat-panel/src/tokens.css`,和产品
 * `styles/tokens.css` / `styles/base.css` 里同名 token **逐字节相同** ——
 * 所以「走产品变量」和「值和稿子一致」这两条同时成立,不是挑了个最接近的。
 *
 * ── 量法 ──────────────────────────────────────────────────────────────
 * 用共享量尺 `tests/helpers/chat-mirror-cascade.ts` 自己算层叠 —— jsdom 不做
 * 特异性、不解 `var()`、逻辑属性读回上一条物理简写的值,`getComputedStyle`
 * 在这一族上是靠不住的。样式表按 `index.css` 的顺序整条注入;少注
 * `primitives.css` 这类全局原语,好几条断言会读到一个根本不存在的元素。
 *
 * 三个属性量尺的 `expand()` 没有格子(`box-sizing` / `transition` /
 * `font-family`),那几条改用 jsdom 的 `getComputedStyle` —— 它不解 `var()`,
 * 但**规则原文照读**、自定义属性照继承,所以「声明是哪一条 + 那条变量的字面值」
 * 两半拼起来仍旧是一个字面读数。各自带一条防真空。
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

const TARGETS = [
  'font-size',
  'font-weight',
  'color',
  'width',
  'height',
  'min-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'box-shadow',
] as const;

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

/** 产品 `index.css` 的导入顺序(只取够得着这张卡的那几张)。 */
const CSS = createResolver(
  SHEETS,
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/** `box-sizing` / `transition` 那两条走 jsdom;同一条样式链,同一个顺序。 */
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = SHEETS.map((css) => css.replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  document.head.append(style);
});

/* ── 稿子的字面值(light,取自 `361b78253e:docs/design/chat-panel/src/tokens.css`)──
 * 每一个都和产品 `styles/tokens.css` / `styles/base.css` 里的同名 token 逐字节相同。
 */

/** `--t-cap` / `--t-mini` → `--font-size-12`(稿子 tokens.css:291)。 */
const T_MINI = '12px';
/** `--t-body` → `--font-size-13`(稿子 tokens.css:292);`729fa43ce7` 起 `.opt` 走这一档。 */
const T_BODY = '13px';
/** `--t-lead` → `--font-size-14`(稿子 tokens.css:296)。 */
const T_LEAD = '14px';
/** 稿子 `body { font-weight: 500 }`(`361b78253e:151-153`)。 */
const BASELINE_WEIGHT = '500';
/**
 * 静息选项行那一档 —— **不是**基线那个 500。
 *
 * ⚠️ 2026-09-02 改过一次(W86)。`<button>` 的字重默认**不继承**:浏览器 UA 给按钮用的
 * 是 `font` 简写(Chrome `font: 400 13.3333px Arial`),简写把 `font-weight` 一并压成 400。
 * 稿子的全局复位(`729fa43ce7:components.css:170`)只写 `font-family: inherit`,
 * 所以稿子的 `.opt` 停在 UA 的 400,不跟 `body` 的 500。同一条推理 `638596f84a`
 * 已经在 `typography-baseline.test.ts` 上纠过一次。
 * 实测(系统 Chrome headless + 交付稿 `729fa43ce7` 组件全集页,防真空:同一次会话
 * 注一颗 400、一颗 500 的按钮,读回 400 / 500):`.opt` 静息 400 × 12,无例外。
 * 旁边那两处 `BASELINE_WEIGHT` 仍是 500,因为稿子在 `.ak` / `.own-ta` 上**亲自写了** 500。
 */
const OPT_AT_REST_WEIGHT = '400';
/** `--text-muted`(稿子 tokens.css:63)。 */
const TEXT_MUTED = '#5c5c5c';
/** `--text-strong`(稿子 tokens.css:62)。 */
const TEXT_STRONG = '#202020';
/** `--text-soft`(稿子 tokens.css:64)。 */
const TEXT_SOFT = '#848484';
/** `--brand-text`(稿子 tokens.css:76)。 */
const BRAND_TEXT = '#0d5400';
/** `--sans`(稿子 tokens.css:155);jsdom 把逗号后的空格吃掉,比较前统一归一。 */
const SANS = '"Albert Sans", "PingFang SC", "Microsoft YaHei", sans-serif';
/** `--mono`(稿子 tokens.css:156)。 */
const MONO = '"JiduMono Pro", ui-monospace, "SFMono-Regular", monospace';
const tidy = (v: string): string => v.replace(/\s*,\s*/g, ', ').trim();

function mount(form: QuestionForm, over: Record<string, unknown> = {}): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <div className="app">
        <div className={chatRootStyles.root} data-chat-root="">
          <div className="chat-log">
            <div className="msg assistant">
              <div className="prose-block">
                <QuestionFormView form={form} interactive onSubmit={() => {}} {...over} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </I18nProvider>,
  );
  return container;
}

function pick<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`夹具里没有 ${selector} —— 组件结构变了,先修这里`);
  return el;
}

/* ── 夹具 ───────────────────────────────────────────────────────────── */

/** 查找型单选:带分组 + 行尾副标,才走 `.qf-select-*` 那一路。 */
const SELECT_FORM: QuestionForm = {
  id: 'lang',
  title: '还需要确认一件事',
  questions: [
    {
      id: 'locale',
      label: '这次的会话用哪种语言?',
      type: 'select',
      options: [
        { label: '简体中文', value: 'zh-CN', group: '常用', trailingLabel: 'ZH-CN' },
        { label: 'English', value: 'en', group: '常用', trailingLabel: 'EN' },
        { label: '繁體中文', value: 'zh-TW', group: '更多', trailingLabel: 'ZH-TW' },
      ],
    },
  ],
};

/** 最普通的一档:竖排选项行(`.qf-chip`),量尺的标定件。 */
const RADIO_FORM: QuestionForm = {
  id: 'surfaces',
  title: '还需要确认一件事',
  questions: [
    {
      id: 'surfaces',
      label: '这次要覆盖哪几个端?',
      type: 'radio',
      options: [{ label: '响应式网页', value: 'web' }],
    },
  ],
};

const COLOR_FORM: QuestionForm = {
  id: 'brand',
  title: '还需要确认一件事',
  questions: [{ id: 'accent', label: '主题色', type: 'color' }],
};

const AMOUNT_FORM: QuestionForm = {
  id: 'density',
  title: '还需要确认一件事',
  questions: [
    { id: 'density', label: '版面密度', type: 'range', min: 1, max: 5, step: 1, defaultValue: '2' },
  ],
};

/* ══ ① 字号 / 字色:逐格对着稿子那条规则的最终值 ═══════════════════════ */

describe('① 字号 / 字色 1:1 —— 逐格对着稿子那条规则读', () => {
  it('防真空:量尺确实解得开 `var()`,读回的是字面值', () => {
    // 解不开的话下面全组会拿 `var(--font-size-13)` 去比 `13px`,一路假红。
    // 选项行(`.qf-chip`)今天写的就是这个 token,拿它当标尺。
    // ⚠️ `729fa43ce7`(`17841fa8e1`)把稿子的 `.opt` 从 `--t-mini` 抬到了 `--t-body`,
    //    所以标定件的期望值是 13,不是 12 —— 别照着旧基线改回去。
    const container = mount(RADIO_FORM);
    const measured = CSS.resolved(pick(container, '.qf-chip'));
    expect(measured['font-size'], '样式链没盖到这张卡').not.toBe(UNSET);
    expect(measured['font-size'], 'token 没解开 —— 下面全组的比较都不成立').toBe(T_BODY);
  });

  it('分组标签 —— 稿子 `361b78253e:1530-1533`(12px / #5c5c5c / 500)', () => {
    //   .language-group-label { display:block; padding:7px 10px 3px;
    //     color: var(--text-muted); font-size: var(--t-cap); font-weight: 500; }
    const measured = CSS.resolved(pick(mount(SELECT_FORM), '.qf-select-group-label'));
    expect(measured['font-size']).toBe(T_MINI);
    expect(measured['color']).toBe(TEXT_MUTED);
    expect(measured['font-weight']).toBe('500');
  });

  it('行尾副标 —— 稿子 `361b78253e:1543-1547`(12px / #5c5c5c)', () => {
    //   .language-option .language-code { margin-inline-start:auto;
    //     color: var(--text-muted); font-size: var(--t-cap); font-variant-numeric: tabular-nums; }
    const measured = CSS.resolved(pick(mount(SELECT_FORM), '.qf-select-trailing'));
    expect(measured['font-size']).toBe(T_MINI);
    expect(measured['color']).toBe(TEXT_MUTED);
  });

  it('颜色那两句小标题 —— 稿子 `361b78253e:1566-1570`(12px / #202020)', () => {
    //   .color-field legend, .color-label { display:block; margin:0 0 6px;
    //     font-size: var(--t-mini); font-weight: 600; color: var(--text-strong); }
    const legends = [...mount(COLOR_FORM).querySelectorAll('.qf-color-legend')];
    expect(legends.length, '颜色那一格只渲染出一句小标题?夹具或组件变了').toBe(2);
    for (const legend of legends) {
      const measured = CSS.resolved(legend);
      expect(measured['font-size']).toBe(T_MINI);
      expect(measured['color']).toBe(TEXT_STRONG);
    }
  });

  it('那两句小标题的字重**不同档** —— 预设那句 500,自定义那句 600', () => {
    /*
     * 稿子给这两句写的是同一条底(`361b78253e:1566-1570`,`font-weight: 600`),
     * 然后**只**给 `<legend>` 单独降一档:
     *   `.opts.mod-color .color-field > legend { font-weight: 500 }`(`:1700`)。
     * 稿子自己的示例页把这两句分别落在两种元素上(`chat-panel-next.html`):
     *   `:4904-4905` `<fieldset class="color-field"><legend>预设颜色</legend>`  → 500
     *   `:4917-4918` `<div class="color-field"><label class="color-label">自定义颜色</label>` → 600
     * 我们两句复用同一个 `qf-color-legend`,搬过来时只留了 500 那一档,
     * 自定义那句跟着降了 —— 稿子没让它降。按元素分档,和稿子一样。
     */
    const container = mount(COLOR_FORM);
    const legend = pick(container, 'legend.qf-color-legend');
    const label = pick(container, 'label.qf-color-legend');
    expect(legend.textContent, '预设那句和自定义那句认反了').not.toBe(label.textContent);
    expect(CSS.resolved(legend)['font-weight']).toBe('500');
    expect(CSS.resolved(label)['font-weight']).toBe('600');
  });

  it('色值输入框 —— 稿子 `361b78253e:1594-1599`(12px / #202020 / mono)', () => {
    //   .color-hex { …; color: var(--text-strong);
    //     font-family: var(--mono); font-size: var(--t-mini); }
    const container = mount(COLOR_FORM);
    const hex = pick(container, '.qf-color-hex');
    const measured = CSS.resolved(hex);
    expect(measured['font-size']).toBe(T_MINI);
    expect(measured['color']).toBe(TEXT_STRONG);
    // 字族量尺没有格子,改用 jsdom:声明是哪一条 + 那条变量的字面值,两半合起来是字面读数。
    expect(getComputedStyle(hex).fontFamily).toBe('var(--mono)');
    expect(tidy(getComputedStyle(hex).getPropertyValue('--mono'))).toBe(MONO);
  });

  it('颜色实时预览 —— 稿子 `361b78253e:1603-1608`(12px / min-height 48px)', () => {
    //   .color-preview { min-height:48px; display:flex; align-items:center;
    //     padding:9px 11px; border:1px solid var(--border); border-radius: var(--radius);
    //     background: color-mix(in srgb, var(--choice-color) 12%, var(--bg));
    //     color: var(--choice-color); font-size: var(--t-mini); line-height: var(--lh-row); }
    // 这一格和上面两句小标题同在颜色那一块,其余属性早就一致,只有字号落在 11px。
    const measured = CSS.resolved(pick(mount(COLOR_FORM), '.qf-color-preview'));
    expect(measured['font-size']).toBe(T_MINI);
    expect(measured['min-height']).toBe('48px');
  });

  it('滑杆两端的数字 —— 稿子 `361b78253e:1770-1773`(12px / #5c5c5c)', () => {
    //   .amount-limits { display:flex; justify-content:space-between;
    //     color: var(--text-muted); font-size: var(--t-cap); font-variant-numeric: tabular-nums; }
    const measured = CSS.resolved(pick(mount(AMOUNT_FORM), '.qf-amount-limits'));
    expect(measured['font-size']).toBe(T_MINI);
    expect(measured['color']).toBe(TEXT_MUTED);
  });

  it('边界:稿子里没有对应规则的那一格**不动** —— 色值报错行', () => {
    /*
     * 稿子对非法色值只有一条 `.color-hex[aria-invalid="true"] { border-color: var(--red) }`
     * (`361b78253e:1602`),**没有**任何报错文字的规则 —— 它是我们补的。
     * 既然没有可对照的原值,就不许按「梯子下限是 12px」把它推到 12:那是自行发挥。
     * 这条断言钉住的是「保持现状、等产品拍板」,不是宣称和稿子一致。
     */
    const container = mount(COLOR_FORM);
    // 只敲字、**不失焦** —— 失焦会把在编文本整个回滚,报错行跟着消失。
    fireEvent.change(pick<HTMLInputElement>(container, '.qf-color-hex'), {
      target: { value: '#12' },
    });
    const error = container.querySelector('.qf-color-error');
    expect(error, '打了一个非法色值,报错那行没出来 —— 这条会变成空转').not.toBeNull();
    expect(CSS.resolved(error!)['font-size']).toBe('11px');
  });
});

/* ══ ② 折叠箭头的过渡时长硬写了 140ms ══════════════════════════════════ */

describe('② 「更多选项」箭头的过渡时长走 token,不硬写毫秒', () => {
  it('防真空:`--duration-faster` 在那颗箭头的作用域里取得到,而且是 100ms', () => {
    // 变量取不到的话,换成 `var(--duration-faster)` 就等于把过渡整个关掉 ——
    // 那种「改对了、效果没了」的偏差,只盯规则原文是看不见的。
    const container = mount(SELECT_FORM);
    const arrow = pick(container, '.qf-select-more-toggle svg');
    expect(getComputedStyle(arrow).getPropertyValue('--duration-faster').trim()).toBe('100ms');
  });

  it('防真空:样式链确实盖到了那颗箭头(不是在量一个没规则的元素)', () => {
    const container = mount(SELECT_FORM);
    expect(CSS.resolved(pick(container, '.qf-select-more-toggle svg'))['width']).toBe('14px');
  });

  it('稿子 `.language-more-toggle svg { transition: transform var(--duration-faster) var(--ease-out) }`', () => {
    const container = mount(SELECT_FORM);
    const transition = getComputedStyle(pick(container, '.qf-select-more-toggle svg')).transition;
    expect(transition, '时长写死了毫秒,没走 token').toBe(
      'transform var(--duration-faster) var(--ease-out)',
    );
  });
});

/* ══ ③⑦ 「已确认」陈述块:关键词字重 + 「已确认」那个词的字号 ═════════ */

describe('③⑦ 「已确认」陈述块跟上最新稿', () => {
  const answered = (): HTMLElement => {
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <div className={chatRootStyles.root} data-chat-root="">
          <QuestionFormView
            form={COLOR_FORM}
            interactive={false}
            submittedAnswers={{ accent: '#3b82f6' }}
            onSubmit={() => {}}
          />
        </div>
      </I18nProvider>,
    );
    return pick(container, '.answered');
  };

  it('③ 关键词 `.ak` —— 稿子 `361b78253e:2099`(500 / #848484)', () => {
    //   .answered .ak { margin-inline-end:6px; color: var(--text-soft); font-weight: 500; }
    // 三版稿子(`8015870095` / `853da24ea5` / `361b78253e`)同值,这一格没分叉。
    const measured = CSS.resolved(pick(answered(), '.ak'));
    expect(measured['font-weight']).toBe(BASELINE_WEIGHT);
    expect(measured['color']).toBe(TEXT_SOFT);
  });

  it('⑦ 「已确认」那个词 —— 稿子 `361b78253e:2081`(14px / #0d5400)', () => {
    //   .answered .k { margin-bottom:3px; font-size: var(--t-lead); color: var(--brand-text); }
    // 字号那一条是 `853da24ea5` 才补上的,交付稿 `8015870095:2124` 还没有。跟最新版。
    const measured = CSS.resolved(pick(answered(), '.k'));
    expect(measured['font-size']).toBe(T_LEAD);
    expect(measured['color']).toBe(BRAND_TEXT);
  });
});

/* ══ ④ 「短答案」这一档:颜色**和数值**都算 ═══════════════════════════ */

describe('④ 数值答案也是稿子说的「短答案」,一样挂 mod-value', () => {
  const answeredRow = (form: QuestionForm, answers: Record<string, string>): HTMLElement => {
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <QuestionFormView
          form={form}
          interactive={false}
          submittedAnswers={answers}
          onSubmit={() => {}}
        />
      </I18nProvider>,
    );
    return pick(container, '.answered .ab');
  };

  it('防真空:颜色那一格今天就挂着(比较的另一端不是空读数)', () => {
    // 稿子 `361b78253e:chat-panel-next.html:5078` 的示例正是这一格:
    // `<div class="ab mod-value"><span class="ak">主题色</span><span class="color-answer">…`
    expect(answeredRow(COLOR_FORM, { accent: '#3b82f6' }).classList).toContain('mod-value');
  });

  it('数值那一格也要挂 —— 稿子示例 `<div class="ab mod-value">…<b>2 档</b></div>`', () => {
    // `361b78253e:chat-panel-next.html:5087`,和上面那格并排;规则本身
    // (`components.css:2084`)上方的注释写的是「**颜色和数值**的短答案行内部垂直居中」。
    expect(answeredRow(AMOUNT_FORM, { density: '2' }).classList).toContain('mod-value');
  });

  it('纯数字输入框那一档同样算数值', () => {
    const form: QuestionForm = {
      id: 'count',
      title: '还需要确认一件事',
      questions: [{ id: 'pages', label: '页数', type: 'number' }],
    };
    expect(answeredRow(form, { pages: '12' }).classList).toContain('mod-value');
  });

  it('边界:一句话的文字答案**不算**短答案,不许跟着挂上', () => {
    const form: QuestionForm = {
      id: 'kind',
      title: '还需要确认一件事',
      questions: [{ id: 'kind', label: '做什么', type: 'text' }],
    };
    expect(answeredRow(form, { kind: '一张编辑风格的落地页' }).classList).not.toContain('mod-value');
  });

  it('边界:数值题被跳过时念的是「已跳过」,那是句话不是值', () => {
    const row = answeredRow(AMOUNT_FORM, { density: '' });
    expect(row.textContent, '跳过那一档没念出来 —— 这条会变成空转').toContain('已跳过');
    expect(row.classList).not.toContain('mod-value');
  });
});

/* ══ ⑤ 选项行一族跟着 500 字重基线走 ═════════════════════════════════ */

describe('⑤ 选项行一族跟上 500 基线', () => {
  it('静息态那一档由 `.qf-chip` **自己**给,不寄生在全局 `button` 原语上', () => {
    /*
     * 这一格和 `primitives.css` 那条裸 `button { font-weight: 500 }` 抢同一个属性,
     * 所以只盯读数不够 —— 还要指认**是谁赢的**:寄生在那条全局原语上的话,
     * 它一改这张卡就跟着漂,而漂的原因和这张卡毫无关系。
     * ⚠️ 期望值 2026-09-02 从 500 改到 400(W86):稿子的 `.opt` 停在 UA 的 400,
     * 不跟 `body` 的 500 —— 理由和实测写在 `OPT_AT_REST_WEIGHT` 上。
     */
    const container = mount(RADIO_FORM);
    const chip = pick(container, '.qf-chip');
    const sources = CSS.declaring(chip, 'font-weight').map((r) => r.selector);
    expect(sources, '样式链没注全 —— 全局原语那条不在,这一量不成立').toContain('button');
    expect(sources, '`.qf-chip` 自己没给字重,静息档是从全局原语漏下来的').toContain('.qf-chip');
    expect(CSS.resolved(chip)['font-weight']).toBe(OPT_AT_REST_WEIGHT);
  });

  const OWN_FORM: QuestionForm = {
    id: 'surfaces',
    title: '还需要确认一件事',
    questions: [
      {
        id: 'surfaces',
        label: '这次要覆盖哪几个端?',
        type: 'radio',
        allowCustom: true,
        options: [{ label: '响应式网页', value: 'web' }],
      },
    ],
  };

  it('稿子 `.opt .own-ta { font-weight: 500 }` —— 显式写死的一档,不是继承来的', () => {
    /*
     * 稿子 `361b78253e:1497-1503`:
     *   .opt .own-ta { …; font-family: inherit; font-size: var(--t-mini);
     *                  font-weight: 500; line-height: var(--lh-row); }
     * 上一版稿子 `1bbdce0b06:1532-1538` 那条**不写字重**(那时 `body` 也没写,
     * 全局基线是 400);交付稿起 `body { font-weight: 500 }` 落地,同一条同时
     * 补上了 `font-weight: 500`。两处是一起动的,不是各自的巧合。
     * 我们这边全局 `input, textarea, select { font: inherit }` 把继承打开了,
     * 所以这一格必须自己说出来才等价。
     */
    const container = mount(OWN_FORM);
    fireEvent.click(pick(container, '.qf-chip-other'));
    const input = pick(container, '.qf-own-input');
    expect(CSS.resolved(input)['font-weight']).toBe(BASELINE_WEIGHT);
  });
});

/* ══ ⑥ 数值滑块照最新稿改版 ═════════════════════════════════════════ */

describe('⑥ 数值滑块照最新稿 —— 数字框成框、轨道换圆角档', () => {
  const box = (): HTMLInputElement => {
    const container = mount(AMOUNT_FORM);
    return pick<HTMLInputElement>(container, '.qf-amount-value');
  };

  it('读数行 —— 稿子 `361b78253e:1722-1725`(min-height 42px / #202020)', () => {
    //   .amount-readout { min-height:42px; display:flex; align-items:flex-start;
    //     justify-content:center; gap:4px; color: var(--text-strong);
    //     font-variant-numeric: tabular-nums; }
    const measured = CSS.resolved(pick(mount(AMOUNT_FORM), '.qf-amount-readout'));
    expect(measured['min-height']).toBe('42px');
    expect(measured['color']).toBe(TEXT_STRONG);
  });

  it('数字框的字:32px / 600 / 继承色 / --sans —— 稿子 `361b78253e:1726-1731`', () => {
    //   .amount-value-input { …; background: transparent; color: inherit;
    //     font-family: var(--sans); font-size:32px; font-weight:600;
    //     line-height:34px; text-align:center; }
    const el = box();
    const measured = CSS.resolved(el);
    expect(measured['font-size']).toBe('32px');
    expect(measured['font-weight']).toBe('600');
    // 稿子写 `var(--sans)`,我们写 `font-family: inherit` —— 往上继承到
    // `body { font-family: var(--sans) }`(`base.css:46`,和稿子 `:151` 同写法),
    // 所以**算出来的**是同一个字族串。这里把这两半都读出来,不停在「用了变量」。
    expect(getComputedStyle(el).fontFamily).toBe('var(--sans)');
    expect(tidy(getComputedStyle(el).getPropertyValue('--sans'))).toBe(SANS);
    // 稿子的 `color: inherit` 往上落到 `.amount-readout` 的 `--text-strong`。
    expect(CSS.resolved(pick(mount(AMOUNT_FORM), '.qf-amount-readout'))['color']).toBe(TEXT_STRONG);
  });

  it('数字框:1.35em × 42px,内距 3px 2px', () => {
    const measured = CSS.resolved(box());
    expect(measured['width']).toBe('1.35em');
    expect(measured['height']).toBe('42px');
    expect(measured['padding-top']).toBe('3px');
    expect(measured['padding-right']).toBe('2px');
    expect(measured['padding-bottom']).toBe('3px');
    expect(measured['padding-left']).toBe('2px');
  });

  it('数字框平时就带一圈描边 —— 稿子 `border: var(--stroke-thin) solid var(--border)`', () => {
    const measured = CSS.resolved(box());
    expect(measured['border-top-style'], '还是无边的那一版').toBe('solid');
    expect(measured['border-top-width']).toBe('1px');
    expect(measured['border-top-color']).toBe('#dbdbdb');
  });

  it('描边之后尺寸按边框盒算 —— 不然 1.35em 会连描边一起往外长', () => {
    // `base.css` 的 `* { box-sizing: border-box }` 已经给了这一档,
    // 这里要挡的是那条 `box-sizing: content-box` 的显式覆盖。
    expect(getComputedStyle(box()).boxSizing).toBe('border-box');
  });

  it('悬停把描边压深一档 —— 稿子 `:hover { border-color: var(--border-strong) }`', () => {
    const el = box();
    fireEvent.mouseOver(el);
    if (!el.matches(':hover')) throw new Error('指针没停上去 —— 这一量是假的');
    expect(CSS.resolved(el)['border-top-color']).toBe('#bdbdbd');
  });

  /*
   * ⚠️ 可访问性:稿子把聚焦环从 `outline` 换成了 `box-shadow`。
   * `forced-colors` / Windows 高对比度模式会**丢掉 box-shadow**、但保留 outline,
   * 所以这一档在那些模式下没有可见焦点;而同一个组件里滑轨的
   * `:focus-visible` 仍旧是 `outline: 1px solid var(--selected)`(稿子 `:1753`),
   * 一个控件两套写法。照稿子做,但这条已单列上报给产品。
   */
  it('聚焦换成「描边染色 + 外扩一圈」,不再用 outline', () => {
    const el = box();
    el.focus();
    if (!el.matches(':focus-visible')) throw new Error('没聚焦上 —— 这一量是假的');
    const measured = CSS.resolved(el);
    expect(measured['border-top-color']).toBe('#353535');
    expect(measured['box-shadow']).toBe(
      '0px 0px 0px 2px color-mix(in srgb, #353535 12%, transparent)',
    );
  });

  it('轨道和滑杆换到 pill 那一档圆角', () => {
    const container = mount(AMOUNT_FORM);
    expect(CSS.resolved(pick(container, '.qf-amount-rail'))['border-radius']).toBe('999px');
    expect(CSS.resolved(pick(container, '.qf-range'))['border-radius']).toBe('999px');
  });
});
