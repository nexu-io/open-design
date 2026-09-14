// @vitest-environment jsdom
/**
 * W73 · 输入框三格 + Plan「当前这一步」的墨色,逐格对稿。
 *
 * 基线:`729fa43ce7`(`origin/design/chat-cards-surface` 头)。
 * `chat-panel-next.html` 是构建产物,一律不看;期望值全部来自把
 * `docs/design/chat-panel/src/*.css` 放到 `src/body-components.html` 上
 * **真算一遍**的胜出值,不是抄稿子的注释。算出来的三组:
 *
 *   ① 输入框   `729fa43ce7:components.css:3098-3117`
 *        .composer .ta      { font-size: var(--t-body); line-height: var(--lh-body) }
 *                             → 13px / **1.7**            (产品:13px / 1.6)
 *        .composer .bar button        { color: var(--text-strong) }
 *                             → **#202020**               (产品:--text-muted #5c5c5c)
 *        .composer .bar button:hover  { background: var(--bg-fill-secondary) }
 *                             → 悬停**只换底色**:字色仍 #202020、描边不动
 *                             (产品还改 color → --text、border-color → --border)
 *      稿子那段注释把理由写在旁边:底栏这几个是「你要伸手去够的东西」,提到最深
 *      之后 hover 不能再靠变深,只留底色。—— 注释归注释,上面三个数是算出来的。
 *
 *   ② Plan 当前步 / 收起药丸   `729fa43ce7:components.css:2007-2016, 2070`
 *        .steps, .pmini { --plan-current-text: #353535; --plan-other-text: #848484 }
 *        .steps li.is-now { color: var(--plan-current-text) }   → **#353535**
 *        .pmini .pill     { color: var(--plan-current-text) }   → **#353535**
 *      产品两处都写的 `--chat-text-strong`(#202020),深了一档。
 *      非当前步那一档 `#848484` 和产品的 `--chat-text-soft` 逐字节相同,不动。
 *      稿子**没有**给这两枚变量任何暗色覆盖(整份 src 里只有这一处声明),
 *      所以接缝的亮暗两个作用域按约定同值。
 *
 * ── 量法与它的边界(先读这段) ─────────────────────────────────────────
 * jsdom 不做层叠、不解 `var()`,`getComputedStyle` 在这里恒为空串。
 *
 *   · 共享量尺 `tests/helpers/chat-mirror-cascade` 负责白名单里的属性。
 *     `line-height` / `font-family` 本来**不在**名单里 —— 不在名单的属性读回
 *     `<unset>`,和「真的没人写」分不开,于是「两边都 `<unset>`」的相等断言
 *     看着是绿的、其实一格没量。本单把这两项加进了名单(改动在
 *     `chat-mirror-cascade.ts` 的 `expand()`),下面第 0 组专门证明**加完之后
 *     真能读出非默认值**,不是又一个 `<unset>`。
 *   · 共享量尺按 `el.matches()` 匹配,jsdom 里 `:hover` 恒为假 —— hover 那一格
 *     它一条也看不见。所以本文件另配一把 `state()` 小尺子:只做长手属性 +
 *     可指定「当成已激活」的状态伪类,其余(表的顺序、特异性、var 解析)照抄。
 *     第 0 组同时证明这两把尺子在重叠处读数一致,不是各算各的。
 *   · `--chat-*` 定义在 CSS Module 的 `.vars` / `.root` 类上,而两把尺子的
 *     `deref()` 都只认 token 表的 `:root` —— 解不开。碰到它就按**两步**走:
 *     ① 量到这一格由哪一枚接缝别名给;② 单独核那枚别名在亮暗两个作用域的字面值。
 *     只做 ① 会被「改了别名却没定义」骗过,只做 ② 会被「定义了没人用」骗过。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import planStyles from '../../../src/components/chat/PlanPill.module.css';
import {
  createResolver,
  hashed,
  parseRules,
  specificity,
  stripComments,
  UNSET,
  type Rule,
} from '../../helpers/chat-mirror-cascade';
import { I18nProvider } from '../../../src/i18n';
import { ChatRoot } from '../../../src/components/chat/ChatRoot';
import { PlanPill } from '../../../src/components/chat/PlanPill';
import { LexicalComposerInput } from '../../../src/components/composer/LexicalComposerInput';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

/* ── 稿子的字面值 ──────────────────────────────────────────────────────
 * 解自 `729fa43ce7:docs/design/chat-panel/src/tokens.css` 的 `:root` 与
 * `components.css` 的字号阶梯;两个基线之间这两段一个字都没改。
 * 写死字面量而不是写 `var(--…)`:验收标准是「算出来的和稿子逐字节相同」。 */
