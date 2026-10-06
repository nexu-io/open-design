// @vitest-environment jsdom
/**
 * 用户传上来的附件,缩略图底下要摆产品标,不是一块纯灰。
 *
 * ## 稿子怎么写的
 *
 * `361b78253e:docs/design/chat-panel/src/components.css:796`
 * (`8015870095` / `853da24ea5` / `361b78253e` 三版这一块 md5 相同):
 *
 *   .att-i .mini {
 *     background:
 *       url("data:image/svg+xml;base64,…") center / cover no-repeat,
 *       var(--bg-muted);
 *   }
 *
 * 原注释交代了三件事:图源是 `src/att-placeholder.svg` 内联成 data URI
 * (稿子是单文件,不能外链);`cover` 不是 `contain`(卡 1:1、图 1:1,不留边);
 * `--bg-muted` 那一层**留着**,图万一没解出来还是原来那块灰,不会露白。
 * 以及作用域 —— **只挂用户传的附件**(`.att-i`),生图结果 / 缩略图条 /
 * 视觉选项仍然是纯占位灰,那些不是用户传的东西,不该盖产品标。
 *
 * 我们这边的对应关系是逐层的:稿子 `.att-i > .ph > .mini` ↔ 产品
 * `.msg-att-img > .msg-att-ph > .msg-att-mini`,作用域限定在 `.msg.user`
 * 与 `.composer-att` 两处 —— 正好就是「用户传的附件」。
 *
 * ## 尺子
 *
 * 共享量尺(`tests/helpers/chat-mirror-cascade.ts`)在这条上**用不了**:
 * 它按裸 `;` 切声明,而 `data:image/svg+xml;base64,…` 里那个分号是 URL 的一部分,
 * 会把这条声明拦腰截断。已上报,没有自己去改那份共享文件。
 *
 * 换成 jsdom 自己的 CSS 引擎:它认得 `url()` 里的分号,会把 `background` 简写
 * 展开成 `background-image` / `-color` / `-size` / `-repeat` 各条长写,层叠也照跑。
 * jsdom 唯一不做的是解 `var()`,所以注入前先按 `tokens.css` 的 `:root` 把变量
 * 展开成字面量 —— 和 `typography-baseline.test.ts` 同一套办法。
 *
 * 「这把尺子看得见东西」由第一条用例先证:补图之前,底色那一层就已经能量到
 * `--bg-muted` 的实际颜色,说明规则确实够得着这个元素。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

const decomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 按**顶层**分号切声明 —— 括号内和引号内的分号不算。
 * 裸 `split(';')` 会把 `url("data:image/svg+xml;base64,…")` 切成两半,
 * 而残句的下场是这条声明被静默丢掉,于是读成「没人声明背景」。
 */
