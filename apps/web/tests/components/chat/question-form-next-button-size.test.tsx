// @vitest-environment jsdom
/**
 * 意图澄清底栏那颗「下一步」**不许自己长胖**。
 *
 * ── 用户报的是什么 ──────────────────────────────────────────────────
 * 「按钮变得又宽又肥,一眼就不对。」
 *
 * ── 交付稿怎么写的(`8015870095:docs/design/chat-panel/src/components.css`)──
 * 底栏那两颗动作在稿子里是同一档尺寸,markup 逐处都是
 *   `<button class="btn mod-ghost mod-sm">跳过 · 你来判断</button>`
 *   `<button class="btn mod-primary mod-sm">下一步</button>`
 * (`src/body-components.html` 七格 + `src/body-scene.html` 两格,无一例外)。
 *
 * 尺寸链因此是三层:
 *   `.btn      { padding: 6px 14px; font-size: var(--t-body); font-weight: 600 }`
 *   `.btn.mod-sm { padding: 4px 11px; font-size: var(--t-mini) }`   ← 特异性更高,**覆盖基底**
 *   `.cbody > .foot .btn.mod-primary { height: 32px }`
 * 于是稿子这颗按钮的最终值是 **4px / 11px 的内距**,不是基底那 14px ——
 * 基底的 14px 属于**非 sm 档**,而底栏这颗从来不是非 sm 档。
 *
 * 稿子里 `76px` 零命中,`.btn` 一族**一条 `min-width` 都没有**。
 *
 * ── 我们多写了什么 ──────────────────────────────────────────────────
 * `c5d5a9e621` 给 `.question-form .qf-primary-action` 加了
 * `min-width: 76px` + `padding-inline: 14px`,理由写的是「圆角吃掉 11px 的余量」
 * 和「短文案会缩成小圆球」。两条理由对稿子**一字不差地同样成立** —— 稿子那颗
 * 同样是 32px 高的胶囊、同样吃 `.mod-sm` 的 11px、同样要渲染「OK」这种短词,
 * 而稿子作者在紧挨着的注释里专门交代了「只写死高度、不动内距」:
 *
 *   > 写死高度而不是加内边距:这是个被指定的数值,以后字号一动,靠 padding
 *   > 撑出来的高度就跟着漂,写死的 32 不会。
 *
 * 也就是说这不是稿子漏了,是稿子**选了别的做法**。而 W8 刚把 chat 基线字号从
 * 14px 改到 13px(`0334a6599d`),靠内距撑宽度的写法正好在这时候漂了 ——
 * 稿子那段注释预言的就是这件事。
 *
 * ── 删掉会不会塌 ────────────────────────────────────────────────────
 * 不会,而且这是本文件最要紧的一条正向对照:共享 `Button` 的 `.sm` 档
 * (`packages/components/src/button.module.css`)自带
 * `padding-block: 4px; padding-inline: 11px`,和稿子的 `.btn.mod-sm` 逐格相同。
 * 我们那两条不是在补基底缺的东西,是在**把 `.sm` 的档位改回非 sm 档**。
 *
 * ── 为什么自己算层叠 ────────────────────────────────────────────────
 * jsdom 三件事都不做:特异性层叠、`var()` 解析、**逻辑属性**
 * (写了 `padding-inline`,`getComputedStyle().paddingLeft` 读回的是别处的物理值)。
 * 而这次要照的恰好全在这三件里。解析器见 `tests/helpers/chat-mirror-cascade.ts`,
 * 按产品 `index.css` 的顺序读真实样式表,CSS Module 带真哈希。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import btnStyles from '../../../../../packages/components/src/button.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { UNSET, createResolver, hashed } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');
const pkg = (p: string): string => readFileSync(resolve(WEB, '../../packages/components/src', p), 'utf-8');

/* ── 交付稿 8015870095 的原值 ─────────────────────────────────────────
 * 本次逐条核过:`76px` 全稿零命中;`.btn` 一族没有任何 `min-width`;
 * `--t-mini` → `--font-size-12` → 12px;`--t-body` → `--font-size-13` → 13px。 */
const DESIGN = {
  /** `.cbody > .foot .btn.mod-primary { height: 32px }` —— 产品指定值 */
  height: '32px',
  /** `.btn.mod-sm { padding: 4px 11px }`,**不是**基底 `.btn` 的 `6px 14px` */
  paddingBlock: '4px',
  paddingInline: '11px',
  /** `.btn.mod-sm { font-size: var(--t-mini) }` = 12px;字重从基底 `.btn` 继承 600 */
  fontSize: '12px',
  fontWeight: '600',
  /** `.btn { border-radius: var(--radius-pill) }` */
  borderRadius: '999px',
} as const;

const TARGETS = [
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'min-width',
  'height',
  'font-size',
  'font-weight',
  'border-radius',
] as const;