const DRAFT = {
  /** `--lh-body`   components.css:115 —— `.composer .ta` 用的就是它 */
  lhBody: '1.7',
  /** `--t-body` = `--font-size-13`  components.css:108 / tokens.css:295 */
  tBody: '13px',
  /** `--text-strong`  tokens.css:62 —— 底栏图标那一档 */
  textStrong: '#202020',
  /** `--text-muted`   tokens.css:63 —— 产品当前那一档,反向对照要用 */
  textMuted: '#5c5c5c',
  /** `--bg-fill-secondary` tokens.css:43 —— 底栏 hover 唯一变的那一样 */
  fillSecondary: 'rgba(0, 0, 0, 0.06)',
  /** `--plan-current-text` components.css:2008 —— 当前这一步 / 收起药丸 */
  planCurrent: '#353535',
  /** `--plan-other-text`  components.css:2009 —— 非当前的那几步 */
  planOther: '#848484',
} as const;

/* ── 产品的表,顺序照 `src/index.css` + `app/layout.tsx` ────────────────
 * `app/layout.tsx` 先 `import '../src/index.css'` 再 `import
 * '../src/styles/home/index.css'` —— 所以 home 那一族**排在 chat.css 之后**,
 * 平手时它赢。首页 hero 的反向对照全靠这个顺序,顺序写反了那一格会假绿。
 *
 * ⚠️ `primitives.css` 必须在里面:`button.icon-btn` 那条基线是从它下来的。
 * ⚠️ CSS Module 先过 `hashed()`,否则量的是一颗产线上根本不存在的元素。 */
const SHEETS = (): string[] => [
  read('src/styles/tokens.css'),
  read('src/styles/base.css'),
  readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  read('src/styles/home/home-hero.css'),
  read('src/styles/home/plus-menu.css'),
  hashed(
    read('src/components/chat/ChatRoot.module.css'),
    chatRootStyles as unknown as Record<string, string>,
  ),
  hashed(
    read('src/components/chat/PlanPill.module.css'),
    planStyles as unknown as Record<string, string>,
  ),
];

const TOKEN_SHEETS = (): string[] => [read('src/styles/tokens.css'), read('src/styles/base.css')];

const TARGETS = ['font-size', 'line-height', 'font-family', 'color', 'font-weight'] as const;

const CSS = createResolver(SHEETS(), TOKEN_SHEETS(), TARGETS);

/* ── 小尺子:任意长手属性 + 指定状态伪类 ───────────────────────────────
 * 和 `queue-draft-alignment.test.tsx` 里那把同一个路数(那边也是因为共享量尺
 * 看不见 `:hover` 才另配的)。只做两件共享量尺不做的事:
 *   ① 不做简写展开 —— 这里要读的都是稿子逐条写出来的长手;
 *   ② 把 `:hover` 这类状态伪类当成「已激活」来匹配;**特异性仍按原选择器算**,
 *      和浏览器一致(去掉伪类再算会让 hover 规则凭空轻一格,层叠就假了)。 */
const ALL_RULES: Rule[] = (() => {
  const rules: Rule[] = [];
  let order = 0;
  for (const part of SHEETS()) {
    const parsed = parseRules(part, order);
    rules.push(...parsed.rules);
    order = parsed.next;
  }
  return rules;
})();

const TOKENS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const css of TOKEN_SHEETS()) {
    const root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(css));
    for (const decl of (root?.[1] ?? '').split(';')) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (m) out[m[1]!] = m[2]!.trim();
    }
  }
  return out;
})();

const deref = (value: string): string => {
  let out = value;
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
      (whole, name: string, fallback?: string) => TOKENS[name] ?? fallback?.trim() ?? whole,
    );
    if (next === out) break;
    out = next;
  }
  return out.trim();
};

/** 顶层逗号拆分 —— `:is(.a, .b)` 里的逗号是参数分隔,裸 split 会造出假选择器。 */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * `el` 上 `prop` 的胜出值,把 `states` 里的状态伪类当成已激活。
 * 没有任何规则给出这个属性时返回 {@link UNSET}。
 */
