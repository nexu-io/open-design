// @vitest-environment jsdom
/**
 * 意图澄清底栏那颗「跳过」**在忙的时候不能变形**。
 *
 * 用户 2026-08-27 两次指认(同一形态):
 *   ①「question-form 的 skip 按钮怎么有时候会变这样啊,感觉是在 loading 态时变成这样的?」
 *   ②「当我点击开始排版,又出现这个状态的 skip 按钮了」
 *
 * 真机(无头 Chrome,`data-theme=light`,产品祖先链 `.app` → 接缝 → `.chat-log` →
 * `.prose-block`,CSS Module 带真哈希)量到的两态差异 —— 九项里**只差底色**一项:
 *
 *   属性            终态(空闲)         加载态(submitDisabled)   交付稿
 *   background      transparent        rgb(237,237,237)         transparent
 *   color           rgb(92,92,92)      rgb(92,92,92)            rgb(92,92,92)
 *   border          0px none           0px none                 0px none
 *   border-radius   999px              999px                    999px
 *   padding         4px 0              4px 0                    4px 0
 *   font            12px / 600         12px / 600               12px / 600
 *   box-shadow      none               none                     none
 *
 * 病灶不是「一个用共享 Button、一个手写」—— 两颗都是共享 `Button variant="ghost" size="sm"`。
 * 病灶是共享原语的 `.button:disabled { background: var(--bg-subtle) }`:对实心的
 * 「下一步」是对的(交付稿 `.btn:disabled` 就这么写),但这一行的次要动作按稿子是
 * **一句可点的话**,不是一个有形状的按钮 —— 稿子为此专门写了
 * `.cbody > .foot .btn.mod-ghost:hover { background: none }`,理由(贴着左边界之后
 * 那层灰会漫到卡的内边距上,看着像凭空多出一张小卡片)对禁用态一字不差地成立。
 * 而这一行**只要这一轮还在跑就是禁用的**(`questionFormSubmitDisabled` = 会话忙),
 * 所以流式期间和点完提交之后都会长出那枚灰药丸。
 *
 * 交付稿(`1bbdce0b06:docs/design/chat-panel-next.html`,md5 28ea4c65…)**没有画**
 * 这颗按钮的加载/禁用态:意图澄清七格里那颗 `.btn.mod-ghost.mod-sm` 一律是可用的。
 * 所以判据就是「加载态照终态」。
 *
 * ── 为什么自己算层叠 ──────────────────────────────────────────────
 * jsdom 不做特异性层叠、也不解析 `var()`,`getComputedStyle` 在这里只会给空值;
 * 而这次的差异**纯粹**是层叠结果(规则文本两边一个字没差)。所以本文件按产品的
 * 导入顺序把真实样式表读进来,用 `element.matches()` 做匹配、按 (特异性, 顺序)
 * 排序,自己算出胜出声明。`resolver sees the shared primitive's disabled fill`
 * 那条是**防真空**的:它证明解析器确实看得见 `.button:disabled`,否则「两态一致」
 * 会在解析器瞎了的时候假绿。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { specificity } from '../../helpers/chat-mirror-cascade';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import btnStyles from '../../../../../packages/components/src/button.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

/* ── 夹具 ─────────────────────────────────────────────────────────── */

const QUESTION = {
  id: 'layout',
  label: 'Reuse the product card from the list page?',
  type: 'radio' as const,
  options: [
    { value: 'reuse', label: 'Reuse it, extract a shared component' },
    { value: 'fresh', label: 'Write a separate one for settings' },
  ],
};
const FLAT: QuestionForm = {
  id: 'skip-parity-flat',
  title: 'One more thing',
  submitLabel: '开始排版',
  questions: [QUESTION],
};
const STEPPED: QuestionForm = {
  id: 'skip-parity-stepped',
  title: 'A few quick questions',
  submitLabel: '开始排版',
  questions: [
    { ...QUESTION, id: 'q1' },
    { ...QUESTION, id: 'q2' },
  ],
};

/**
 * 产品的祖先链。`.app`(ProjectView)→ ChatRoot 接缝(`--chat-*` 变量)→ `.chat-log`
 * → `.msg` → `.prose-block`。少一层就有规则匹配不上 —— 这是 chat-mirror 反复踩过的坑。
 * `autoContinueAfterTimeout` 照抄 `FormBlock` 的调用点。它为真时会多出一枚倒计时,
 * 但那枚现在长在**卡头**里(稿子 `729fa43ce7`,W75),不再挤占底栏第一格。
 */
