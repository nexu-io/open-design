// @vitest-environment jsdom
/**
 * 聊天流水的祖先链上不能有「圆角 + 裁剪」的盒子。
 *
 * ── 症状 ────────────────────────────────────────────────────────────────
 * 线上 `client_chat_scroll_frozen`(每天 1000–1500 人):滚轮/键盘在 `.chat-log`
 * 上滚不到底、Jump to latest 落底后被甩回,JS 写 `scrollTop` 却能到。
 *
 * ── 真机 CDP 实测(2026-09-17,Chrome 152.0.7977.84,cc/input 类别 tracing)──
 * 每一格落在 `.chat-log` 上的滚轮,合成器都先发 `WidgetInputHandlerManager::
 * FindScrollTargetOnMainThread`,等主线程回 `FindScrollTargetReply` 才开始
 * `ScrollTree::ScrollBy`(13/13 格);同一台机器上一个裸的 overflow div 是 0/6 格。
 * 逐项对照(每项 2–4 轮、每轮 10–14 格):
 *
 *     基线(圆角卡 + 毛玻璃)                          13/13 走主线程
 *     去毛玻璃 / 去 .msg 变换 / 显示滚动条 / 去导轨 / 去尾部占位块 / will-change   13/13
 *     `.app .split-chat-slot > .pane { border-radius: 0 }`                       0/13
 *     `.pane { overflow: visible }`(圆角不再裁剪)                                0/13
 *
 * 也就是说:合成器对**圆角裁剪**里的滚动容器做不了可靠的命中测试,每一格滚轮
 * 都要排队等主线程;流式期间主线程一忙(一次 288px 增高 + 540px 缩短那一帧),
 * 探针就报出 `wheel_stall`(同日在真实 Chrome 里抓到过一次 `reported: 1`)。
 * 这条判据只钉「祖先链上不许同时有圆角和裁剪」,不钉具体数值。
 *
 * ── 为什么自己算层叠 ────────────────────────────────────────────────────
 * 同 `w95-plan-pill-bottom-reserve.test.tsx`:jsdom 的 `getComputedStyle` 不做
 * 优先级,这里只借它做选择器匹配,层叠(优先级 → 源码顺序)自己算。
 * `.pane { overflow: hidden }` 在 shell.css,`border-radius` 在 routines.css 的
 * `.app .split-chat-slot > .pane` —— 两条规则合起来才是那个圆角裁剪,单看任何
 * 一张表都看不出来。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

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

/** 规则体里某个属性最终的值(体内后写的赢);`null` = 没碰。`!important` 单独记。 */
function declared(body: string, props: RegExp): { value: string; important: boolean } | null {
  let hit: { value: string; important: boolean } | null = null;
  for (const m of body.matchAll(/(^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) {
    if (!props.test(m[2]!)) continue;
    const raw = m[3]!.trim();
    hit = { value: raw.replace(/\s*!important\s*$/, '').trim(), important: /!important\s*$/.test(raw) };
  }
  return hit;
}

/** 按真实层叠算出元素上某组属性的赢家值。 */
function effective(el: Element, props: RegExp): string | null {
  type Hit = { spec: [number, number, number]; order: number; value: string; important: boolean };
  const hits: Hit[] = [];
  let order = 0;
  for (const { css } of stylesheetsInCascadeOrder()) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectorList = m[1]!.trim();
      order += 1;
      if (selectorList.includes('@')) continue;
      const d = declared(m[2]!, props);
      if (d == null) continue;
      for (const sel of splitTopLevel(selectorList)) {
        let matches = false;
        try {
          matches = el.matches(sel);
        } catch {
          continue;
        }
        if (matches) hits.push({ spec: specificity(sel), order, ...d });
      }
    }
  }
  if (hits.length === 0) return null;
  let winner = hits[0]!;
  for (const hit of hits.slice(1)) {
    if (hit.important !== winner.important) {
      if (hit.important) winner = hit;
      continue;
    }
    if (specLess(winner.spec, hit.spec)) winner = hit;
    else if (!specLess(hit.spec, winner.spec) && hit.order >= winner.order) winner = hit;
  }
  return winner.value;
}

/** 真实 DOM 祖先链(ProjectView → ChatPane):shell → app → split → slot → pane → wrap → viewport → log。 */
function mountChatLogChain(): Element[] {
  const classes = [
    'workspace-shell workspace-shell--web',
    'workspace-shell__body',
    'app',
    'split',
    'split-chat-slot',
    'pane',
    'chat-log-wrap',
    'chat-log-viewport',
  ];
  let parent: HTMLElement = document.body;
  const chain: Element[] = [];
  for (const cls of classes) {
    const el = document.createElement('div');
    el.className = cls;
    if (cls === 'pane') el.setAttribute('data-chat-root', '');
    parent.append(el);
    chain.push(el);
    parent = el;
  }
  const log = document.createElement('div');
  log.className = 'chat-log is-scrollable';
  log.setAttribute('data-testid', 'chat-log');
  parent.append(log);
  return chain;
}

const CLIPS = /^(hidden|clip|auto|scroll)$/;

function clipsOverflow(el: Element): boolean {
  const shorthand = effective(el, /^overflow$/);
  const y = effective(el, /^overflow-y$/);
  const x = effective(el, /^overflow-x$/);
  const parts = (shorthand ?? '').split(/\s+/);
  const ey = y ?? parts[1] ?? parts[0] ?? 'visible';
  const ex = x ?? parts[0] ?? 'visible';
  return CLIPS.test(ey) || CLIPS.test(ex);
}

function isRounded(el: Element): boolean {
  const r = effective(el, /^border-(top-left-|top-right-|bottom-left-|bottom-right-)?radius$/);
  if (r == null) return false;
  return !/^0(px|%)?(\s+0(px|%)?)*$/.test(r);
}

describe('chat log ancestors: no rounded clip (compositor scroll hit-test)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('no ancestor of .chat-log combines a clipping overflow with a border-radius', () => {
    const chain = mountChatLogChain();
    const offenders = chain
      .filter((el) => clipsOverflow(el) && isRounded(el))
      .map((el) => `.${el.className.split(' ').join('.')}`);
    expect(offenders).toEqual([]);
  });

  it('the chain is what the product renders: the chat card still clips (rectangular)', () => {
    // 反向锚:这条判据不是靠把 overflow 全放开才绿的 —— 卡片仍然裁剪,只是不圆。
    const chain = mountChatLogChain();
    const pane = chain.find((el) => el.classList.contains('pane'))!;
    expect(clipsOverflow(pane)).toBe(true);
  });
});