function state(el: Element, prop: string, states: readonly string[] = []): string {
  let win: { spec: number; order: number; value: string } | null = null;
  for (const rule of ALL_RULES) {
    for (const branch of splitTopLevel(rule.selector)) {
      let probe = branch;
      for (const st of states) probe = probe.split(st).join('');
      probe = probe.trim();
      if (!probe) continue;
      let hit = false;
      try {
        hit = el.matches(probe);
      } catch {
        // 伪元素分支永远匹配不到元素本体;其余解析失败一律当不匹配处理,
        // 但**必须**有第 0 组的防真空断言兜底,否则「全都不匹配」会读成 `<unset>`。
        hit = false;
      }
      if (!hit) continue;
      const spec = specificity(branch);
      for (const decl of rule.body.split(';')) {
        const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
        if (!m || m[1]!.toLowerCase() !== prop) continue;
        if (!win || spec > win.spec || (spec === win.spec && rule.order >= win.order)) {
          win = { spec, order: rule.order, value: m[2]!.trim() };
        }
      }
      break;
    }
  }
  return win ? deref(win.value) : UNSET;
}

function pick(root: HTMLElement, selector: string): Element {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`夹具里找不到 ${selector} —— 类名变了,这条断言已经名存实亡`);
  return el;
}

/* ── 夹具 ──────────────────────────────────────────────────────────────
 * 输入框那一格挂的是**真组件** `LexicalComposerInput`(产品里首页 hero 和
 * 会话面板共用的就是它),外面那几层壳按 `ChatComposer.tsx` / `HomeHero.tsx`
 * 的真实类名手搭。底栏那颗 `+` 由 `ComposerPlusMenu` 渲染,它要一整套
 * provider 才起得来,所以按源码里那串字面类名手搭 —— 并在「结构对照」一组里
 * 直接读源码核对,夹具漂了会红,不会悄悄变成量另一颗按钮。 */
const EDITOR_PROPS = {
  draft: '',
  placeholder: '说点什么',
  knownEntities: [],
  onChange: () => {},
  onTrigger: () => {},
  onEnterSend: () => {},
  popoverOpen: false,
  onPopoverKey: () => false,
  // 不加 `as const`:它会把 `knownEntities` 定成 `readonly []`,
  // 而 `LexicalComposerInputProps` 要的是可变的 `InlineMentionEntity[]`。
};

/** 会话面板:`ChatPane` 用 `chatSeam(...)` 把接缝抹在祖先上,这里用 `<ChatRoot>` 等价。 */
const mountChatComposer = (): HTMLElement =>
  render(
    <I18nProvider>
      <div className="app">
        <ChatRoot>
          <div className="composer">
            <div className="composer-shell">
              <div className="composer-input-wrap">
                <LexicalComposerInput {...EDITOR_PROPS} testId="chat-input" />
                <div className="home-hero__carousel">
                  <span className="home-hero__carousel-text">占位轮播</span>
                </div>
              </div>
              <div className="composer-row">
                <div className="plus-menu">
                  <button type="button" className="icon-btn plus-menu__trigger od-tooltip" />
                </div>
              </div>
            </div>
          </div>
        </ChatRoot>
      </div>
    </I18nProvider>,
  ).container;

/** 首页 hero:同一个编辑器,**不在**接缝里,外壳类名照 `HomeHero.tsx`。 */
const mountHomeHero = (): HTMLElement =>
  render(
    <I18nProvider>
      <div className="app">
        <div className="home-hero__prompt-surface">
          <div className="home-hero__prompt-editor home-hero__lexical">
            <LexicalComposerInput {...EDITOR_PROPS} testId="home-hero-input" />
          </div>
        </div>
      </div>
    </I18nProvider>,
  ).container;

/** 批注侧栏「新建评论」的动作行 —— 和会话面板共用 `.composer-row`,照 `FileViewer.tsx`。 */
const mountCommentSide = (): HTMLElement =>
  render(
    <I18nProvider>
      <div className="app">
        <form className="comment-side-new-comment composer">
          <div className="composer-shell comment-side-new-comment-shell">
            <div className="composer-row comment-side-new-comment-actions">
              <button type="button" className="icon-btn" />
            </div>
          </div>
        </form>
      </div>
    </I18nProvider>,
  ).container;