function mount(form: QuestionForm, submitDisabled: boolean): HTMLElement {
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
                  submitDisabled={submitDisabled}
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

/** 底栏里第一颗按钮就是「跳过」(分步态叫 Skip,平铺态叫 Skip — you decide)。 */
function skipButton(container: HTMLElement): HTMLButtonElement {
  const foot = container.querySelector('.question-form-foot');
  if (!foot) throw new Error('底栏没渲染出来 —— 夹具或组件变了,先修这里');
  const button = foot.querySelector('button');
  if (!button) throw new Error('底栏里一颗按钮都没有');
  return button as HTMLButtonElement;
}

function submitButton(container: HTMLElement): HTMLButtonElement {
  const foot = container.querySelector('.question-form-foot')!;
  const buttons = [...foot.querySelectorAll('button')];
  const last = buttons[buttons.length - 1];
  if (!last) throw new Error('底栏里一颗按钮都没有');
  return last as HTMLButtonElement;
}

function advanceToSecondStep(container: HTMLElement): HTMLButtonElement {
  const option = container.querySelector('.qf-chip');
  if (!option) throw new Error('分步夹具第一题没有选项');
  fireEvent.click(option);
  fireEvent.click(submitButton(container));
  const back = [...container.querySelectorAll<HTMLButtonElement>('.question-form-foot button')]
    .find((button) => button.textContent?.trim() === 'Back');
  if (!back) throw new Error('第二步没有渲染 Back');
  return back;
}

/* ── 微型层叠解析器 ───────────────────────────────────────────────── */

interface Rule { selector: string; body: string; order: number }

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 顶层规则。`@media` / `@supports` 这类块整体跳过 —— 本文件比的是声明文本,不是解析后的颜色。 */
function parseRules(css: string, start: number): { rules: Rule[]; next: number } {
  const rules: Rule[] = [];
  let order = start;
  let i = 0;
  const src = stripComments(css);
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? '')) i += 1;
    if (i >= src.length) break;
    if (src[i] === '@') {
      let j = i;
      while (j < src.length && src[j] !== '{' && src[j] !== ';') j += 1;
      if (j >= src.length || src[j] === ';') { i = j + 1; continue; }
      let depth = 0;
      let k = j;
      for (; k < src.length; k += 1) {
        if (src[k] === '{') depth += 1;
        else if (src[k] === '}') { depth -= 1; if (depth === 0) break; }
      }
      i = k + 1;
      continue;
    }
    const brace = src.indexOf('{', i);
    if (brace < 0) break;
    const end = src.indexOf('}', brace);
    if (end < 0) break;
    rules.push({
      selector: src.slice(i, brace).trim().replace(/\s+/g, ' '),
      body: src.slice(brace + 1, end),
      order: (order += 1),
    });
    i = end + 1;
  }
  return { rules, next: order };
}

/** CSS Module 的类名换成真哈希 —— 全局表里的 `.button` 在产线上**不匹配** module 类,照抄这件事。 */
function hashed(css: string, map: Record<string, string>): string {
  const locals = new Set<string>();
  for (const m of stripComments(css).matchAll(/\.([A-Za-z][\w-]*)/g)) locals.add(m[1]!);
  let out = css;
  for (const local of locals) {
    const generated = map[local];
    if (!generated || local === generated) continue;
    out = out.replace(new RegExp(`\\.${local}\\b`, 'g'), `.${generated}`);
  }
  return out;
}

/** 产品 `index.css` 的导入顺序(只取够得着这颗按钮的那几张),CSS Module 排在全局之后。 */
function sheets(): Rule[] {
  const parts = [
    read('src/styles/tokens.css'),
    read('src/styles/base.css'),
    readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
    read('src/styles/primitives.css'),
    read('src/styles/chat.css'),
    read('src/styles/viewer/code.css'),
    read('src/styles/viewer/tools.css'),
    read('src/styles/viewer/composio.css'),
    read('src/styles/viewer/theater.css'),
    read('src/styles/viewer/routines.css'),
    hashed(read('src/components/chat/ChatRoot.module.css'), chatRootStyles as unknown as Record<string, string>),
    hashed(
      readFileSync(resolve(WEB, '../../packages/components/src/button.module.css'), 'utf-8'),
      btnStyles as unknown as Record<string, string>,
    ),
  ];
  const all: Rule[] = [];
  let order = 0;
  for (const part of parts) {
    const parsed = parseRules(part, order);
    all.push(...parsed.rules);
    order = parsed.next;
  }
  return all;
}

const RULES = sheets();

