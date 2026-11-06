// @vitest-environment jsdom
/**
 * 滚到最底时,「第 N / M 步」药丸不能压住流水的最后一行。
 *
 * ── 症状 ────────────────────────────────────────────────────────────────
 * 用户实机报的:拉到最底,最后一行正文从浮动药丸底下穿过去。
 *
 * ── 为什么这条测试不去嗅类名 ─────────────────────────────────────────────
 * `.chat-log.has-plan-pill-reserve { padding-bottom: 52px }` 这条**早就写好了**,
 * 类名也确实挂上了(`chat-scroll-following.test.tsx` 断言的就是这个类名,一直是绿的)。
 * 坏的是**层叠**:`routines.css` 里的
 *
 *     .app .chat-log, .chat-skin .chat-log { padding: 18px 18px 20px }
 *
 * 和预留那条**同为 (0,2,0)**,而 `index.css` 里 routines.css 排在 chat.css **后面**,
 * 于是同优先级里它后来居上,`padding` 简写把 `padding-bottom` 整个覆盖掉。
 * 真机 CDP 实测(2026-09-03,开着 run、药丸在场、`has-plan-pill-reserve` 在元素上):
 *
 *     getComputedStyle(.chat-log).paddingBottom      = "20px"   ← 预留没生效
 *     getComputedStyle(.chat-log).scrollPaddingBottom = "52px"  ← 同一条规则里的另一半却生效了
 *
 * 两个声明写在同一条规则里,一个被简写打掉、一个活下来(`padding` 简写不重置
 * `scroll-padding`)—— 正是这半死不活的样子让它看着像已经修好了。
 *
 * ── 为什么自己算层叠,而不用 `getComputedStyle` ──────────────────────────
 * jsdom 的 `getComputedStyle` **不实现优先级**,只按源码顺序后来居上。实测:
 * 把预留那条写成 `(0,3,0)`(本该赢),jsdom 仍旧读出 20px。拿它当判据的话,
 * 修好了也照样红,而「把 routines.css 挪到前面」这种错解法反而会绿 —— 判据本身是坏的。
 * 所以这里只借 jsdom 做**选择器匹配**(nwsapi 是可靠的),层叠按 CSS 规则自己算:
 * 优先级 → 源码顺序。算出来的数拿真机读数对过(见上面的 20px)。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

/**
 * 药丸要多少让位 —— 这两个数都从真实 CSS 里读回来核对,不写死在注释里。
 *
 *   `.chat-bottom-float-slot { bottom: 12px }`  药丸底边离 viewport 底边
 *   药丸自身高度 32px = 内距 5+5 + 描边 1+1 + 球 20(`--chat-t-mini` 12px × 1.5 = 18 < 20)
 *
 * 真机量到的就是这两个数(pill.height = 32,gapToViewportBottom = 12)。
 */
const PILL_BOTTOM_OFFSET_PX = 12;
const PILL_HEIGHT_PX = 32;
const REQUIRED_CLEARANCE_PX = PILL_BOTTOM_OFFSET_PX + PILL_HEIGHT_PX; // 44