/* ══ ⓪ 防真空:两把尺子都得先证明自己看得见东西 ═══════════════════════ */

describe('⓪ 防真空 —— 先证明量法读得出非默认值', () => {
  it('共享量尺加完白名单之后,`line-height` 读出的是真值,不是 <unset> / normal', () => {
    // chat 接缝根自己写着 `line-height: var(--chat-lh-row)`,但 `--chat-*` 解不开,
    // 所以拿一条**解得开**的:`.composer-input-editor .composer-editable` 在
    // `chat.css` 里是写死的字面量。它读回 `<unset>` 就说明名单没加成 / 表没盖到。
    const el = pick(mountChatComposer(), '.composer-editable');
    const lh = CSS.resolved(el)['line-height'];
    expect(lh, 'line-height 仍被白名单丢掉 —— 下面所有行高断言都是假的').not.toBe(UNSET);
    expect(lh, 'line-height 读成了 normal,等于没量').not.toBe('normal');
    expect(lh, '行高应当是一个纯数字比值').toMatch(/^\d+(\.\d+)?$/);
  });

  it('`font-family` 同样读得出真值(顺手加的那一项,不许是空转)', () => {
    // `.composer-input-editor [contenteditable]` 写着 `font: inherit`,不带 family;
    // 拿 `chat.css` 里那条 `:where([data-chat-root]) button { font-family: inherit }`,
    // 它是**明确写了** font-family 的一条,读回 `<unset>` 就是没进名单。
    const el = pick(mountChatComposer(), '.plus-menu__trigger');
    const ff = CSS.resolved(el)['font-family'];
    expect(ff, 'font-family 仍被白名单丢掉').not.toBe(UNSET);
    expect(ff).toBe('inherit');
  });

  it('小尺子和共享量尺在重叠处读数一致 —— 不是各算各的', () => {
    const el = pick(mountChatComposer(), '.composer-editable');
    for (const prop of ['font-size', 'line-height', 'color'] as const) {
      expect(state(el, prop), `两把尺子在 ${prop} 上不一致`).toBe(CSS.resolved(el)[prop]);
    }
  });

  it('小尺子确实看得见 `:hover` —— 不给状态时读到的是静止那一档', () => {
    const el = pick(mountChatComposer(), '.plus-menu__trigger');
    const rest = state(el, 'background');
    const hover = state(el, 'background', [':hover']);
    expect(rest, '静止态没有任何规则给 background,尺子没盖到').not.toBe(UNSET);
    expect(hover, 'hover 态没有任何规则给 background,状态开关没生效').not.toBe(UNSET);
    expect(hover, 'hover 和静止读出同一个值 —— 状态伪类没被激活,这把尺子是瞎的').not.toBe(rest);
  });
});

/* ══ ① 输入框 ═══════════════════════════════════════════════════════════ */

describe('①-1 输入区正文与占位符的行高 —— 稿子 `.composer .ta`(729fa43ce7:3100)', () => {
  it('正文行高是 1.7', () => {
    const measured = CSS.resolved(pick(mountChatComposer(), '.composer-editable'));
    expect(measured['font-size'], '前提:字号先得是稿子那一档').toBe(DRAFT.tBody);
    expect(measured['line-height']).toBe(DRAFT.lhBody);
  });

  it('占位符跟正文同一档行高 —— 它俩是同一行字的两种状态', () => {
    const el = pick(mountChatComposer(), '.composer-input-placeholder');
    expect(CSS.resolved(el)['line-height']).toBe(DRAFT.lhBody);
  });

  it('占位符轮播那一层也跟着走 —— 它盖在占位符原位上,差一档就会跳一下', () => {
    const el = pick(mountChatComposer(), '.home-hero__carousel');
    expect(CSS.resolved(el)['line-height']).toBe(DRAFT.lhBody);
  });

  it('反向对照:首页 hero 用的是同一个编辑器,行高**不跟着变**', () => {
    const el = pick(mountHomeHero(), '.composer-editable');
    const measured = CSS.resolved(el);
    // 前提先立住:hero 确实盖到了它自己那条(字号 14,不是会话面板的 13)。
    expect(measured['font-size'], 'hero 那条规则没盖上,这条反向对照是空的').toBe('14px');
    expect(measured['line-height'], 'hero 的行高被会话面板的改动带走了').toBe('1.6');
  });
});