/**
 * 特异性走校准过的共享量尺 —— 这儿原来是**老共享尺的逐字克隆**,带着同一个
 * `:not()` 自计一格的缺陷(`button.primary:hover:not(:disabled)` 读成 (0,4,1),
 * 规范是 (0,3,1))。校准过的那份见 `tests/helpers/chat-mirror-cascade.ts`。
 */

const SHORTHAND_TARGETS = [
  'background-color',
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'font-weight', 'font-size', 'color', 'height', 'box-shadow',
] as const;
type Prop = (typeof SHORTHAND_TARGETS)[number];

function expand(prop: string, value: string): Array<[Prop, string]> {
  const v = value.trim();
  switch (prop) {
    case 'background':
      // `none` / `transparent` / 单色都只落在 background-color 上;渐变不出现在这几条规则里
      return [['background-color', v === 'none' ? 'transparent' : v]];
    case 'background-color':
      return [['background-color', v]];
    case 'border': {
      if (/^0(px)?$/.test(v) || v === 'none') {
        return [['border-top-width', '0px'], ['border-top-style', 'none'], ['border-top-color', 'currentcolor']];
      }
      const parts = v.split(/\s+(?![^(]*\))/);
      return [
        ['border-top-width', parts[0] ?? 'medium'],
        ['border-top-style', parts[1] ?? 'none'],
        ['border-top-color', parts[2] ?? 'currentcolor'],
      ];
    }
    case 'border-width': return [['border-top-width', v]];
    case 'border-style': return [['border-top-style', v]];
    case 'border-color': return [['border-top-color', v]];
    case 'border-radius': return [['border-radius', v]];
    case 'padding': {
      const p = v.split(/\s+(?![^(]*\))/);
      const [t, r = t, b = t, l = r] = p as [string, string?, string?, string?];
      return [['padding-top', t!], ['padding-right', r!], ['padding-bottom', b!], ['padding-left', l!]];
    }
    case 'padding-block': {
      const p = v.split(/\s+/);
      return [['padding-top', p[0]!], ['padding-bottom', p[1] ?? p[0]!]];
    }
    case 'padding-inline': {
      const p = v.split(/\s+/);
      return [['padding-left', p[0]!], ['padding-right', p[1] ?? p[0]!]];
    }
    case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left':
    case 'font-weight': case 'font-size': case 'color': case 'height': case 'box-shadow':
      return [[prop as Prop, v]];
    default:
      return [];
  }
}

/** 一层 `var()` 解析,变量表取自 tokens.css / base.css 的 `:root`(产品强制亮色)。 */
const TOKENS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const file of ['src/styles/tokens.css', 'src/styles/base.css']) {
    const css = stripComments(read(file));
    const root = /:root\s*\{([\s\S]*?)\}/.exec(css);
    for (const decl of (root?.[1] ?? '').split(';')) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (m) map[m[1]!] = m[2]!.trim();
    }
  }
  return map;
})();

function deref(value: string): string {
  let out = value;
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (whole, name: string, fallback?: string) =>
      TOKENS[name] ?? fallback?.trim() ?? whole,
    );
    if (next === out) break;
    out = next;
  }
  // 无单位的 0 归一成 0px,免得 `padding-inline: 0` 和 `padding: 4px 0px` 比出假差异
  return out.trim().replace(/(^|\s)0(?=$|\s)/g, '$10px');
}

/** 元素上每个属性的胜出值(已解 var)。 */
function resolved(el: Element): Record<Prop, string> {
  const winners = new Map<Prop, { spec: number; order: number; value: string }>();
  for (const rule of RULES) {
    const branch = rule.selector.split(',').map((s) => s.trim()).filter(Boolean)
      .find((s) => { try { return el.matches(s); } catch { return false; } });
    if (!branch) continue;
    const spec = specificity(branch);
    for (const decl of rule.body.split(';')) {
      const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (!m) continue;
      for (const [prop, value] of expand(m[1]!.toLowerCase(), m[2]!)) {
        const current = winners.get(prop);
        if (!current || spec > current.spec || (spec === current.spec && rule.order >= current.order)) {
          winners.set(prop, { spec, order: rule.order, value });
        }
      }
    }
  }
  const out = {} as Record<Prop, string>;
  for (const prop of SHORTHAND_TARGETS) out[prop] = deref(winners.get(prop)?.value ?? '<unset>');
  return out;
}

/* ── 交付稿的九项(真机量出,见文件头) ─────────────────────────────── */