function splitDecls(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * 只留背景声明。整份表注进 jsdom 会在解析
 * `linear-gradient(… color-mix(…) …)` 时抛异常,连着后面的规则一起丢
 * (`typography-baseline.test.ts` 踩过);背景之外的属性对这一条没有影响,
 * 滤掉是安全的。`color-mix` / 渐变本身也一并滤掉 —— 它们不可能是这条规则,
 * 而且正是那个异常的来源。
 */
function backgroundsOnly(css: string): string {
  let out = decomment(css);
  for (let pass = 0; pass < 2; pass += 1) {
    out = out.replace(/\{([^{}]*)\}/g, (_m, body: string) => {
      const kept = splitDecls(body)
        // 压成一行:声明**跨行**时 jsdom 走的是另一条解析分支,会把整个值
        // 小写化 —— base64 一小写就废了(实测:`PHN2…` 变成 `phn2…`)。
        .map((d) => d.trim().replace(/\s+/g, ' '))
        .filter((d) => {
          const colon = d.indexOf(':');
          if (colon <= 0) return false;
          if (!/^background/i.test(d.slice(0, colon).trim())) return false;
          return !/color-mix\(|gradient\(/i.test(d);
        });
      return `{${kept.join(';')}${kept.length ? ';' : ''}}`;
    });
  }
  return out;
}

/** `tokens.css` 亮色 `:root` 的变量表(产品当前强制亮色)。 */
function lightTokens(): Map<string, string> {
  const out = new Map<string, string>();
  const root = /:root\s*\{([\s\S]*?)\}/.exec(decomment(read('styles/tokens.css')));
  for (const decl of splitDecls(root?.[1] ?? '')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
    if (m) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

function resolveVars(value: string, map: Map<string, string>, depth = 0): string {
  if (depth > 8) return value;
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (whole, name: string, fallback?: string) => {
      const hit = map.get(name);
      if (hit != null) return resolveVars(hit, map, depth + 1);
      return fallback != null ? resolveVars(fallback.trim(), map, depth + 1) : whole;
    },
  );
}

/**
 * 产品里的真实结构。稿子 `.att-i > .ph > .mini` 逐层对上:
 *   · 用户消息里的附件 —— `ChatPane.tsx` 的 `.msg-att-img > .msg-att-ph > img.msg-att-mini`
 *   · 输入框上排队的附件 —— `ChatComposer.tsx`,还没有缩略图时是个空 `<span class="msg-att-mini">`
 *   · 助手侧同名节点 —— **反向对照**:稿子只给用户传的附件盖标,别的仍是纯灰
 */
const MARKUP = `
  <div class="pane" data-chat-root="">
    <div class="msg user">
      <button type="button" class="msg-att-img">
        <span class="msg-att-ph"><img class="msg-att-mini" id="user-mini" alt=""></span>
      </button>
    </div>
    <div class="composer-att">
      <span class="msg-att-img">
        <span class="msg-att-ph"><span class="msg-att-mini" id="composer-mini"></span></span>
      </span>
    </div>
    <div class="msg assistant">
      <span class="msg-att-ph"><span class="msg-att-mini" id="assistant-mini"></span></span>
    </div>
  </div>`;

let sheetRuleCount = 0;
let sheet: CSSStyleSheet;

beforeAll(() => {
  const tokens = lightTokens();
  const style = document.createElement('style');
  style.textContent = resolveVars(backgroundsOnly(read('styles/chat.css')), tokens);
  document.head.appendChild(style);
  document.body.innerHTML = MARKUP;
  sheet = document.styleSheets[0] as CSSStyleSheet;
  sheetRuleCount = sheet.cssRules?.length ?? 0;
});

afterEach(() => {
  // DOM 不重建:这一族只读静态层叠,没有交互
});

const css = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`markup 里没有 #${id}`);
  return getComputedStyle(el);
};

/**
 * 稿子那一层底色的**字面值** —— 验收判据是「算出来的和稿子逐字节相同」,
 * 不是「用了某个 token」。
 *
 * `361b78253e:docs/design/chat-panel/src/tokens.css:41`  --bg-muted: #dbdbdb;
 * (稿子 `tokens.css` 三版 md5 相同,这一支没动过。)
 */
const DESIGN_BG_MUTED = '#dbdbdb';
/** jsdom 把颜色归一成 rgb() 再交出来。 */
const BG_MUTED = (() => {
  const n = Number.parseInt(DESIGN_BG_MUTED.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
})();
/** 我们 `tokens.css` 里的同名 token —— 和稿子分叉时单独红出来。 */
const OUR_BG_MUTED = (/--bg-muted:\s*(#[0-9a-f]{6})/i.exec(read('styles/tokens.css')) ?? [])[1];

/**
 * 元素**最终拿到**的那串 data URI。
 *
 * 一处 jsdom 的怪癖,必须绕开而不是无视:`getComputedStyle` 在这张真表上
 * 会把整个值**小写化**(实测 `PHN2ZyB…` 读回 `phn2zyb…`;规则自己的
 * `cssText` 里大小写是好的)。base64 一小写就废了,直接拿去解码只会得到乱码。
 * 所以这一层只用来判**是不是同一串**(统一小写后比),内容留给下面那条
 * 从样式表原文解出来验 —— 两条合起来才既证了层叠、又证了图对。
 */
function dataUri(id: string): string {
  const hit = /url\(\s*"?(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)"?\s*\)/i.exec(
    css(id).backgroundImage,
  );
  if (!hit) throw new Error(`#${id} 的 background-image 里没有 data URI:${css(id).backgroundImage}`);
  return hit[1]!;
}

/** `chat.css` 原文里那一串(大小写完好)。 */
const SOURCE_URI = (() => {
  const hit = /url\(\s*"(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)"\s*\)/.exec(
    read('styles/chat.css'),
  );
  return hit?.[1] ?? null;
})();

describe('附件占位 · 产品标底图', () => {
  it('先证明这把尺子够得着这个元素(注入的表非空,底色那一层量得到)', () => {
    expect(sheetRuleCount, '注入的样式表是空的 —— 后面全是假绿').toBeGreaterThan(50);
    expect(css('user-mini').backgroundColor).toBe(BG_MUTED);
    expect(css('composer-mini').backgroundColor).toBe(BG_MUTED);
  });

  it('用户消息里的附件缩略图铺着一张底图', () => {
    expect(
      css('user-mini').backgroundImage,
      '稿子 `.att-i .mini` 在 --bg-muted 上面还铺了一层产品标;现在只有那块灰',
    ).toContain('data:image/svg+xml;base64,');
  });

  it('输入框上排队的附件也一样', () => {
    expect(css('composer-mini').backgroundImage).toContain('data:image/svg+xml;base64,');
  });

  it('尺寸和平铺逐条对稿子:cover / no-repeat', () => {
    for (const id of ['user-mini', 'composer-mini']) {
      expect(css(id).backgroundSize.split(',')[0]!.trim()).toBe('cover');
      expect(css(id).backgroundRepeat.split(',')[0]!.trim()).toBe('no-repeat');
    }
  });

  it('位置是 center —— 稿子那三个值里的第一个', () => {
    // jsdom 的 `background` 简写解析**丢掉位置**,`getComputedStyle` 恒读回
    // `0% 0%`(拿 `center` 的裸规则单独探过,同样是 `0% 0%`)。所以位置这一项
    // 改从**解析后的规则对象**读 —— 仍是 CSSOM,不是正则啃原文;
    // 而「这条规则确实落在这个元素上」由上面那条 data URI 相等的用例证过了。
    const rule = Array.from(sheet.cssRules).find(
      (r): r is CSSStyleRule => (r as CSSStyleRule).cssText?.includes('base64,') === true,
    );
    expect(rule, '样式表里找不到那条带底图的规则').toBeTruthy();
    // 两层背景 → 每项都是两段;底图是第一层,底色那层没有自己的位置/尺寸
    expect(rule!.style.backgroundPosition.split(',')[0]!.trim()).toBe('center center');
    expect(rule!.style.backgroundSize.split(',')[0]!.trim()).toBe('cover');
    expect(rule!.style.backgroundRepeat.split(',')[0]!.trim()).toBe('no-repeat');
  });

  it('两处元素拿到的就是 chat.css 里声明的那一串(层叠没被谁截胡)', () => {
    expect(SOURCE_URI, 'chat.css 里根本没有这串 data URI').not.toBeNull();
    const lower = SOURCE_URI!.toLowerCase();
    expect(dataUri('user-mini').toLowerCase()).toBe(lower);
    expect(dataUri('composer-mini').toLowerCase()).toBe(lower);
  });

  it('那张底图就是产品标本身(解出来验,不是看一眼串对不对)', () => {
    expect(SOURCE_URI, 'chat.css 里根本没有这串 data URI').not.toBeNull();
    const svg = Buffer.from(SOURCE_URI!.split(',')[1]!, 'base64').toString('utf-8');
    expect(svg.startsWith('<svg')).toBe(true);
    // 444 见方、#202020 深底 —— 设计给的原件 `src/att-placeholder.svg` 的画布
    expect(svg).toContain('width="444"');
    expect(svg).toContain('height="444"');
    expect(svg).toContain('fill="#202020"');
    // 标本身的两段路径:外圈的「缺口圆」和中间那支箭头
    expect(svg).toContain('M222 71.9941C304.843 71.9941 372 139.151 372 221.994');
    expect(svg).toContain('M212.654 292.409L166.921 172.061');
  });

  it('底下那层灰留着,而且逐字节等于稿子的 #dbdbdb', () => {
    expect(
      OUR_BG_MUTED?.toLowerCase(),
      '我们的 --bg-muted 和稿子对不上了 —— token 漂移,不是这条规则的事',
    ).toBe(DESIGN_BG_MUTED);
    expect(css('user-mini').backgroundColor).toBe(BG_MUTED);
    expect(css('composer-mini').backgroundColor).toBe(BG_MUTED);
  });

  it('只盖用户传的附件:助手侧的同名节点仍然是纯灰', () => {
    expect(
      css('assistant-mini').backgroundImage,
      '稿子把作用域限定在 `.att-i`(用户传的),别的地方不该盖产品标',
    ).toBe('none');
  });
});