describe('①-2 底栏图标的静止墨色 —— 稿子 `.composer .bar button`(729fa43ce7:3112)', () => {
  it('是最深的一档 #202020,不是次一档的静音灰', () => {
    const el = pick(mountChatComposer(), '.plus-menu__trigger');
    const color = CSS.resolved(el)['color'];
    expect(color, '量尺没盖到这颗按钮').not.toBe(UNSET);
    expect(color).toBe(DRAFT.textStrong);
  });

  it('反向对照:批注侧栏那一行共用 `.composer-row`,**不跟着变深**', () => {
    const el = pick(mountCommentSide(), '.composer-row .icon-btn');
    const color = CSS.resolved(el)['color'];
    expect(color, '量尺没盖到批注侧栏那颗').not.toBe(UNSET);
    expect(color).toBe(DRAFT.textMuted);
  });
});

describe('①-3 底栏图标的 hover —— 稿子 `.composer .bar button:hover`(729fa43ce7:3116)', () => {
  const hovered = (): Element => pick(mountChatComposer(), '.plus-menu__trigger');

  it('hover 只换底色', () => {
    expect(state(hovered(), 'background', [':hover'])).toBe(DRAFT.fillSecondary);
  });

  it('hover 不动字色 —— 静止已经是最深的一档,再变只会变浅', () => {
    expect(state(hovered(), 'color', [':hover'])).toBe(DRAFT.textStrong);
  });

  it('hover 不长描边 —— 稿子那颗按钮 hover 时边框一条都不写', () => {
    expect(state(hovered(), 'border-color', [':hover'])).toBe('transparent');
  });

  it('反向对照:静止态的底是透明的 —— 底色是 hover 唯一说的那句话', () => {
    expect(state(hovered(), 'background')).toBe('transparent');
  });
});

/* ══ ② Plan 当前步 / 收起药丸 ═══════════════════════════════════════════ */

const PLAN_CSS = stripComments(read('src/components/chat/PlanPill.module.css'));
const SEAM = stripComments(read('src/components/chat/ChatRoot.module.css'));

/** 稿子那枚 `--plan-current-text` 在产品这一侧的接缝别名。 */
const PLAN_CURRENT_ALIAS = '--chat-plan-current-text';

const mountPlan = (): HTMLElement =>
  render(
    <I18nProvider initial="zh-CN">
      <ChatRoot>
        <PlanPill
          running
          todos={[
            { content: '第一步', status: 'completed' },
            { content: '第二步', status: 'in_progress' },
            { content: '第三步', status: 'pending' },
          ]}
        />
      </ChatRoot>
    </I18nProvider>,
  ).container;

