// @vitest-environment jsdom
/**
 * ChatPanel 的**排版基线** —— 字重 500 / 字号 13px / 行高 1.5。
 *
 * ## 这一条要挡的是什么
 *
 * 交付稿(PR #7170 @ `8015870`,`docs/design/chat-panel/src/components.css`)那张页面的
 * `body` 是:
 *
 *   body { font-family: var(--sans); font-weight: 500;
 *          font-size: var(--font-size-13); line-height: 1.5; … }
 *
 * 产品的全站 `body`(`styles/base.css`)则是 **400 / 14px / 125%** —— 三条全不一样。
 * 净效果:整个面板比稿子**轻一档、大一号、挤一行**。
 * 之前逐个组件量都得出「我们的 token 和稿子字节相同」,却仍然看着不一样,
 * 真因就在这条基线上,不在各个组件。
 *
 * ## 为什么落在 chat 根,不落在全站 body
 *
 * `base.css` 的 `body` 管的是**全站**:侧栏、设置页、首页、工作区。稿子只画了
 * 聊天面板,那些面从来没按 13/500 设计过。所以基线落在 `ChatRoot.module.css`
 * 的接缝层(`.vars` / `.root`),它本来就是为这种事建的 ——
 * 行高那一条早已按同一个理由写在那里。
 * 「全站 body 没被顺手推过去」由本文件的反向守卫钉住。
 *
 * ## 等宽字体的描述符跟着一起走
 *
 * `JiduMono Pro` 只有一个静态字重文件(`JiduMonoPro-Regular.otf`)。稿子把**同一份
 * 字节**(md5 `207e55ed70d71a2deb9c6516f75c2d4a`,已核)的 `@font-face` 描述符写成
 * `font-weight: 500`,我们写的是 `400`。基线一到 500,耗时 / 文件路径 / Hex /
 * 改动量这些走 mono 的位置就会**请求 500 而可用面只有 400**,各浏览器的折算
 * (回退取面 vs 合成加粗)并不一致。所以描述符必须和基线同时改,不能只做一半。
 *
 * ## 尺子:jsdom 里怎么量「计算值」
 *
 * jsdom 会跑层叠和继承,但**不解析 `var()`**(实测:`getComputedStyle(...).fontSize`
 * 返回字面量 `"var(--font-size-13)"`),也不把 `line-height: 1.5` 折成 px。
 * 所以这里:
 *   1. 从各 `:root` / 接缝块里解析出自定义属性表,**先把 `var()` 展开成字面量**;
 *   2. 只保留排版相关的声明再注入 —— 一来层叠不受影响,二来避开 jsdom 解析
 *      `color-mix()` 渐变时会抛的那个异常;
 *   3. 行高的 px 用值自己算(`line-height × font-size`),并显式断言。
 * 「这把尺子真的看得见缺陷」由第一个 describe 先证明:把那三条声明抽掉,
 * 读数必须掉回 14px / 400 / 125%。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../../helpers/read-expanded-css';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');

const CHAT_ROOT_CSS_PATH = resolve(SRC, 'components/chat/ChatRoot.module.css');
const BASE_CSS_PATH = resolve(SRC, 'styles/base.css');

const CHAT_ROOT_CSS = readFileSync(CHAT_ROOT_CSS_PATH, 'utf-8');
const BASE_CSS = readFileSync(BASE_CSS_PATH, 'utf-8');
const PAUSE_LINE_CSS = readFileSync(resolve(SRC, 'components/chat/PauseLine.module.css'), 'utf-8');

const decomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 稿子的字族**字面值**(`361b78253e:docs/design/chat-panel/src/tokens.css:155`,
 * 稿子 tokens 三版 md5 相同):
 *   --sans: "Albert Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
 * 我们 `tokens.css:149` 逐字节相同 —— 判据写稿子的值,不写「等于我们的 token」。
 */
const DESIGN_SANS = '"Albert Sans", "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 只留排版声明。
 *
 * 注入全量样式表会让 jsdom 在解析 `linear-gradient(… color-mix(…) …)` 时抛异常
 * (`@asamuzakjp/css-color`),整份表连着后面的规则一起丢。排版属性不受影响,
 * 层叠和继承照旧,所以过滤掉其余属性是安全的。
 * 注释先剥掉:本仓 CSS 的注释里有成对的 `{}`(例如引用稿子的
 * `.fold .body { line-height: var(--lh-body) }`),不剥会把括号配对搅乱。
 */
const TYPOGRAPHY = /^(font|font-family|font-size|font-weight|font-style|line-height)$/i;