/** 产品 `index.css` 的导入顺序(只取够得着底栏这两颗按钮的那几张)。 */
const { resolved, declaring } = createResolver(
  [
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
  ],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/* ── 夹具 ─────────────────────────────────────────────────────────── */

const FORM: QuestionForm = {
  id: 'next-button-size',
  title: 'One more thing',
  questions: [
    {
      id: 'layout',
      label: 'Reuse the product card from the list page?',
      type: 'radio',
      options: [
        { value: 'reuse', label: 'Reuse it, extract a shared component' },
        { value: 'fresh', label: 'Write a separate one for settings' },
      ],
    },
  ],
};

/**
 * 产品的祖先链。`.app`(ProjectView)→ ChatRoot 接缝(`--chat-*` 变量)→ `.chat-log`
 * → `.msg` → `.prose-block`。少一层就有规则匹配不上 —— chat-mirror 反复踩过的坑。
 */
function mount(): HTMLElement {
  const { container } = render(
    <I18nProvider initial="en">
      <div className="app">
        <div className={chatRootStyles.root} data-chat-root="">
          <div className="chat-log">
            <div className="msg assistant">
              <div className="prose-block">
                <QuestionFormView form={FORM} interactive onSubmit={() => {}} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </I18nProvider>,
  );
  return container;
}

function foot(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.question-form-foot');
  if (!el) throw new Error('底栏没渲染出来 —— 夹具或组件变了,先修这里');
  return el;
}

/** 底栏最后一颗按钮就是「下一步」。 */
function nextButton(container: HTMLElement): HTMLButtonElement {
  const buttons = [...foot(container).querySelectorAll('button')];
  const last = buttons[buttons.length - 1];
  if (!last) throw new Error('底栏里一颗按钮都没有');
  return last as HTMLButtonElement;
}

/** 底栏第一颗按钮是「跳过」。 */
function skipButton(container: HTMLElement): HTMLButtonElement {
  const first = foot(container).querySelector('button');
  if (!first) throw new Error('底栏里一颗按钮都没有');
  return first as HTMLButtonElement;
}

describe('question-form 底栏「下一步」照交付稿的 sm 档', () => {
  it('前提:这颗按钮确实是共享 `Button` 的 sm + primary 档(稿子的 `.btn.mod-primary.mod-sm`)', () => {
    const next = nextButton(mount());
    expect(next.className).toContain(btnStyles.button);
    expect(next.className).toContain(btnStyles.primary);
    expect(next.className).toContain(btnStyles.sm);
    expect(next.className).toContain('qf-primary-action');
  });

  /*
   * 防真空。下面「左右内距是 11px」那条如果因为解析器看不见 module 表而落空,
   * 读回的会是 UNSET 而不是 11px —— 但上下内距这条能更早、更直白地照出来:
   * 4px 只可能来自 `.sm { padding-block: 4px }`,全局表里没有第二个来源。
   */
  it('防真空:解析器确实看得见共享 `Button` 的 `.sm` 档', () => {
    const next = resolved(nextButton(mount()));
    expect(next['padding-top'], '解析器没读到 module 表,下面几条会假绿').toBe(
      DESIGN.paddingBlock,
    );
    expect(next['padding-bottom']).toBe(DESIGN.paddingBlock);
    expect(next['border-radius']).toBe(DESIGN.borderRadius);
  });

  /*
   * 红点一:左右内距。稿子是 `.btn.mod-sm` 的 11px,我们盖成了非 sm 档的 14px。
   * 走物理格子比,因为 `padding-inline` 是逻辑属性,`getComputedStyle` 看不见。
   */
  it('左右内距落在稿子 sm 档的 11px 上,不是非 sm 档的 14px', () => {
    const next = resolved(nextButton(mount()));
    expect(next['padding-left']).toBe(DESIGN.paddingInline);
    expect(next['padding-right']).toBe(DESIGN.paddingInline);
  });

  /*
   * 红点二:宽度地板。稿子的 `.btn` 一族一条 `min-width` 都没有 ——
   * 这颗按钮的宽度**只由文案决定**。给地板值会让短文案(「OK」「下一步」)
   * 的按钮被撑开,正是用户说的「又宽又肥」。
   */
  it('没有任何规则给这颗按钮设宽度地板 —— 稿子里 `.btn` 一族零 min-width', () => {
    const container = mount();
    const next = nextButton(container);
    expect(
      declaring(next, 'min-width').map((rule) => rule.selector),
      '稿子没有这条;是谁写的就列在这里',
    ).toEqual([]);
    expect(resolved(next)['min-width']).toBe(UNSET);
  });

  it('产品指定的 32px 高度仍然写死在按钮上(不靠内距撑)', () => {
    expect(resolved(nextButton(mount())).height).toBe(DESIGN.height);
  });

  /*
   * 底栏两颗动作在稿子里同字号同字重,只有颜色和底不同 ——
   * 两颗都是 `.btn.mod-sm`,拿的是 `--t-mini`(12px)和基底 `.btn` 的 600,
   * **不是**基底的 `--t-body`(13px)。
   */
  it('「下一步」和「跳过」同字号同字重(12px / 600),照稿子的 sm 档', () => {
    const container = mount();
    const next = resolved(nextButton(container));
    const skip = resolved(skipButton(container));
    expect(next['font-size']).toBe(DESIGN.fontSize);
    expect(next['font-weight']).toBe(DESIGN.fontWeight);
    expect(skip['font-size']).toBe(DESIGN.fontSize);
    expect(skip['font-weight']).toBe(DESIGN.fontWeight);
  });

  /*
   * 删掉那两条之后,内距来自共享 `Button` 的 `.sm` 档 —— 这条钉住那个来源本身,
   * 免得以后有人顺手把 `.sm` 的内距也改了,按钮真的塌成文字贴边。
   */
  it('文字不会贴边:共享 `Button` 的 `.sm` 档自带稿子那份内距', () => {
    const sm = /\.sm\s*\{([\s\S]*?)\}/.exec(
      pkg('button.module.css').replace(/\/\*[\s\S]*?\*\//g, ''),
    );
    expect(sm, '共享 Button 没有 `.sm` 档了 —— 这颗按钮的内距失去来源').toBeTruthy();
    expect(sm![1]).toMatch(/padding-inline:\s*11px/);
    expect(sm![1]).toMatch(/padding-block:\s*4px/);
  });
});
