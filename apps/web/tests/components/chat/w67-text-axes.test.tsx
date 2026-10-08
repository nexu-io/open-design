// @vitest-environment jsdom
/**
 * W67 · 执行记录**之外**的文字四轴逐格对稿。
 *
 * 基线:`729fa43ce7`(`origin/design/chat-cards-surface` 头)。
 * `chat-panel-next.html` 是构建产物,一律不看,只读 `docs/design/chat-panel/src/`。
 *
 * 本文件只钉三格 —— 它们是「读 CSS 文本 + 用共享量尺算最终值」两边都判得死、
 * 且今天没有别的 agent 在动的那三格。别的差异写在交付报告里,不在这里下手。
 *
 *   ① 回合状态行的「已完成」  `729fa43ce7:components.css:2753-2756`
 *        .fb .fin { …; margin-inline-end: 4px; font-size: var(--font-size-14);
 *                   color: var(--brand-text); }
 *      ⚠️ 这一条是**新基线才改的**:`361b78253e` 上它还是 `var(--t-cap)`(12px)。
 *      产品这一格是 `.assistant-footer .assistant-label`,一直停在 12px ——
 *      正是用户报的「已完成 4m 35s 的字号比下面正文还小」(正文 13px)。
 *      字重稿子**一条都不写**,所以它吃面板排版基线的 500
 *      (`ChatRoot.module.css` 的 `.vars` / `.root`);产品写死了 400,轻一档。
 *
 *   ② 确认卡的卡头        `729fa43ce7:components.css:1337-1341`
 *        .card > .h { …; font-size: var(--t-lead); font-weight: 600;
 *                     color: var(--text-strong); }
 *      `--t-lead` = `--font-size-14`(稿子 components.css:109「组件名、卡片标题」)。
 *      产品是 12px —— 掉了整整两档(lead → cap),卡头和卡里的辅助文字同号。
 *
 *   ③ 重连行的整行字色    `729fa43ce7:components.css:2154-2158`
 *        .tool { …; font-size: var(--t-body); color: #A3A3A3;
 *                line-height: var(--lh-row); }
 *      重连行在稿子里就是一条独立的 `.tool`(`cmp-reconnect` 三态都是),
 *      不坐在 `.fold.mod-flat` 里,所以那条把工具行提深的规则轮不到它。
 *      失败态那句「连接失败」用的正是这一档 —— 产品给的是 `--chat-text`(#494949),
 *      深了两档。
 *
 * ── 量法与它的边界(先读这段) ─────────────────────────────────────────
 * jsdom 不做层叠、不解 `var()`,`getComputedStyle` 在这里恒为空串,所以三格全部
 * 走共享量尺 `tests/helpers/chat-mirror-cascade`(只读,不改一个字)。
 *
 * ⚠️ 共享量尺的 `expand()` 是**属性白名单**,不在名单里的属性会被**静默丢掉**
 * (读回 `<unset>`,和「真的没人写」分不开)。本文件写的那会儿 `line-height` /
 * `font-family` 也在名单外,所以这里一条那两轴的断言都不写 —— 差异只在交付报告里列。
 * (W73 之后这两项已经进名单;`letter-spacing` 仍在名单外。本文件维持原样,
 *  要补那两轴请另起用例,别把这份文件的「整表 toEqual」范围悄悄扩大。)
 *
 * 防真空:每一组的第一条断言先证明「量尺确实解得开 var()、确实盖到了这个元素」,
 * 再比值。少了这一条,量尺够不着元素时 `<unset>` !== 期望值,一样是红的,
 * 但红的原因是「没量到」而不是「值不对」。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import { AssistantFooter } from '../../../src/components/AssistantMessage';
import { visualStyleCardsForContext } from '../../../src/runtime/visual-style-catalog';
import { Reconnect } from '../../../src/components/chat/Reconnect';
import { ChatRoot } from '../../../src/components/chat/ChatRoot';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import reconnectStyles from '../../../src/components/chat/Reconnect.module.css';
import { createResolver, hashed, UNSET } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const TARGETS = ['font-size', 'font-weight', 'color', 'width', 'height', 'padding-left', 'padding-right'] as const;

/**
 * 产品 `src/index.css` 的导入顺序,只取够得着这三格的那几张。
 *
 * ⚠️ `primitives.css` 必须在里面 —— 全局裸 `button` 那条渗漏就是从它下来的
 * (`.qf-chip` / footer 里那几颗按钮都活在它下面)。少注它,一条真实的层叠
 * 渗漏会读成「没人声明这个属性」,整组假绿。
 * ⚠️ CSS Module 先过 `hashed()`:全局表里的 `.button` 在产线上不匹配 module
 * 生成的类名,照抄这件事,否则量的是一颗根本不存在的元素。
 */
