// @vitest-environment jsdom
/**
 * 视觉方向卡改版 —— 倒计时上卡头、「换一批」上预览区顶栏、底栏最左补「跳过」。
 *
 * ## 稿子基线
 *
 * 旧 `361b78253e` → 新 `729fa43ce7`,逐行 diff 出来的改动只有四处
 * (`docs/design/chat-panel/src/visual-fan.css` + `body-components.html`
 *  + `body-scene.html`,两个调用点各改一次):
 *
 * ```
 * +.card:has(> .cbody > .opts.mod-visual) > .h { padding-inline: 16px; }
 * -.vbar { display: flex; align-items: center; padding-bottom: 6px; }
 * +.vbar { display: flex; align-items: center; gap: 4px; padding-bottom: 6px; }
 * +.card > .h .visual-countdown { color: var(--text-soft); font-weight: 400; }
 * +.visual-refresh {
 * +  flex: none; min-height: 24px; padding-inline: 8px; border-radius: var(--radius-pill);
 * +  color: var(--text-muted); font-size: var(--t-cap); font-weight: 400;
 * +  transition: background-color …, color …;
 * +}
 * +.visual-refresh:hover { background: var(--bg-fill-secondary); color: var(--text-strong); }
 * ```
 * 标记侧:
 * ```
 * -<div class="h">…<b>先定个视觉方向</b></div>
 * +<div class="h">…<b>先定个视觉方向</b><time class="n visual-countdown" datetime="PT30S" …>30s</time></div>
 * -<div class="vbar"><span class="sp"></span><button class="vswitch" …>
 * +<div class="vbar"><span class="sp"></span><button class="visual-refresh" …>换一批</button><button class="vswitch" …>
 * -<button class="btn mod-ghost mod-sm">换一批</button>   ← 底栏最左
 * +<button class="btn mod-ghost mod-sm">跳过</button>
 * ```
 * 倒计时因此继承 `.card > .h .n`(`margin-left:auto` / `tabular-nums` /
 * `font-size: var(--t-cap)` = 12px),再由 `.visual-countdown` 把字重压回 400、
 * 字色换成 `--text-soft`。
 *
 * ## ⚠️ 一处**有意偏离**:显示格式
 *
 * 稿子的文案是 `30s`;我们保留 `M:SS`(`0:30` / `10:00`)。
 * 出处:**2026-09-02 产品裁决** —— 原话「格式我感觉还是用 `0:30` 吧..更清晰..」。
 * 这是明确的产品选择,**不是稿子没更新**,也不是我们没对齐。
 * 下一个对稿的 agent:**不要把它"修"回 `30s`**;要改得先拿到新的产品裁决。
 * 位置 / 字号 / 字重 / 字色 / `tabular-nums` / 顶右 —— 这六项一律照稿子。
 * `datetime` 与 `aria-label` 是语义属性不是显示文案,按稿子的语义走。
 *
 * ## 为什么自己算层叠
 *
 * jsdom 不做特异性层叠、不解析 `var()`、也看不见逻辑属性
 * (`padding-inline` 写完 `getComputedStyle().paddingLeft` 读回的是别处的物理值)——
 * 这次要照的三样全在里面。解析器是共享量尺
 * `tests/helpers/chat-mirror-cascade.ts`,按产品 `index.css` 的顺序读真实样式表。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import btnStyles from '../../../../../packages/components/src/button.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { createResolver, hashed, stripComments } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');
const pkg = (p: string): string =>
  readFileSync(resolve(WEB, '../../packages/components/src', p), 'utf-8');

/* ── 稿子 729fa43ce7 的原值 —— 判据的锚,不从实现里读回来 ────────────────
 * token 逐支核过(`apps/web/src/styles/tokens.css` 与稿子的 `tokens.css` 同值):
 *   --t-cap → --font-size-12 → 12px
 *   --text-soft  #848484   --text-muted #5c5c5c   --text-strong #202020
 *   --radius-pill 999px    --bg-fill-secondary rgba(0, 0, 0, 0.06)
 */