function typographyOnly(css: string): string {
  let out = decomment(css);
  // 两遍:第一遍处理最内层的声明块,第二遍捞 CSS 嵌套里新暴露出来的那一层
  for (let pass = 0; pass < 2; pass += 1) {
    out = out.replace(/\{([^{}]*)\}/g, (_match, body: string) => {
      const kept = body
        .split(';')
        .map((d) => d.trim())
        .filter((d) => {
          const colon = d.indexOf(':');
          return colon > 0 && TYPOGRAPHY.test(d.slice(0, colon).trim());
        });
      return `{${kept.join(';')}${kept.length ? ';' : ''}}`;
    });
  }
  return out;
}

/** 亮色作用域的自定义属性表(`:root` 与接缝的 `.vars, .root`)。 */
function tokenMap(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of decomment(css).matchAll(/(^|[},])\s*(:root|\.vars,\s*\.root)\s*\{([^{}]*)\}/g)) {
    for (const decl of (rule[3] ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
      out.set(decl[1]!.trim(), decl[2]!.trim());
    }
  }
  return out;
}

function resolveVars(value: string, map: Map<string, string>, depth = 0): string {
  if (depth > 12) return value;
  return value.replace(
    /var\(\s*(--[a-z0-9-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi,
    (_match, name: string, fallback?: string) => {
      const hit = map.get(name);
      if (hit != null) return resolveVars(hit, map, depth + 1);
      return fallback != null ? resolveVars(fallback.trim(), map, depth + 1) : 'unset';
    },
  );
}

/** 暗色作用域在这份量法里用不上(产品当前强制亮色),整块摘掉免得两支互相盖。 */
const lightScopeOnly = (moduleCss: string) =>
  decomment(moduleCss).replace(/:global\(\[data-theme='dark'\]\)[\s\S]*?\n\}/g, '');

/**
 * 面板里的一段真实 DOM。类名全部取自产品:`.pane` + `data-chat-root` 是
 * `ChatPane` 的接缝(`chatSeam('pane')`),`.chat-log` / `.msg` / `.role` /
 * `.user-text` 来自 `styles/chat.css`,`.line` 来自 `PauseLine.module.css`。
 * CSS Module 在 vitest 里会加哈希,所以这里和本仓其它层叠测试一样手写裸类名。
 */
const MARKUP = `
  <div class="pane vars" data-chat-root="" id="seam">
    <div class="chat-log" id="log">
      <div class="msg assistant" id="msg">
        <div class="role" id="role">Open Design</div>
        <p id="prose">已经把商品卡换成两列。</p>
        <button type="button" id="bare-button">重试</button>
        <div class="line" id="pause-line"><span>已停止</span></div>
      </div>
      <div class="msg user">
        <div class="msg-stack"><div class="user-text" id="user-bubble">再加一页订单列表</div></div>
      </div>
    </div>
  </div>`;

/** 按产品里的真实顺序铺样式表:全局在前,组件 Module 在后。 */
function mount(chatRootCss: string): void {
  const globalCss = readExpandedIndexCss();
  const seamCss = lightScopeOnly(chatRootCss);
  const map = tokenMap(`${globalCss}\n${seamCss}`);
  document.head.innerHTML = '';
  for (const css of [globalCss, seamCss, PAUSE_LINE_CSS]) {
    const style = document.createElement('style');
    style.textContent = resolveVars(typographyOnly(css), map);
    document.head.appendChild(style);
  }
  document.body.innerHTML = MARKUP;
}

type Typography = { fontSize: string; fontWeight: string; lineHeight: string; lineHeightPx: number };

function read(id: string): Typography {
  const el = document.getElementById(id);
  if (!el) throw new Error(`markup 里没有 #${id}`);
  const cs = getComputedStyle(el);
  return {
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    // jsdom 不做 used-value 折算,自己算:无单位行高 = 倍数 × 自己的字号
    lineHeightPx: Number.parseFloat(cs.lineHeight) * Number.parseFloat(cs.fontSize),
  };
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('先证明这把尺子看得见缺陷', () => {
  /**
   * 把接缝上那三条排版声明整体抽掉,读数必须掉回全站 `body` 的 400 / 14px / 125%。
   * 抽掉之后仍然是 500 / 13px,说明量到的不是这三条,那这份测试就是假绿。
   */
  it('抽掉接缝上的排版声明,读数掉回全站 body 的 14px / 400 / 125%', () => {
    const withoutBaseline = CHAT_ROOT_CSS.split('\n')
      .filter((line) => !/^\s*(font-weight|font-size|line-height)\s*:/.test(line))
      .join('\n');
    expect(withoutBaseline, '接缝里根本没有整行的排版声明?那这把尺子对错了地方').not.toBe(
      CHAT_ROOT_CSS,
    );

    mount(withoutBaseline);
    const seam = read('seam');
    expect(seam.fontSize).toBe('14px');
    expect(seam.fontWeight).toBe('normal');
    expect(seam.lineHeight).toBe('125%');
  });

  it('注入的样式表真的进了 jsdom(不是空表在冒充绿)', () => {
    mount(CHAT_ROOT_CSS);
    const counts = Array.from(document.styleSheets).map(
      (sheet) => (sheet as CSSStyleSheet).cssRules?.length ?? -1,
    );
    expect(counts.length).toBe(3);
    // 全局那张表是整个 index.css 展开后的结果,几千条起步
    expect(counts[0]!).toBeGreaterThan(1_000);
    for (const n of counts) expect(n).toBeGreaterThan(0);
  });
});

describe('chat 根的排版基线', () => {
  it('字重 500 / 字号 13px / 行高 1.5(19.5px)', () => {
    mount(CHAT_ROOT_CSS);
    const seam = read('seam');
    expect(seam.fontWeight).toBe('500');
    expect(seam.fontSize).toBe('13px');
    expect(seam.lineHeight).toBe('1.5');
    expect(seam.lineHeightPx).toBeCloseTo(19.5, 5);
  });

  it('字号走 token,不写裸值', () => {
    const seamBlock = decomment(CHAT_ROOT_CSS).match(/\.vars,\s*\n\s*\.root\s*\{([\s\S]*?)\n\}/);
    expect(seamBlock, '接缝的 .vars, .root 那条规则找不到了').not.toBeNull();
    expect(seamBlock![1]).toMatch(/font-size:\s*var\(--chat-t-body\)/);
    expect(seamBlock![1]).toMatch(/line-height:\s*var\(--chat-lh-row\)/);
  });

  it('亮暗两个作用域都写了同一条基线', () => {
    const scopes = decomment(CHAT_ROOT_CSS).match(/font-weight:\s*500/g) ?? [];
    expect(
      scopes.length,
      '接缝的约定是每个变量/声明在亮暗两个作用域都要有(见文件头注释)',
    ).toBe(2);
  });
});

describe('等宽字体的 @font-face 描述符跟基线走', () => {
  const monoFace = () => {
    const face = decomment(BASE_CSS).match(/@font-face\s*\{[^}]*JiduMono Pro[^}]*\}/);
    expect(face, 'base.css 里找不到 JiduMono Pro 的 @font-face').not.toBeNull();
    return face![0];
  };

  it('描述符写的是 500,和稿子一致', () => {
    expect(monoFace()).toMatch(/font-weight:\s*500\s*;/);
  });

  it('和 chat 根的基线字重是同一个数', () => {
    const baseline = decomment(CHAT_ROOT_CSS).match(/font-weight:\s*(\d+)\s*;/);
    expect(baseline, '接缝上没有基线字重').not.toBeNull();
    const descriptor = monoFace().match(/font-weight:\s*(\d+)\s*;/);
    expect(descriptor).not.toBeNull();
    expect(
      descriptor![1],
      'mono 只有一个静态字重文件。描述符和基线对不上,就会出现「请求 500、' +
        '可用面只有 400」——各浏览器的折算行为不一致(有的取面,有的合成加粗)',
    ).toBe(baseline![1]);
  });
});

describe('反向守卫:全站 body 没被顺手推过去', () => {
  /**
   * 基线只归聊天面板。哪天有人图省事把这三条搬进 `base.css` 的 `body`,
   * 侧栏 / 设置页 / 首页 / 工作区会跟着一起变 —— 那些面从来没按 13/500 设计过。
   */
  const bodyRule = () => {
    const rule = decomment(BASE_CSS).match(/(^|\n)body\s*\{([^}]*)\}/);
    expect(rule, 'base.css 里找不到 body 规则').not.toBeNull();
    return rule![2]!;
  };

  it('全站 body 仍然是 14px', () => {
    expect(bodyRule()).toMatch(/font-size:\s*var\(--font-size-14,\s*14px\)/);
  });

  it('全站 body 仍然不声明 font-weight(继承 400)', () => {
    expect(
      /font-weight\s*:/.test(bodyRule()),
      '全站 body 出现了 font-weight —— 基线被推到聊天面板之外了',
    ).toBe(false);
  });

  it('全站 body 仍然是 125% 行高', () => {
    expect(bodyRule()).toMatch(/line-height:\s*125%/);
  });

  it('jsdom 里量出来的 body 也还是 14px / 400 / 125%', () => {
    mount(CHAT_ROOT_CSS);
    const cs = getComputedStyle(document.body);
    expect(cs.fontSize).toBe('14px');
    expect(cs.fontWeight).toBe('normal');
    expect(cs.lineHeight).toBe('125%');
  });
});