/** `index.css` 的 @import 顺序就是层叠顺序,别在测试里另排一套。 */
function stylesheetsInCascadeOrder(): { file: string; css: string }[] {
  const index = readFileSync(resolve(SRC, 'index.css'), 'utf-8');
  const files = [...index.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1]!);
  const out: { file: string; css: string }[] = [];
  for (const rel of files) {
    if (!rel.startsWith('./styles/')) continue; // 只看 app 自己的样式表
    const abs = resolve(SRC, rel.replace(/^\.\//, ''));
    try {
      out.push({ file: rel, css: readFileSync(abs, 'utf-8') });
    } catch {
      /* 生成物或缺席的表跳过 */
    }
  }
  return out;
}

/** 顶层逗号切选择器列表(`:is(a, b)` / `min(1px, 2%)` 里的逗号不能切)。 */
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

/**
 * 一条规则体最终把 `padding-bottom` 定成什么(简写 / 长写都算,体内后写的赢)。
 * 返回 `null` = 这条规则根本没碰底边内距。
 */
function paddingBottomOf(body: string): string | null {
  let value: string | null = null;
  for (const m of body.matchAll(/(^|;)\s*(padding(?:-bottom)?)\s*:\s*([^;]+)/g)) {
    const prop = m[2]!;
    const raw = m[3]!.trim();
    if (prop === 'padding-bottom') {
      value = raw;
      continue;
    }
    const parts = raw.split(/\s+/);
    // padding: T | T H | T H B | T R B L
    value = parts.length === 1 ? parts[0]! : parts.length === 2 ? parts[0]!
      : parts[2]!;
  }
  return value;
}

/**
 * 按真实层叠算出这个元素的 `padding-bottom`。
 * 匹配交给 jsdom(可靠),优先级 + 源码顺序自己算(jsdom 不做这一层)。
 */
function effectivePaddingBottom(el: Element): string | null {
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
      const value = paddingBottomOf(body);
      if (value == null) continue;
      for (const sel of splitTopLevel(selectorList)) {
        let matches = false;
        try {
          matches = el.matches(sel);
        } catch {
          continue; // 选择器 jsdom 认不了(自定义伪类等),跳过
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

/** 真实 DOM 祖先链:`.app` 皮肤 → viewport → 流水。 */
function mountChatLog(opts: { reserve: boolean; skin: 'app' | 'chat-skin' | 'none' }): HTMLElement {
  const root = document.createElement('div');
  if (opts.skin !== 'none') root.className = opts.skin;
  const viewport = document.createElement('div');
  viewport.className = 'chat-log-viewport';
  const log = document.createElement('div');
  log.className = `chat-log is-scrollable${opts.reserve ? ' has-plan-pill-reserve' : ''}`;
  viewport.append(log);
  root.append(viewport);
  document.body.append(root);
  return log;
}

function px(value: string | null): number {
  if (value == null) return Number.NaN;
  return Number.parseFloat(value);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('W95 · 药丸不压最后一行', () => {
  /**
   * 防真空 A:量法必须**先能看见** routines.css 那条皮肤规则。
   * 这条要是不成立,说明解析器压根没读到那张表,后面的红绿都不作数。
   */
  it('量法能看见皮肤表:没有预留类时底边内距是 routines.css 的 20px', () => {
    expect(effectivePaddingBottom(mountChatLog({ reserve: false, skin: 'app' }))).toBe('20px');
    expect(effectivePaddingBottom(mountChatLog({ reserve: false, skin: 'chat-skin' }))).toBe('20px');
  });

  /**
   * 防真空 B:量法也必须能看见 chat.css 那条预留规则本身 ——
   * 不挂皮肤时它是唯一的竞争者,必须读出 52px。
   * 只有 A、B 同时成立,「挂了皮肤就变 20px」才能被解读成**层叠反转**,
   * 而不是「解析器没读到某张表」。
   */
  it('量法能看见预留规则:不挂皮肤时读出 chat.css 的 52px', () => {
    expect(effectivePaddingBottom(mountChatLog({ reserve: true, skin: 'none' }))).toBe('52px');
  });

  /** 药丸让位需要多少,由真实 CSS 里的两个数决定,不许在这儿写死后就没人管。 */
  it('让位所需的 44px 与真实 CSS 对得上(药丸底边偏移 + 药丸高度)', () => {
    const composio = readFileSync(resolve(SRC, 'styles/viewer/composio.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const slot = /\.chat-bottom-float-slot\s*\{([^}]*)\}/.exec(composio);
    expect(slot, '.chat-bottom-float-slot 规则不见了').toBeTruthy();
    expect(/bottom:\s*12px/.test(slot![1]!), '药丸底边偏移不再是 12px,44 这个数要重算').toBe(true);

    const pillCss = readFileSync(resolve(SRC, 'components/chat/PlanPill.module.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const pill = /\.wrap\s+\.pill\s*\{([^}]*)\}/.exec(pillCss);
    expect(pill, '.wrap .pill 规则不见了').toBeTruthy();
    expect(/padding:\s*5px 12px/.test(pill![1]!), '药丸内距变了,32px 高度要重算').toBe(true);

    expect(REQUIRED_CLEARANCE_PX).toBe(44);
  });

  /**
   * ★ 正向:这一轮有计划时,流水底部必须给药丸让出 ≥44px。
   *
   * 44 = 药丸底边离 viewport 12px + 药丸自身 32px。让位不足这个数,
   * 滚到最底时最后一行就会落进药丸的矩形里 —— 真机量到重叠 13.88px。
   */
  it('有计划时,`.app` 皮肤下的流水底部让位 ≥ 药丸所需的 44px', () => {
    const value = effectivePaddingBottom(mountChatLog({ reserve: true, skin: 'app' }));
    expect(px(value)).toBeGreaterThanOrEqual(REQUIRED_CLEARANCE_PX);
  });

  it('有计划时,`.chat-skin` 皮肤下同样让位 ≥ 44px', () => {
    const value = effectivePaddingBottom(mountChatLog({ reserve: true, skin: 'chat-skin' }));
    expect(px(value)).toBeGreaterThanOrEqual(REQUIRED_CLEARANCE_PX);
  });

  /**
   * ★ 反向 5:**没有药丸**的会话,底部不许平白多出一块空白。
   * 预留只跟着 `has-plan-pill-reserve` 走;没有它就还是皮肤原本的 20px。
   */
  it('没有计划时底部不多留空白 —— 仍是皮肤原本的 20px', () => {
    expect(effectivePaddingBottom(mountChatLog({ reserve: false, skin: 'app' }))).toBe('20px');
    expect(effectivePaddingBottom(mountChatLog({ reserve: false, skin: 'chat-skin' }))).toBe('20px');
  });
});