const DESIGN_SKIP: Record<Prop, string> = {
  'background-color': 'transparent',
  'border-top-width': '0px',
  'border-top-style': 'none',
  // 稿子那颗是 `currentcolor`(它的 `.btn` 一条描边都不写),我们从
  // `primitives.css` 的 `button.ghost { border-color: transparent }` 拿到 transparent。
  // 宽度两边都是 0,这一项画不出来 —— 留在表里只为把「两态一致」比全。
  'border-top-color': 'transparent',
  'border-radius': '999px',
  'padding-top': '4px',
  'padding-right': '0px',
  'padding-bottom': '4px',
  'padding-left': '0px',
  'font-weight': '600',
  'font-size': '12px',
  color: '#5c5c5c',
  height: 'auto',
  'box-shadow': '<unset>',
};

const DESIGN_RIGHT_GHOST: Record<Prop, string> = {
  ...DESIGN_SKIP,
  'padding-right': '11px',
  'padding-left': '11px',
};

describe('question-form 底栏「跳过」两态一致', () => {
  it('主按钮在平铺和分步底栏都保持设计稿的 32px 高度', () => {
    for (const form of [FLAT, STEPPED]) {
      expect(resolved(submitButton(mount(form, false))).height).toBe('32px');
      cleanup();
    }
  });

  it('分步首屏不画无效的上一步,第二步才出现且沿用稿子右侧 ghost 档', () => {
    const container = mount(STEPPED, false);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('.question-form-foot button')]
        .some((button) => button.textContent?.trim() === 'Back'),
    ).toBe(false);

    expect(resolved(advanceToSecondStep(container))).toEqual(DESIGN_RIGHT_GHOST);
  });

  it('正向对照:两态都真的渲染出了那颗按钮,而且都是同一个共享原语', () => {
    for (const form of [FLAT, STEPPED]) {
      const idle = skipButton(mount(form, false));
      const busy = skipButton(mount(form, true));
      expect(idle.textContent?.trim().length).toBeGreaterThan(0);
      expect(busy.textContent).toBe(idle.textContent);
      // 共享 Button 的指纹:module 基底 + ghost 档 + sm 尺寸(顺带兜住旧全局类)
      expect(idle.className).toBe(busy.className);
      expect(idle.className).toContain(btnStyles.button);
      expect(idle.className).toContain(btnStyles.ghost);
      expect(idle.className).toContain(btnStyles.sm);
      // 忙的时候按钮才是禁用的 —— 没有这条,下面的两态比对比的是同一个态
      expect(idle.disabled).toBe(false);
      expect(busy.disabled).toBe(true);
      cleanup();
    }
  });

  it('防真空:解析器确实看得见共享原语的禁用底色(实心的「下一步」照旧铺灰)', () => {
    // `.button:disabled { background: var(--bg-subtle) }` 对主按钮是稿子要的样子
    // (`.btn:disabled { background: var(--bg-subtle) }`)。解析器要是瞎了,
    // 这条会掉成 transparent,而「两态一致」就会假绿。
    const busy = resolved(submitButton(mount(FLAT, true)));
    expect(busy['background-color']).toBe('#ededed');
    expect(busy.color).toBe('#bdbdbd');
  });

  it('终态逐项对上交付稿', () => {
    const idle = resolved(skipButton(mount(FLAT, false)));
    expect(idle).toEqual(DESIGN_SKIP);
  });

  it('加载态(会话忙 / 提交中)和终态逐项一致 —— 平铺', () => {
    const idle = resolved(skipButton(mount(FLAT, false)));
    cleanup();
    const busy = resolved(skipButton(mount(FLAT, true)));
    expect(busy).toEqual(idle);
    expect(busy).toEqual(DESIGN_SKIP);
  });

  it('加载态和终态逐项一致 —— 分步', () => {
    const idleContainer = mount(STEPPED, false);
    /* 倒计时**不在底栏了** —— 稿子 `729fa43ce7` 把它挪到卡头右上(W75),
       所以「跳过」重新是底栏的第一个孩子。`.question-form-foot > button:first-of-type`
       那条规则两种排布都命中,padding-inline: 0 照旧落在这颗上(下面那条断言钉住)。 */
    expect(idleContainer.querySelector('.qf-auto-continue')?.closest('.question-form-foot'))
      .toBeNull();
    expect(idleContainer.querySelector('.question-form-foot')?.firstElementChild)
      .toBe(skipButton(idleContainer));
    const idle = resolved(skipButton(idleContainer));
    cleanup();
    const busy = resolved(skipButton(mount(STEPPED, true)));
    expect(idle['padding-left']).toBe('0px');
    expect(busy).toEqual(idle);
    expect(busy).toEqual(DESIGN_SKIP);
  });
});