describe('② 当前这一步 / 收起药丸的墨色 —— 稿子 `--plan-current-text`(729fa43ce7:2008)', () => {
  it('防真空:量尺盖到了这几行,color 不是「没人声明」', () => {
    const root = mountPlan();
    const now = pick(root, 'li[class*="now"]');
    expect(CSS.resolved(now)['color'], '样式链没盖到当前这一步').not.toBe(UNSET);
    // 反向对照:同一条规则里的字重早就对上了(稿子 600),证明读的确实是这条规则。
    expect(CSS.resolved(now)['font-weight']).toBe('600');
  });

  it('① 当前这一步走 plan 自己那枚接缝别名,不再复用「最深的正文色」', () => {
    const now = pick(mountPlan(), 'li[class*="now"]');
    expect(CSS.resolved(now)['color']).toBe(`var(${PLAN_CURRENT_ALIAS})`);
  });

  it('① 收起态的药丸和展开态的当前步同一枚别名 —— 它俩是同一件事的两个形态', () => {
    expect(PLAN_CSS).toMatch(
      new RegExp(String.raw`\.wrap \.pill\s*\{[^{}]*color:\s*var\(${PLAN_CURRENT_ALIAS}\)`),
    );
  });

  it('② 那枚别名在亮暗两个作用域里都是稿子的字面 #353535', () => {
    const decls = [...SEAM.matchAll(new RegExp(`${PLAN_CURRENT_ALIAS}:\\s*([^;]+);`, 'g'))].map(
      (m) => m[1]!.trim().toLowerCase(),
    );
    expect(decls.length, '接缝里没有两处声明(亮 + 暗各一次)').toBe(2);
    for (const value of decls) expect(value).toBe(DRAFT.planCurrent);
  });

  it('反向对照:非当前的那几步一格没动,仍是 --chat-text-soft,且它就是稿子的 #848484', () => {
    const root = mountPlan();
    // 「没开始」那一档 `className` 是 `undefined`(PlanPill.tsx:114),所以按「没有类名的 li」找。
    const pending = pick(root, 'ol[class] > li:not([class])');
    // 同样是「量到别名 + 单独核别名」两步 —— 接缝变量量尺解不开,只做一步会被骗。
    expect(CSS.resolved(pending)['color']).toBe('var(--chat-text-soft)');
    expect(PLAN_CSS).toMatch(/\.steps li\s*\{[^{}]*color:\s*var\(--chat-text-soft\)/);
    expect(PLAN_CSS).toMatch(/\.steps li\.done\s*\{[^{}]*color:\s*var\(--chat-text-soft\)/);
    // 那枚别名在亮暗两个作用域都映射到 `--text-soft`,而 `--text-soft` 就是稿子的 #848484。
    const soft = [...SEAM.matchAll(/--chat-text-soft:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(soft.length, '接缝里没有两处声明(亮 + 暗各一次)').toBe(2);
    for (const value of soft) expect(value).toBe('var(--text-soft)');
    expect(TOKENS['--text-soft']?.toLowerCase()).toBe(DRAFT.planOther);
  });

  it('反向对照:这几条一律走 --chat-* 接缝,PlanPill 里没有写死的色值', () => {
    for (const m of PLAN_CSS.matchAll(/color:\s*([^;]+);/g)) {
      expect(m[1]!.trim(), '组件 Module 里出现了硬编码色值(chat/AGENTS.md §2)').not.toMatch(
        /#[0-9a-fA-F]{3,8}\b/,
      );
    }
  });
});

/* ══ 结构对照:夹具的类名链条来自源码,不是我编的 ═══════════════════════ */

describe('结构对照 —— 手搭的那两处夹具必须跟着源码走', () => {
  it('底栏那颗 `+` 在源码里就是 `icon-btn plus-menu__trigger`', () => {
    /*
     * 合并 main(2026-09-05)之后这串类名不再是一个字面量:首页那一侧多了
     * `triggerLabel`,于是拼接变成
     *   `icon-btn plus-menu__trigger${label ? ' --labeled' : ' od-tooltip'}${open ? ' is-active' : ''}`
     * 聊天面板不传 label,**运行时拼出来仍然是** `icon-btn plus-menu__trigger
     * od-tooltip` —— 上面那份手搭夹具没有过时。过时的是「按整段字面量搜源码」
     * 这个查法,它现在只是在钉排版。改成分别钉两件事:基础类名还在,以及
     * 「不带标签时挂 od-tooltip」这条分支还在。
     */
    const plusMenu = read('src/components/ComposerPlusMenu.tsx');
    expect(plusMenu).toContain('icon-btn plus-menu__trigger');
    expect(plusMenu).toMatch(/triggerLabel \?[^:]*:\s*' od-tooltip'/);
  });

  it('它坐在 `.composer-row` 里,而 `.composer-row` 由 `ChatComposer` 渲染', () => {
    const composer = read('src/components/ChatComposer.tsx');
    const rowAt = composer.indexOf('<div className="composer-row">');
    expect(rowAt, '`.composer-row` 不在 ChatComposer 里了,夹具已经名存实亡').toBeGreaterThan(-1);
    expect(composer.slice(rowAt, rowAt + 4000)).toContain('<ComposerPlusMenu');
  });

  it('批注侧栏那一行确实共用 `.composer-row`(所以上面那条反向对照不是摆设)', () => {
    expect(read('src/components/FileViewer.tsx')).toContain(
      'composer-row comment-side-new-comment-actions',
    );
  });

  it('会话面板的输入框活在接缝里,首页 hero 不在 —— 作用域收敛的前提', () => {
    const chatPane = read('src/components/ChatPane.tsx');
    expect(chatPane).toContain("chatSeam('pane')");
    expect(chatPane).toContain("chatSeam('chat-composer-fixed-layer')");
    expect(read('src/components/HomeHero.tsx')).not.toContain('chatSeam');
    expect(read('src/components/HomeHero.tsx')).not.toContain('data-chat-root');
  });
});