const DESIGN = {
  /** `.card > .h .n { font-size: var(--t-cap) }` */
  countdownFontSize: '12px',
  /** `.card > .h .visual-countdown { font-weight: 400 }` —— 压掉 `.n` 的 600 */
  countdownFontWeight: '400',
  /** `.card > .h .visual-countdown { color: var(--text-soft) }` */
  countdownColor: '#848484',
  /** `.visual-refresh { min-height: 24px }` */
  refreshMinHeight: '24px',
  /** `.visual-refresh { padding-inline: 8px }` */
  refreshPaddingInline: '8px',
  /** `.visual-refresh { border-radius: var(--radius-pill) }` */
  refreshRadius: '999px',
  /** `.visual-refresh { font-size: var(--t-cap); font-weight: 400 }` */
  refreshFontSize: '12px',
  refreshFontWeight: '400',
  /** `.visual-refresh { color: var(--text-muted) }` */
  refreshColor: '#5c5c5c',
  /** `.visual-refresh:hover { background: var(--bg-fill-secondary); color: var(--text-strong) }` */
  refreshHoverBg: 'rgba(0, 0, 0, 0.06)',
  refreshHoverColor: '#202020',
  /** `.card:has(> .cbody > .opts.mod-visual) > .h { padding-inline: 16px }` */
  visualHeadPaddingInline: '16px',
  /** 其余确认卡仍是通用卡头 `.card > .h { padding: 9px 11px }` */
  plainHeadPaddingInline: '11px',
} as const;

/**
 * ⚠️ 有意偏离(2026-09-02 产品裁决,见文件头)。稿子写的是 `30s`。
 * 断言按 `M:SS` 走,任何把它改回 `30s` 的实现都会在这里变红 —— 这是刻意的。
 */
const PRODUCT_COUNTDOWN_TEXT = '10:00';

const TARGETS = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'min-height',
  'font-size',
  'font-weight',
  'color',
  'background-color',
  'border-radius',
] as const;

/** 产品 `index.css` 的导入顺序(只取够得着这张卡的那几张)。 */
const SHEETS = [
  read('src/styles/tokens.css'),
  read('src/styles/base.css'),
  pkg('styles.css'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  read('src/styles/viewer/code.css'),
  read('src/styles/viewer/tools.css'),
  read('src/styles/viewer/composio.css'),
  read('src/styles/viewer/theater.css'),
  read('src/styles/viewer/routines.css'),
  hashed(
    read('src/components/chat/ChatRoot.module.css'),
    chatRootStyles as unknown as Record<string, string>,
  ),
  hashed(pkg('button.module.css'), btnStyles as unknown as Record<string, string>),
];
const TOKEN_SHEETS = [read('src/styles/tokens.css'), read('src/styles/base.css')];

const { resolved } = createResolver(SHEETS, TOKEN_SHEETS, TARGETS);

/** `gap` / `margin-*` 不在共享量尺的属性白名单里,这两项只能读规则文本。 */
const COMPOSIO = stripComments(read('src/styles/viewer/composio.css'));
function declarationsFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|})\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'm').exec(COMPOSIO)?.[2] ?? '';
}

/* ── 夹具 ─────────────────────────────────────────────────────────── */

/** 调用点一:目录驱动的 `VisualStylePicker`(底栏合并到选择器那一行)。 */
const TONE_FORM: QuestionForm = {
  id: 'w75-tone',
  title: '先定个视觉方向',
  questions: [
    {
      id: 'tone',
      label: '这套原型走哪种感觉?',
      type: 'radio',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    },
  ],
} as unknown as QuestionForm;

/** 调用点二:agent 自开的 `direction-cards`(没有目录上下文,走占位块那一路)。 */
const DIRECTION_FORM: QuestionForm = {
  id: 'w75-directions',
  title: '先定个视觉方向',
  questions: [
    {
      id: 'direction',
      label: '视觉方向',
      type: 'direction-cards',
      cards: [
        { id: 'restrained', label: '克制留白' },
        { id: 'editorial', label: '编辑杂志' },
        { id: 'playful', label: '活泼消费' },
      ],
    },
  ],
} as unknown as QuestionForm;

/** 反向对照:普通确认卡,不该被这一轮的任何一条带走。 */
const PLAIN_FORM: QuestionForm = {
  id: 'w75-plain',
  title: 'One more thing',
  questions: [
    {
      id: 'layout',
      label: 'Reuse the product card?',
      type: 'radio',
      options: [
        { value: 'reuse', label: 'Reuse it' },
        { value: 'fresh', label: 'Write a separate one' },
      ],
    },
  ],
};

/**
 * 产品的祖先链。`.app` → ChatRoot 接缝 → `.chat-log` → `.msg` → `.prose-block`,
 * 少一层就有规则匹配不上 —— chat-mirror 反复踩过的坑。
 */