describe('新基线下,面板里各层的最终计算值', () => {
  /**
   * 三个不同层级,钉的是**具体数**,不是「等于基线」——
   * 「等于基线」那种写法在基线被改坏时会跟着一起变,守不住任何东西。
   */
  it('层一 · 助手正文(纯继承,一条声明都没有):13px / 500 / 19.5px', () => {
    mount(CHAT_ROOT_CSS);
    const prose = read('prose');
    expect(prose.fontSize).toBe('13px');
    expect(prose.fontWeight).toBe('500');
    expect(prose.lineHeightPx).toBeCloseTo(19.5, 5);
  });

  it('层二 · 用户气泡(自己钉死三条):13px / 500 / 22.1px', () => {
    mount(CHAT_ROOT_CSS);
    const bubble = read('user-bubble');
    expect(bubble.fontSize).toBe('13px');
    expect(bubble.fontWeight).toBe('500');
    expect(bubble.lineHeight).toBe('1.7');
    expect(bubble.lineHeightPx).toBeCloseTo(22.1, 1);
  });

  it('层三 · PauseLine(CSS Module,只钉字号、字重靠继承):12px / 500 / 18px', () => {
    mount(CHAT_ROOT_CSS);
    const pause = read('pause-line');
    expect(pause.fontSize).toBe('12px');
    expect(pause.fontWeight).toBe('500');
    expect(pause.lineHeightPx).toBeCloseTo(18, 5);
  });

  /**
   * 层四 · 面板里的裸按钮。它没有自己的字重,靠 `:where([data-chat-root]) button`
   * 那条复位说了算 —— 稿子的全局 button 复位**一条字重都不设**
   * (`button { font-family: inherit; border: none; background: none;
   * cursor: pointer; color: inherit; font-size: var(--font-size-13) }`)。
   *
   * ⚠️ 这里原来推成「不设 → 继承 body 的 500」,**推错了**(W77 已纠正)。
   * 「不设」不等于「跟着基线走」:UA 样式表给 `<button>` 用的是 **`font` 简写**
   * (Chrome `font: 400 13.3333px Arial`),简写会把 `font-weight` 一并压成 400,
   * 按钮的字重**默认不继承**。稿子既没写 `font-weight` 也没写 `font`,
   * 裸按钮的**真实渲染值就是 400**。
   * 实测(2026-09-02,真实 Chrome + 交付页 md5 `495992a904b6674dd07db4e0cb8d6f19`):
   * 往稿子的 `.bub`(自身 500)里同时插一颗无类名 button 和一个 span,
   * 同一次读回 **button 400 / span 500**。原委与量法见
   * `tests/components/chat/w77-bare-button-weight.test.ts`。
   *
   * 写死一个数(而不是「等于 prose」)是本组的规矩:
   * 「等于基线」那种写法在基线被改坏时会跟着一起变 —— 这次尤其要写死,
   * 因为正确答案恰恰**不等于**基线。
   */
  it('层四 · 面板里的裸按钮(字重吃 UA 的 font 简写):13px / 400 / Albert Sans', () => {
    mount(CHAT_ROOT_CSS);
    const bare = read('bare-button');
    // 稿子 `361b78253e:docs/design/chat-panel/src/components.css`
    //   :170  button { font-family: inherit; border: none; background: none;
    //                  cursor: pointer; color: inherit; font-size: var(--font-size-13) }
    //   :151  body   { font-family: var(--sans); font-weight: 500;
    //                  font-size: var(--font-size-13); line-height: 1.5 }
    // 全局 button 复位一条字重都不设 → 停在 UA `font` 简写的 400(**不是** body 的 500);
    // 字号 13px;字族 `inherit` → body 的 `var(--sans)`。三样各钉一条具体值。
    expect(bare.fontSize).toBe('13px');
    expect(
      bare.fontWeight,
      '面板里的裸按钮没对上稿子的真实渲染值 —— `styles/chat.css` 的 ' +
        '`:where([data-chat-root]) button` 该写死 400(稿子吃 UA 的 `font` 简写),' +
        '写 `inherit` 会让它跟着面板基线变成 500',
    ).toBe('400');
    expect(
      getComputedStyle(document.getElementById('bare-button')!).fontFamily,
      '字族也要跟着继承 —— 稿子的 button 复位写的是 font-family: inherit',
    ).toBe(DESIGN_SANS);
  });

  /**
   * 层级还得站得住:发言人名(`.role` 600)必须仍然重于正文,
   * 否则基线一抬就把「标题 / 正文」两档压成一档。
   */
  it('发言人名仍然比正文重一档', () => {
    mount(CHAT_ROOT_CSS);
    expect(Number(read('role').fontWeight)).toBeGreaterThan(Number(read('prose').fontWeight));
  });
});
