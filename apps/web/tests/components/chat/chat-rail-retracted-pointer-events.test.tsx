// @vitest-environment jsdom
/**
 * 红测:**退避态的消息导轨不许继续吃指针输入。**
 *
 * ── 症状 ────────────────────────────────────────────────────────────────
 * 点一根短横跳转之后,`ChatMessageRail` 进入退避态。退避态原本**只改
 * `opacity`**(`chat.css`),于是那条 20px 宽、整个 log viewport 高的覆盖层
 * 看不见却照样命中 —— 悬停、点击统统落在它身上,底下的流水一概碰不到。
 * 隐形的东西不该继续吃输入。
 *
 * ── 为什么自己算层叠,而不用 `getComputedStyle` ──────────────────────────
 * jsdom 的 `getComputedStyle` **不实现优先级**,只按源码顺序后来居上;而且它
 * 根本不加载 `@import` 进来的这些表。拿它当判据的话,修好了也照样红。所以这里
 * 只借 jsdom 做**选择器匹配**(nwsapi 是可靠的),层叠按 CSS 规则自己算:
 * 优先级 → 源码顺序。做法沿用同目录的 `w95-plan-pill-bottom-reserve.test.tsx`。
 *
 * ── 这一层的判据为什么必须落到「轨道」上 ────────────────────────────────
 * `pointer-events` 可继承,但**后代把自己重新打开是合法的**。
 * `.chat-message-rail__track` 自己写了 `pointer-events: auto` —— 只在 nav 上
 * 关掉不够,轨道那一格(短横所在的那一格,也就是用户真会把指针放上去的地方)
 * 还会照吃。所以正向断言有两条:nav 一条,轨道一条。
 *
 * ── 能证明什么 / 不能证明什么 ───────────────────────────────────────────
 * 能:退避态下 nav 与轨道的 `pointer-events` 计算值是 `none`,短横自己没有
 * 反向打开;非退避态下两者仍是 `auto`(别把导轨整个弄死)。
 * 不能:浏览器在 `pointer-events: none` 之后把悬停/点击交给了底下的谁,
 * 以及退避解除的真实时序 —— 命中测试只有真机能确认。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

/** `index.css` 的 @import 顺序就是层叠顺序,别在测试里另排一套。 */
function stylesheetsInCascadeOrder(): { file: string; css: string }[] {
  const index = readFileSync(resolve(SRC, 'index.css'), 'utf-8');
  const files = [...index.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1]!);
  const out: { file: string; css: string }[] = [];
  for (const rel of files) {
    if (!rel.startsWith('./styles/')) continue;
    const abs = resolve(SRC, rel.replace(/^\.\//, ''));
    try {
      out.push({ file: rel, css: readFileSync(abs, 'utf-8') });
    } catch {
      /* 生成物或缺席的表跳过 */
    }
  }
  return out;
}

/** 顶层逗号切选择器列表(`:is(a, b)` 里的逗号不能切)。 */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** (a, b, c) = id / class·attr·pseudo-class / type·pseudo-element */
function specificity(sel: string): [number, number, number] {
  const cleaned = sel.replace(/\s*[>+~]\s*/g, ' ');
  const ids = (cleaned.match(/#[\w-]+/g) ?? []).length;
  const classes = (cleaned.match(/\.[\w-]+/g) ?? []).length
    + (cleaned.match(/\[[^\]]+\]/g) ?? []).length
    + (cleaned.match(/:(?!:)[\w-]+/g) ?? []).length;
  const types = (cleaned.match(/(^|\s)[a-zA-Z][\w-]*/g) ?? []).length
    + (cleaned.match(/::[\w-]+/g) ?? []).length;
  return [ids, classes, types];
}

function specLess(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

/** 一条规则体最终把 `pointer-events` 定成什么;`null` = 这条规则没碰它。 */
function pointerEventsOf(body: string): string | null {
  let value: string | null = null;
  for (const m of body.matchAll(/(^|;)\s*pointer-events\s*:\s*([^;]+)/g)) {
    value = m[2]!.trim();
  }
  return value;
}

/**
 * 按真实层叠算出这个元素**自己**声明到的 `pointer-events`。
 * `null` 表示没有任何规则碰它 —— 那它就继承父元素(初值 `auto` 也是继承来的)。
 */
function declaredPointerEvents(el: Element): string | null {
  type Hit = { spec: [number, number, number]; order: number; value: string };
  const hits: Hit[] = [];
  let order = 0;
  for (const { css } of stylesheetsInCascadeOrder()) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectorList = m[1]!.trim();
      const body = m[2]!;
      order += 1;
      if (selectorList.startsWith('@') || selectorList.includes('@')) continue;
      const value = pointerEventsOf(body);
      if (value == null) continue;
      for (const sel of splitTopLevel(selectorList)) {
        let matches = false;
        try {
          matches = el.matches(sel);
        } catch {
          continue;
        }
        if (matches) hits.push({ spec: specificity(sel), order, value });
      }
    }
  }
  if (hits.length === 0) return null;
  let winner = hits[0]!;
  for (const hit of hits.slice(1)) {
    if (specLess(winner.spec, hit.spec)) winner = hit;
    else if (!specLess(hit.spec, winner.spec) && hit.order >= winner.order) winner = hit;
  }
  return winner.value;
}

/** `pointer-events` 是可继承属性:没有自己的声明就往上问。 */
function effectivePointerEvents(el: Element): string {
  let node: Element | null = el;
  while (node != null) {
    const declared = declaredPointerEvents(node);
    if (declared != null) return declared;
    node = node.parentElement;
  }
  return 'auto'; // 初值
}

/** 真实 DOM 形状:viewport → nav → track → marker → span。 */
function mountRail(opts: { retracted: boolean }) {
  const root = document.createElement('div');
  root.className = 'app';
  const viewport = document.createElement('div');
  viewport.className = 'chat-log-viewport';
  const nav = document.createElement('nav');
  nav.className = `chat-message-rail${opts.retracted ? ' is-retracted' : ''}`;
  const track = document.createElement('div');
  track.className = 'chat-message-rail__track';
  const marker = document.createElement('button');
  marker.className = 'chat-message-rail__marker';
  const dash = document.createElement('span');
  marker.append(dash);
  track.append(marker);
  nav.append(track);
  const log = document.createElement('div');
  log.className = 'chat-log';
  viewport.append(nav, log);
  root.append(viewport);
  document.body.append(root);
  return { nav, track, marker, dash, log };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('导轨退避态 · pointer-events', () => {
  /**
   * 防真空:量法必须**先能看见**轨道那条 `pointer-events: auto`。
   * 这条不成立就说明解析器压根没读到 chat.css,后面的红绿都不作数。
   */
  it('量法能看见 chat.css:非退避态下轨道读出它自己写的 `auto`', () => {
    const { track } = mountRail({ retracted: false });
    expect(declaredPointerEvents(track)).toBe('auto');
  });

  /** 反向:别把导轨整个弄死 —— 平时它得照常吃悬停和点击。 */
  it('非退避态下 nav 与轨道都仍然吃输入', () => {
    const { nav, track, marker } = mountRail({ retracted: false });
    expect(effectivePointerEvents(nav)).toBe('auto');
    expect(effectivePointerEvents(track)).toBe('auto');
    expect(effectivePointerEvents(marker)).toBe('auto');
  });

  /** ★ 正向 1:退避态的 nav 不吃输入。 */
  it('退避态下 nav 的 pointer-events 是 none', () => {
    const { nav } = mountRail({ retracted: true });
    expect(effectivePointerEvents(nav)).toBe('none');
  });

  /**
   * ★ 正向 2:轨道也得关。
   * `pointer-events` 虽可继承,但后代把自己重新打开是合法的 ——
   * `.chat-message-rail__track { pointer-events: auto }` 就是这么一条。
   * 只关 nav 的话,短横那一格照吃,而那正是用户会把指针放上去的地方。
   */
  it('退避态下轨道也不吃输入 —— 它自己写了 auto,只关 nav 拦不住', () => {
    const { track } = mountRail({ retracted: true });
    expect(effectivePointerEvents(track)).toBe('none');
  });

  /** ★ 正向 3:短横与短横里的横条没有自己的声明,跟着轨道一起关。 */
  it('退避态下短横与横条跟着一起不吃输入', () => {
    const { marker, dash } = mountRail({ retracted: true });
    expect(declaredPointerEvents(marker), '短横不该自己再打开一次').toBe(null);
    expect(effectivePointerEvents(marker)).toBe('none');
    expect(effectivePointerEvents(dash)).toBe('none');
  });

  /** 退避是导轨自己的事,别顺手把底下的流水也关了。 */
  it('退避态不影响聊天记录本身', () => {
    const { log } = mountRail({ retracted: true });
    expect(effectivePointerEvents(log)).toBe('auto');
  });
});