function mount(form: QuestionForm, visualStyleContext?: 'prototype'): HTMLElement {
  const { container } = render(
    <I18nProvider initial="en">
      <div className="app">
        <div className={chatRootStyles.root} data-chat-root="">
          <div className="chat-log">
            <div className="msg assistant">
              <div className="prose-block">
                <QuestionFormView
                  form={form}
                  interactive
                  autoContinueAfterTimeout
                  visualStyleContext={visualStyleContext}
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

function head(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.question-form-head');
  if (!el) throw new Error('卡头没渲染出来 —— 夹具或组件变了,先修这里');
  return el;
}

function countdown(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.qf-auto-continue');
  if (!el) throw new Error('倒计时没渲染出来');
  return el;
}

function refreshButton(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>('[data-action="reshuffle"]');
  if (!el) throw new Error('「换一批」没渲染出来');
  return el;
}

/** 底栏那一行的按钮文案,按 DOM 顺序。 */
function footLabels(container: HTMLElement, selector: string): string[] {
  const foot = container.querySelector(selector);
  if (!foot) throw new Error(`${selector} 没渲染出来`);
  return [...foot.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
}

describe('W75 视觉方向卡 · 倒计时上卡头', () => {
  it('防真空:量尺读得出非默认值(卡头 16px 内距 / 共享 Button 的 sm 档内距)', () => {
    // 这两条现在就是真的,读回 `<unset>` 就说明量尺瞎了,后面每条相等断言都会假绿
    const visual = resolved(head(mount(TONE_FORM, 'prototype')));
    expect(visual['padding-left'], '量尺没读到 composio.css,后面全部假绿').toBe(
      DESIGN.visualHeadPaddingInline,
    );
    cleanup();
    const skip = resolved(
      mount(PLAIN_FORM).querySelector('.question-form-foot button')!,
    );
    expect(skip['padding-top'], '量尺没读到 button.module.css,后面全部假绿').toBe('4px');
  });

  it('倒计时长在卡头里,不在底栏里(结构本身)', () => {
    const container = mount(PLAIN_FORM);
    const timer = countdown(container);
    expect(timer.closest('.question-form-head'), '倒计时应该在卡头里').toBeTruthy();
    expect(timer.closest('.question-form-foot'), '倒计时不该再留在底栏').toBeNull();
    // 顶右:它是卡头的最后一个孩子
    expect(head(container).lastElementChild).toBe(timer);
  });

  it('视觉方向卡(底栏被合并、原本整条底栏都不渲染)现在也看得见倒计时', () => {
    const container = mount(TONE_FORM, 'prototype');
    expect(container.querySelector('.question-form-foot'), '这一路底栏本就不渲染').toBeNull();
    expect(countdown(container).closest('.question-form-head')).toBeTruthy();
  });

  it('倒计时逐值对上稿子:12px / 400 / --text-soft', () => {
    const timer = resolved(countdown(mount(TONE_FORM, 'prototype')));
    expect(timer['font-size']).toBe(DESIGN.countdownFontSize);
    expect(timer['font-weight']).toBe(DESIGN.countdownFontWeight);
    expect(timer.color).toBe(DESIGN.countdownColor);
  });

  it('倒计时顶右且数字不跳(稿子 `.card > .h .n` 的 margin-left:auto + tabular-nums)', () => {
    const decls = declarationsFor('.qf-auto-continue');
    expect(decls).toMatch(/margin-inline-start:\s*auto/);
    expect(decls).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('倒计时用 `<time>` 并带 ISO 时长(稿子 `<time datetime="PT30S">`)', () => {
    const timer = countdown(mount(TONE_FORM, 'prototype'));
    expect(timer.tagName).toBe('TIME');
    expect(timer.getAttribute('datetime')).toBe('PT600S');
  });

  /*
   * ⚠️ 有意偏离,别"修"回稿子的 `30s`。
   * 2026-09-02 产品裁决:「格式我感觉还是用 `0:30` 吧..更清晰..」。
   */
  it('显示格式保留 M:SS —— 2026-09-02 产品裁决压过稿子的 `30s`', () => {
    expect(countdown(mount(TONE_FORM, 'prototype')).textContent).toBe(PRODUCT_COUNTDOWN_TEXT);
  });
});

describe('W75 视觉方向卡 · 「换一批」上预览区顶栏', () => {
  it('「换一批」长在 `.qf-visual-bar` 里,不在底栏里(结构本身)', () => {
    const container = mount(TONE_FORM, 'prototype');
    const refresh = refreshButton(container);
    expect(refresh.closest('.qf-visual-bar'), '「换一批」应该在预览区顶栏').toBeTruthy();
    expect(refresh.closest('.qf-visual-foot'), '「换一批」不该再留在底栏').toBeNull();
  });

  it('排在网格切换的**左边**(稿子:换一批 → vswitch)', () => {
    const bar = mount(TONE_FORM, 'prototype').querySelector('.qf-visual-bar')!;
    const actions = [...bar.querySelectorAll('button')].map((b) =>
      b.getAttribute('data-action'),
    );
    expect(actions).toEqual(['reshuffle', 'toggle-view']);
  });

  it('顶栏两颗之间是稿子的 4px(`.vbar { gap: 4px }`)', () => {
    expect(declarationsFor('.qf-visual-bar')).toMatch(/gap:\s*4px/);
    // 防真空:同一把读数器读得出这条一直都在的 11px
    expect(declarationsFor('.qf-visual-bar')).toMatch(/margin-inline:\s*11px/);
  });

  it('「换一批」逐值对上稿子 `.visual-refresh`', () => {
    const refresh = resolved(refreshButton(mount(TONE_FORM, 'prototype')));
    expect(refresh['min-height']).toBe(DESIGN.refreshMinHeight);
    expect(refresh['padding-left']).toBe(DESIGN.refreshPaddingInline);
    expect(refresh['padding-right']).toBe(DESIGN.refreshPaddingInline);
    expect(refresh['border-radius']).toBe(DESIGN.refreshRadius);
    expect(refresh['font-size']).toBe(DESIGN.refreshFontSize);
    expect(refresh['font-weight']).toBe(DESIGN.refreshFontWeight);
    expect(refresh.color).toBe(DESIGN.refreshColor);
  });

  it('「换一批」hover 照稿子:底 --bg-fill-secondary、字 --text-strong', () => {
    const refresh = refreshButton(mount(TONE_FORM, 'prototype'));
    const rest = resolved(refresh);
    expect(rest['background-color'], '静止态不该有底').toBe('transparent');
    fireEvent.mouseOver(refresh);
    if (!refresh.matches(':hover')) throw new Error('指针没停上去 —— 这一量是假的');
    const hover = resolved(refresh);
    expect(hover['background-color']).toBe(DESIGN.refreshHoverBg);
    expect(hover.color).toBe(DESIGN.refreshHoverColor);
  });
});

describe('W75 视觉方向卡 · 底栏最左是「跳过」', () => {
  it('调用点一(目录驱动、底栏已合并):跳过 → 随机 → 下一步', () => {
    expect(footLabels(mount(TONE_FORM, 'prototype'), '.qf-visual-foot')).toEqual([
      'Skip',
      'Random',
      'Next',
    ]);
  });

  it('调用点二(agent 自开的 direction-cards):卡片底栏最左仍是「跳过」', () => {
    const container = mount(DIRECTION_FORM);
    // 这一路选择器自带的那一行只有「随机」——「下一步」没有交给它,所以底栏照旧渲染
    expect(footLabels(container, '.qf-visual-foot')).toEqual(['Random']);
    expect(footLabels(container, '.question-form-foot')[0]).toBe('Skip — you decide');
  });

  it('两个调用点的顶栏都拿到了 4px 的那条 `.qf-visual-bar`,且都只放该放的东西', () => {
    const one = mount(TONE_FORM, 'prototype').querySelector('.qf-visual-bar')!;
    expect([...one.querySelectorAll('button')]).toHaveLength(2);
    cleanup();
    // 调用点二没有「下一批」可换(卡就这么几张),顶栏只有切换
    const two = mount(DIRECTION_FORM).querySelector('.qf-visual-bar')!;
    expect(
      [...two.querySelectorAll('button')].map((b) => b.getAttribute('data-action')),
    ).toEqual(['toggle-view']);
  });
});

describe('W75 反向对照 · 别的卡不许跟着变', () => {
  it('普通确认卡的卡头内距还是 11px(16px 只收视觉方向卡)', () => {
    const plain = resolved(head(mount(PLAIN_FORM)));
    expect(plain['padding-left']).toBe(DESIGN.plainHeadPaddingInline);
    expect(plain['padding-right']).toBe(DESIGN.plainHeadPaddingInline);
  });

  it('普通确认卡底栏那颗「跳过」还是稿子的 sm 档(12px / 600 / --text-muted)', () => {
    const skip = resolved(mount(PLAIN_FORM).querySelector('.question-form-foot button')!);
    expect(skip['font-size']).toBe('12px');
    expect(skip['font-weight']).toBe('600');
    expect(skip.color).toBe('#5c5c5c');
    // 左起那颗贴边:`.cbody > .foot > .btn:first-child { padding-inline: 0 }`
    expect(skip['padding-left']).toBe('0px');
  });

  it('底栏「随机」没跟着「换一批」换档 —— 它仍是共享 sm 档,不是 24px 胶囊', () => {
    const random = resolved(
      mount(TONE_FORM, 'prototype').querySelector('[data-action="random"]')!,
    );
    expect(random['font-weight']).toBe('600');
    expect(random['padding-left']).toBe('11px');
    expect(random['min-height']).not.toBe(DESIGN.refreshMinHeight);
  });
});