const SHEETS = [
  read('src/styles/tokens.css'),
  read('src/styles/base.css'),
  readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  read('src/styles/viewer/core.css'),
  read('src/styles/viewer/code.css'),
  read('src/styles/viewer/composio.css'),
  read('src/styles/viewer/theater.css'),
  hashed(
    read('src/components/chat/ChatRoot.module.css'),
    chatRootStyles as unknown as Record<string, string>,
  ),
  hashed(
    read('src/components/chat/Reconnect.module.css'),
    reconnectStyles as unknown as Record<string, string>,
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

/* ── 稿子的字面值 ──────────────────────────────────────────────────────
 * 全部解自 `729fa43ce7:docs/design/chat-panel/src/tokens.css` 的 `:root`
 * (与产品 `styles/tokens.css` / `styles/base.css` 同名 token 逐字节相同;
 *  两个基线之间 tokens.css 一个字都没改,已 diff 过)。
 * 写死字面值而不是写 `var(--…)`:验收标准是「算出来的和稿子逐字节相同」。 */
const T_LEAD = '14px'; //        --t-lead  = --font-size-14   components.css:109
const T_CAP = '12px'; //         --t-cap   = --font-size-12   components.css:106
const FONT_SIZE_14 = '14px'; //  --font-size-14              tokens.css:293
const T_BODY = '13px'; //        --t-body  = --font-size-13   components.css:108
const TOOL_INK = '#A3A3A3'; //   `.tool` 的字面色             components.css:2157
/** 面板排版基线的字重(`ChatRoot.module.css` 的 `.vars` / `.root`)。 */
const BASELINE_WEIGHT = '500';

function pick(root: HTMLElement, selector: string): Element {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`夹具里找不到 ${selector} —— 组件的类名变了,这条断言已经名存实亡`);
  return el;
}

/* ══ ① 回合状态行的「已完成」 ═══════════════════════════════════════════ */

describe('① 回合状态行「已完成」 —— 稿子 `.fb .fin`(729fa43ce7:2753)', () => {
  const mountFooter = (): HTMLElement =>
    render(
      <I18nProvider>
        <AssistantFooter
          streaming={false}
          preparing={false}
          hasUnfinishedTodos={false}
          hasEmptyResponse={false}
          canceled={false}
          isLast
          createdAt={Date.UTC(2026, 0, 1, 6, 32)}
          copyMarkdown="done"
        />
      </I18nProvider>,
    ).container;

  it('防真空:量尺盖到了这一格,而且 var() 解得开', () => {
    const measured = CSS.resolved(pick(mountFooter(), '[data-testid="assistant-label"]'));
    expect(measured['font-size'], '样式链没盖到回合状态行').not.toBe(UNSET);
    expect(measured['font-size'], 'token 没解开 —— 下面的比较都不成立').toMatch(/^\d+px$/);
    // 反向对照:这一格的字色早就对上了(`theater.css` 的完成档 = --brand-text),
    // 所以「量尺读得出非默认值」这件事本身是成立的。
    expect(measured['color']).toBe('#0d5400');
  });

  it('字号是 14 —— 稿子把它从 --t-cap 提到了 --font-size-14', () => {
    expect(CSS.resolved(pick(mountFooter(), '[data-testid="assistant-label"]'))['font-size']).toBe(
      FONT_SIZE_14,
    );
  });

  it('字重跟面板基线走 500 —— 稿子这一条一个字重都不写', () => {
    expect(CSS.resolved(pick(mountFooter(), '[data-testid="assistant-label"]'))['font-weight']).toBe(
      BASELINE_WEIGHT,
    );
  });
});

/* ══ ② 确认卡卡头 ═══════════════════════════════════════════════════════ */

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

/** 多选:选中一项之后卡头右边才会长出「已选 N」(稿子 `.card > .h .n`)。 */
const MULTI_FORM: QuestionForm = {
  id: 'surfaces-multi',
  title: '还需要确认一件事',
  questions: [
    {
      id: 'surfaces',
      label: '这次要覆盖哪几个端?',
      type: 'checkbox',
      options: [
        { label: '响应式网页', value: 'web' },
        { label: '移动端', value: 'mobile' },
      ],
    },
  ],
};

/** 没有选项区的卡 —— 反向对照用。 */
const TEXT_FORM: QuestionForm = {
  id: 'brief',
  title: '还需要确认一件事',
  questions: [{ id: 'brief', label: '一句话说清目标', type: 'text' }],
};

describe('② 确认卡卡头 —— 稿子 `.card > .h`(729fa43ce7:1337)', () => {
  const mountForm = (): HTMLElement =>
    render(
      <I18nProvider>
        <QuestionFormView form={RADIO_FORM} interactive onSubmit={() => {}} />
      </I18nProvider>,
    ).container;

  it('防真空:量尺盖到了卡头,而且 var() 解得开', () => {
    const measured = CSS.resolved(pick(mountForm(), '.question-form-head'));
    expect(measured['font-size'], '样式链没盖到这张卡').not.toBe(UNSET);
    // 反向对照:同一条规则里的字色 / 字重早就对上了,证明读的确实是这条规则。
    expect(measured['color']).toBe('#202020');
    expect(measured['font-weight']).toBe('600');
  });

  it('卡头字号是 --t-lead(14) —— 它是卡的名字,不是卡里的辅助文字', () => {
    expect(CSS.resolved(pick(mountForm(), '.question-form-head'))['font-size']).toBe(T_LEAD);
  });

  it('卡头里那段标题跟着卡头同号,不自己降一档', () => {
    expect(CSS.resolved(pick(mountForm(), '.question-form-title'))['font-size']).toBe(T_LEAD);
  });

  /*
   * 卡头抬档必须连着这一条一起看 —— 这是「向下查所有消费者」那一步。
   * 稿子 `729fa43ce7:components.css:1356`:
   *     .card > .h .n { margin-left: auto; font-variant-numeric: tabular-nums;
   *                     font-size: var(--t-cap); font-weight: 600; }
   * 计数是卡头的**直接子元素**且自己不写字号的话,会跟着继承成 14 ——
   * 一行里两个 14,「卡的名字」和「附注」就分不出来了。
   */
  it('卡头右边那枚计数**自己降回 12**,不跟着卡头抬档', () => {
    // 勾了一项 —— 卡头右侧才长出「已选 N」。走 `draftAnswers` 而不是模拟点击:
    // 这一格要量的是样式,不是勾选那条链路,少一层可能失手的交互。
    const container = render(
      <I18nProvider>
        <QuestionFormView form={MULTI_FORM} interactive draftAnswers={{ surfaces: ['web'] }} onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    const measured = CSS.resolved(pick(container, '.qf-picked'));
    expect(measured['font-size'], '量尺没盖到计数').not.toBe(UNSET);
    expect(measured['font-size']).toBe(T_CAP);
    expect(measured['font-weight']).toBe('600');
  });
});

/* ══ ④ 选项行 / 卡头标题字重 / 视觉方向卡头内距 ═══════════════════════════
 *
 * 三条都是新基线 `729fa43ce7` 才有的、或新基线才照出来的。
 * 每一条的期望值都不是从稿子的注释读来的,而是把**稿子那份 CSS 在稿子那份
 * HTML 上真算了一遍**的胜出值(脚本见交付报告;结果逐条抄在下面)。
 */

/** 视觉方向那张卡 —— `type: 'direction-cards'` + `visualStyleContext` 才长出来。 */
const VISUAL_FORM: QuestionForm = {
  id: 'directions',
  title: '先定个视觉方向',
  questions: [
    {
      id: 'direction',
      label: '视觉方向',
      type: 'direction-cards',
      required: true,
      options: [
        { label: '克制留白', value: 'restrained' },
        { label: '编辑杂志', value: 'editorial' },
      ],
    },
  ],
} as unknown as QuestionForm;

describe('④-1 选项行字号 —— 稿子 `.opt`(729fa43ce7:1420)', () => {
  /*
   * 算出来的胜出值:`.opt { font-size: var(--t-body) }` → **13px**。
   * 上一版基线(`361b78253e`)这里是 `var(--t-mini)`(12px),`17841fa8e1` 整档上移。
   */
  it('选项行是 13,不是 12', () => {
    const container = render(
      <I18nProvider>
        <QuestionFormView form={RADIO_FORM} interactive onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    const measured = CSS.resolved(pick(container, '.qf-chip'));
    expect(measured['font-size'], '量尺没盖到选项行').not.toBe(UNSET);
    expect(measured['font-size']).toBe(T_BODY);
  });

  /*
   * 半迁移护栏:`.opt` 抬到 13 之后,稿子里**它里面**那格自己填的输入框
   * 仍然是 `.opt .own-ta { font-size: var(--t-mini) }` → 12px。
   * 两个一起抬 = 把「输入框比选项轻一档」这层关系抹掉。
   */
  it('反向对照:「自己填」的输入框**不跟着抬**,仍是 12', () => {
    const container = render(
      <I18nProvider>
        <QuestionFormView form={RADIO_FORM} interactive onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    fireEvent.click(pick(container, '.qf-chip-other'));
    const measured = CSS.resolved(pick(container, '.qf-own-input'));
    expect(measured['font-size'], '量尺没盖到自己填的输入框').not.toBe(UNSET);
    expect(measured['font-size']).toBe(T_CAP);
  });
});

describe('④-2 带选项的卡,标题字重降到 500 —— 稿子 `.card:has(> .cbody > .opts) > .h > b`', () => {
  /*
   * 算出来的胜出值:带 `.opts` 的卡,卡头那只 `<b>` 是 **500**
   * (`.card:has(> .cbody > .opts) > .h > b`(0,3,1)压过 `.card > .h b`(0,2,1));
   * 不带选项的卡仍是 `.card > .h b { font-weight: 600 }`。
   * 这条是「卡头抬到 14」之后才**看得见**的:12 那会儿两档字重差别本来就糊。
   */
  it('带选项的确认卡:标题 500', () => {
    const container = render(
      <I18nProvider>
        <QuestionFormView form={RADIO_FORM} interactive onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    expect(pick(container, '.qf-options'), '这张卡没有选项区,前提不成立').toBeTruthy();
    expect(CSS.resolved(pick(container, '.question-form-title'))['font-weight']).toBe('500');
  });

  it('反向对照:没有选项区的卡仍是 600', () => {
    const container = render(
      <I18nProvider>
        <QuestionFormView form={TEXT_FORM} interactive onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    expect(container.querySelector('.qf-options'), '这张卡不该有选项区').toBeNull();
    expect(CSS.resolved(pick(container, '.question-form-title'))['font-weight']).toBe('600');
  });
});

describe('④-3 视觉方向卡的卡头内距 —— 稿子 `.card:has(> .cbody > .opts.mod-visual) > .h`', () => {
  /*
   * 稿子 `729fa43ce7:visual-fan.css`:
   *   .card:has(> .cbody > .opts.mod-visual) > .h { padding-inline: 16px; }
   * 只收视觉方向这一张卡 —— 其余确认卡仍是通用卡头的 `padding: 9px 11px`。
   */
  it('视觉方向卡的卡头左右各 16', () => {
    const container = render(
      <I18nProvider>
        <QuestionFormView form={VISUAL_FORM} interactive visualStyleContext="prototype" onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    expect(pick(container, '.qf-visual-picker'), '这张卡没长出视觉选择器,前提不成立').toBeTruthy();
    const measured = CSS.resolved(pick(container, '.question-form-head'));
    expect(measured['padding-left']).toBe('16px');
    expect(measured['padding-right']).toBe('16px');
  });

  it('反向对照:别的确认卡仍是 11', () => {
    const container = render(
      <I18nProvider>
        <QuestionFormView form={RADIO_FORM} interactive onSubmit={() => {}} />
      </I18nProvider>,
    ).container;
    const measured = CSS.resolved(pick(container, '.question-form-head'));
    expect(measured['padding-left']).toBe('11px');
    expect(measured['padding-right']).toBe('11px');
  });
});

/* ══ ⑤ 回合状态行那枚勾 ═════════════════════════════════════════════════ */

describe('⑤ 「已完成」那枚勾 —— 稿子 `.fb .fin > .tick`(729fa43ce7:2776)', () => {
  /*
   * 算出来的胜出值:`width: 16px; height: 16px`(上一版是 13)。
   * 和 ① 是同一格的两半 —— 字号 14 的中文旁边配 16 的勾,两个一起改才完整。
   */
  it('勾是 16 × 16,不是 13', () => {
    const container = render(
      <I18nProvider>
        <AssistantFooter
          streaming={false}
          preparing={false}
          hasUnfinishedTodos={false}
          hasEmptyResponse={false}
          canceled={false}
          isLast
          createdAt={Date.UTC(2026, 0, 1, 6, 32)}
          copyMarkdown="done"
        />
      </I18nProvider>,
    ).container;
    const measured = CSS.resolved(pick(container, '.assistant-label .dot'));
    expect(measured['width'], '量尺没盖到那枚勾').not.toBe(UNSET);
    expect(measured['width']).toBe('16px');
    expect(measured['height']).toBe('16px');
  });
});

/* ══ ③ 重连行 ═══════════════════════════════════════════════════════════ */

describe('③ 重连行整行字色 —— 稿子 `.tool`(729fa43ce7:2154)', () => {
  const mountReconnect = (): HTMLElement =>
    render(
      <I18nProvider>
        <ChatRoot>
          <Reconnect attempt={5} max={5} exhausted onReconnect={() => {}} />
        </ChatRoot>
      </I18nProvider>,
    ).container;

  /*
   * ⚠️ **共享量尺解不开 `--chat-*`**:那一族定义在 CSS Module 的 `.vars` / `.root`
   * 类上,而量尺的 `deref()` 只认 token 表的 `:root` 块。所以这一格读回来的是
   * 别名字面(`var(--chat-tool-ink)`),不是 `#a3a3a3` —— 这不是缺陷,是它的边界。
   * 于是这一组拆成两步,两步都红才算这一格没做:
   *   ① 量尺读到:这一行的 `color` 由**哪一枚接缝别名**给;
   *   ② 读接缝本身:那枚别名在**亮暗两个作用域**里都是稿子那枚字面 `#a3a3a3`。
   * 只做 ① 会被「改了别名却没定义」骗过去,只做 ② 会被「定义了但没人用」骗过去。
   */
  const SEAM = read('src/components/chat/ChatRoot.module.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('防真空:量尺确实盖到了这一行(module 类名哈希也对上了)', () => {
    const measured = CSS.resolved(pick(mountReconnect(), '[data-testid="chat-reconnect"]'));
    // 字号读回的是 `Reconnect.module.css` 自己写的别名 —— 能读到它,
    // 就证明 `hashed()` 把 module 类名换对了、这张表也确实进了量尺。
    expect(measured['font-size'], '样式链没盖到重连行').toBe('var(--chat-t-body)');
    expect(measured['color'], '这一行没有任何规则给 color').not.toBe(UNSET);
  });

  it('① 整行的 color 走接缝里那枚工具行墨色,不走正文色', () => {
    const measured = CSS.resolved(pick(mountReconnect(), '[data-testid="chat-reconnect"]'));
    expect(measured['color']).toBe('var(--chat-tool-ink)');
  });

  it('② 那枚别名在亮暗两个作用域里都是稿子的字面 #A3A3A3', () => {
    const decls = [...SEAM.matchAll(/--chat-tool-ink:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(decls.length, '接缝里没有两处声明(亮 + 暗各一次)').toBe(2);
    for (const value of decls) expect(value.toLowerCase()).toBe(TOOL_INK.toLowerCase());
  });
});
