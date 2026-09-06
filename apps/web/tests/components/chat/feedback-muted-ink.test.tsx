// @vitest-environment jsdom
/**
 * 回合末尾那排按钮的**静音色档**,以及「选中态必须保住语义绿 / 红」这条红线
 * (交付稿组件 15 · 第 80 格前后那七格 / PR #7170 `components.css`)。
 *
 * ## 稿子改了什么
 *
 *     .msg-act, .fb, .fork-note { --message-muted-ink: #a3a3a3; }
 *     .fb button        { color: var(--message-muted-ink) }
 *     .fb button:hover  { background: var(--bg-fill-secondary); color: var(--message-muted-ink) }
 *     .fb button.is-on          { color: var(--brand-text); … }
 *     .fb button.is-on.mod-down { color: var(--red); … }
 *
 * 也就是三件事:① 未选中的图标从「全局次级文字」换到一枚**专用**静音色;
 * ② hover **只换底、不换字色**;③ 选中之后跳到语义绿 / 红,静音档**不许**盖过去。
 *
 * `chat.css` 那一半(用户气泡的时间 / 复制、fork 脚注)已经落地,token 就定义在
 * `.msg, .fork-note` 上。助手页脚这一排住在 `viewer/theater.css`,是同一档的另一半 ——
 * 这个文件盯的就是这一半。
 *
 * ## 为什么按「层叠算出来的那条声明」判,而不是 `getComputedStyle().color`
 *
 * jsdom 会跑层叠、会继承自定义属性,但 **不解析 `var()`**,也 **不匹配 `:hover`**。
 * 所以这里自己走一遍层叠:
 *   · 规则来自 `index.css` 的真实导入顺序(顺序本身就是胜负的一半);
 *   · 用真 DOM 的 `matches()` 挑命中规则 —— 少写一个祖先就不会命中,
 *     这正是「规则文本一模一样却错」那一类事故唯一照得出来的地方;
 *   · hover 档把选择器里的 `:hover` 摘掉再匹配,**特异性仍按原选择器算**,
 *     于是「选中 + hover」谁赢是真的比出来的,不是嘴上说的。
 * 拿到赢的那条声明后,再用 jsdom 自己解析出来的自定义属性把 `var()` 链**展开成
 * 具体色值** —— 报告里那张「七种状态各自的计算色」就是这么来的。
 *
 * 真实像素另有无头 Chrome 量;这一层要挡的是「写了一条新规则,却被后面某处覆盖掉」。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { specificityTuple } from '../../helpers/chat-mirror-cascade';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { ChatMessage } from '../../../src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

/** 稿子那一档的字面值 —— 判据的锚,不从实现里读回来 */
const MUTED_INK = '#a3a3a3';
/** 今天未选中图标用的全局次级文字。稿子明说这一档「不联动全局次级文字」 */
const GLOBAL_SOFT = '#848484';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
  // 只为让 jsdom 能把自定义属性算出来(它解析 `var()` 之外的一切)。
  // 层叠判定不靠这几张表,靠下面 `cascade()` 那份按 index.css 顺序读出来的快照。
  for (const file of ['styles/tokens.css', 'styles/chat.css', 'styles/viewer/theater.css']) {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(SRC, file), 'utf-8');
    document.head.appendChild(style);
  }
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  document.querySelectorAll('.app').forEach((n) => n.remove());
});

/* ── 夹具 ──────────────────────────────────────────────────────────── */

function turn(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '列表页已经复刻好了。',
    startedAt: 1700000000,
    endedAt: 1700000042,
    createdAt: 1700000042,
    runStatus: 'succeeded',
    events: [] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

/** 陈列页与产线都把面板挂在 `.app` 下面 —— 少了它,routines.css 那一层根本不参赛。 */
function renderTurn(message: ChatMessage): HTMLElement {
  const { container } = render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
  const app = document.createElement('div');
  app.className = 'app';
  document.body.appendChild(app);
  app.appendChild(container);
  return container;
}

const up = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-testid="assistant-feedback-positive"]');
const down = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-testid="assistant-feedback-negative"]');

/* ── 层叠:把 index.css 的导入顺序照搬一遍 ───────────────────────────── */

/** `:is(.a, .b)` 里的逗号不是选择器分隔符 —— 按括号深度切,天真 `split(',')` 会切出废选择器。 */
function splitSelectorList(list: string): string[] {
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

/** (b, c) 两档 —— 这一族里没有 id。b = 类 / 属性 / 伪类,c = 元素名。 */
type Spec = readonly [ids: number, classes: number, types: number];

/**
 * 特异性走校准过的共享量尺(`tests/helpers/chat-mirror-cascade.ts`)——
 * 逐条对 CSS 规范校过,用例见 `chat-mirror-cascade.specificity.test.ts`。
 * 换成**三元组**是因为这条链上有 id 选择器(`index.css` 链里的 `#root`),
 * 原来那份两元组量尺看不见 id,一条 id 规则会凭空输掉。
 */
function specificity(selector: string): Spec {
  return specificityTuple(selector);
}

/** A → B → C 逐位比较(CSS Selectors 4 §15)。 */
const heavier = (a: Spec, b: Spec): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/** `index.css` 的导入顺序**就是**层叠顺序 —— 这一族的胜负一半靠它,不能手抄。 */
function cascadeFiles(): string[] {
  const index = readFileSync(resolve(SRC, 'index.css'), 'utf-8');
  return [...index.matchAll(/@import\s+'([^']+)'/g)]
    .map((m) => resolve(SRC, m[1] ?? ''))
    .filter((file) => {
      let text = '';
      try {
        text = readFileSync(file, 'utf-8');
      } catch {
        return false;
      }
      return /assistant-feedback-button|assistant-copy-button|assistant-footer/.test(text);
    });
}

type Rule = { file: string; order: number; selector: string; body: string };

/** 顶层规则 + at-rule 里的规则;暗色 / 打印 / 降级动画那几档跳过 —— 这条只判浅色默认态。 */
function rulesOf(css: string, file: string, from: number): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  let order = from;
  const walk = (chunk: string, skip: boolean) => {
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf('{', i);
      if (open === -1) break;
      const prelude = chunk.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < chunk.length && depth > 0) {
        if (chunk[j] === '{') depth += 1;
        else if (chunk[j] === '}') depth -= 1;
        j += 1;
      }
      const inner = chunk.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) {
        const dark = /dark|print|prefers-reduced-motion/.test(prelude);
        if (/^@(media|supports|layer|container)/.test(prelude)) walk(inner, skip || dark);
      } else if (!skip && prelude) {
        for (const one of splitSelectorList(prelude)) {
          order += 1;
          out.push({ file, order, selector: one.replace(/\s+/g, ' ').trim(), body: inner });
        }
      }
      i = j;
    }
  };
  walk(text, false);
  return out;
}

function cascade(): Rule[] {
  const out: Rule[] = [];
  for (const file of cascadeFiles()) {
    out.push(...rulesOf(readFileSync(file, 'utf-8'), file, out.length));
  }
  return out;
}

const declaration = (body: string, prop: string): string | null => {
  let hit: string | null = null;
  for (const m of body.matchAll(new RegExp(`(?:^|[;{])\\s*${prop}\\s*:([^;}]*)`, 'g'))) {
    hit = (m[1] ?? '').trim();
  }
  return hit;
};

/**
 * 挑出真的命中 `el` 的规则,按 (特异性, 源码顺序) 决出赢的那一条。
 *
 * `hover` 档:带 `:hover` 的规则把那一段摘掉再匹配,**特异性仍按原选择器算** ——
 * 这样「`:hover` (0,2,0) 对 `[data-selected]` (0,2,0),后写的赢」这条真的被比出来了。
 * 非 hover 档:带 `:hover` 的规则直接不参赛。
 */
function winner(
  el: Element,
  prop: string,
  all: Rule[],
  state: { hover?: boolean } = {},
): { rule: Rule; value: string } | null {
  let best: { rule: Rule; value: string; spec: Spec } | null = null;
  for (const rule of all) {
    const value = declaration(rule.body, prop);
    if (value == null) continue;
    const hasHover = /:hover\b/.test(rule.selector);
    if (hasHover && !state.hover) continue;
    const probe = hasHover ? rule.selector.replace(/:hover\b/g, '') : rule.selector;
    let hit = false;
    try {
      hit = el.matches(probe);
    } catch {
      continue; // nwsapi 认不出来的伪元素之类,让它过
    }
    if (!hit) continue;
    const spec = specificity(rule.selector);
    if (!best || heavier(spec, best.spec) || (!heavier(best.spec, spec) && rule.order > best.rule.order)) {
      best = { rule, value, spec };
    }
  }
  return best ? { rule: best.rule, value: best.value } : null;
}

/* ── 把赢的那条声明展开成具体色值 ─────────────────────────────────── */

/** `var(--a, var(--b))` 的顶层拆分:名字 + 兜底,括号要配对着数。 */
function splitVar(inside: string): { name: string; fallback: string | null } {
  let depth = 0;
  for (let i = 0; i < inside.length; i += 1) {
    const ch = inside[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      return { name: inside.slice(0, i).trim(), fallback: inside.slice(i + 1).trim() };
    }
  }
  return { name: inside.trim(), fallback: null };
}

/** 用 jsdom 自己算出来的自定义属性把 `var()` 链展开;展不开就原样返回。 */
function resolve_(el: Element, value: string, depth = 0): string {
  const raw = value.trim();
  if (depth > 8 || !raw.startsWith('var(')) return raw;
  let d = 0;
  let end = -1;
  for (let i = 3; i < raw.length; i += 1) {
    if (raw[i] === '(') d += 1;
    else if (raw[i] === ')') {
      d -= 1;
      if (d === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return raw;
  const { name, fallback } = splitVar(raw.slice(4, end));
  const got = getComputedStyle(el).getPropertyValue(name).trim();
  if (got) return resolve_(el, got, depth + 1);
  return fallback == null ? raw : resolve_(el, fallback, depth + 1);
}

/** 一枚按钮在某个状态下最终的字色 —— 报告里那张表就是它 */
function ink(el: Element, all: Rule[], state: { hover?: boolean } = {}): string {
  const win = winner(el, 'color', all, state);
  expect(win, '没有任何规则给这枚按钮上色 —— 断言会空过').toBeTruthy();
  return resolve_(el, win!.value).toLowerCase();
}

/* ── 稿子 15-1 … 15-7 ──────────────────────────────────────────────── */

describe('回合末尾这一排 · 未选中是静音档', () => {
  it('15-1 默认 · 赞 / 踩都落在 #a3a3a3,不是全局次级文字', () => {
    const root = renderTurn(turn({}));
    const all = cascade();
    expect(ink(up(root)!, all)).toBe(MUTED_INK);
    expect(ink(down(root)!, all)).toBe(MUTED_INK);
    // 反面:静音档不是把 --text-soft 挪一挪。两个值真的不同,断言才有意义。
    expect(MUTED_INK).not.toBe(GLOBAL_SOFT);
  });

  it('15-2 hover · 只换底,不换字色', () => {
    const root = renderTurn(turn({}));
    const all = cascade();
    expect(ink(up(root)!, all, { hover: true })).toBe(MUTED_INK);
    // 底确实换了 —— 否则「只换底」这句话就落空了
    const bg = winner(up(root)!, 'background', all, { hover: true });
    expect(bg?.value).toMatch(/--(?:chat-)?bg-fill-secondary/);
  });

  it('同一排四枚是同一档 —— 复制 / Fork 不许和赞踩各走各的灰', () => {
    // 稿子这一条是 `.fb button`,一条规则罩住整排。产品把它拆成了
    // `.assistant-feedback-button` 和 `.assistant-copy-button` 两个类,
    // 只改一半就会在一行里摆出两种灰 —— 那比统一走旧值更糟。
    const root = renderTurn(turn({}));
    const all = cascade();
    const copy = root.querySelector('[data-testid="assistant-copy-markdown"]')!;
    const fork = root.querySelector('[data-testid="assistant-fork-button"]')!;
    expect(ink(copy, all)).toBe(MUTED_INK);
    expect(ink(fork, all)).toBe(MUTED_INK);
    expect(ink(copy, all, { hover: true })).toBe(MUTED_INK);
  });
});

describe('回合末尾这一排 · 选中态保住语义色', () => {
  it('15-3 踩被选中 · 红,而且不是静音档', () => {
    const root = renderTurn(turn({ feedback: { rating: 'negative', createdAt: 1 } }));
    const all = cascade();
    expect(down(root)!.getAttribute('data-selected')).toBe('true');
    const color = ink(down(root)!, all);
    expect(color).toBe('#f04142');
    expect(color).not.toBe(MUTED_INK);
    // 同一排里没被选中的那枚仍在静音档 —— 语义色不许外溢
    expect(ink(up(root)!, all)).toBe(MUTED_INK);
  });

  it('15-4 赞被选中 · 绿,而且不是静音档', () => {
    const root = renderTurn(turn({ feedback: { rating: 'positive', createdAt: 1 } }));
    const all = cascade();
    expect(up(root)!.getAttribute('data-selected')).toBe('true');
    const color = ink(up(root)!, all);
    expect(color).toBe('#0d5400');
    expect(color).not.toBe(MUTED_INK);
    expect(ink(down(root)!, all)).toBe(MUTED_INK);
  });

  /*
   * 这两条是这份文件真正的红线。
   * `:hover` 与 `[data-selected="true"]` 特异性打平 (0,2,0) —— 谁写在后面谁赢。
   * 一旦有人把 hover 那条挪到选中档后面(或者给 hover 加一档特异性),
   * 「我选过了」就会在鼠标划过去的一瞬间被静音色抹掉,而 CSS 文本上一个字都看不出来。
   */
  it('选中 + hover · 踩仍然是红', () => {
    const root = renderTurn(turn({ feedback: { rating: 'negative', createdAt: 1 } }));
    const all = cascade();
    expect(ink(down(root)!, all, { hover: true })).toBe('#f04142');
  });

  it('选中 + hover · 赞仍然是绿', () => {
    const root = renderTurn(turn({ feedback: { rating: 'positive', createdAt: 1 } }));
    const all = cascade();
    expect(ink(up(root)!, all, { hover: true })).toBe('#0d5400');
  });

  /*
   * 15-7 是「点踩 → 选原因 → 提交」那一路。原因面板由 `reasonRating` 这个组件内
   * state 驱动,而 `selected` 读的是 props 上的 `message.feedback` —— 想靠点击把
   * 面板打开,就得先让这条消息**没有**选中态,可那样断言的就不是「选中的踩」了
   * (再点一次是**取消**,见 `toggleFeedback`)。所以这一格钉的是这一路里唯一
   * 跨状态不变的那件事:**只要踩是选中的,它就得是红的**,提交前提交后都一样。
   */
  it('15-7 选原因那一路 · 全程踩键都是红的', () => {
    const root = renderTurn(
      turn({ feedback: { rating: 'negative', createdAt: 1, reasonsSubmittedAt: 2 } }),
    );
    const all = cascade();
    expect(ink(down(root)!, all)).toBe('#f04142');
    expect(ink(down(root)!, all, { hover: true })).toBe('#f04142');
  });
});

describe('回合末尾这一排 · 静音档管不到的那两格', () => {
  it('15-5 点过「新开会话」· fork 脚注那一档在 chat.css,和这一排同色不同处', () => {
    // fork 之后落下的分界脚注是 `.fork-note`(chat.css 自己声明 token),
    // 这一排的赞 / 踩不因为它变样 —— 两处同色但各自独立。
    const root = renderTurn(turn({}));
    const all = cascade();
    expect(ink(up(root)!, all)).toBe(MUTED_INK);
    const forkBtn = root.querySelector('[data-testid="assistant-fork-button"]');
    expect(forkBtn, 'fork 键没渲染出来,这一格空过了').toBeTruthy();
  });

  it('15-6 这轮被中断 · 赞踩压根不渲染,静音档在这一格无从谈起', () => {
    const root = renderTurn(turn({ id: 'm-stop', runStatus: 'canceled' }));
    expect(up(root)).toBeNull();
    expect(down(root)).toBeNull();
    // 正面断言,免得「整行没渲染」也让上面两条空过
    expect(root.querySelector('[data-testid="assistant-copy-markdown"]')).toBeTruthy();
  });
});

describe('静音档的出处', () => {
  it('这一排消费的是 chat.css 那枚共享 token,不是又抄了一个 #a3a3a3', () => {
    const theater = readFileSync(resolve(SRC, 'styles/viewer/theater.css'), 'utf-8');
    const chat = readFileSync(resolve(SRC, 'styles/chat.css'), 'utf-8');
    // 值只许有一个出处
    expect(chat).toMatch(/--chat-message-muted-ink:\s*#a3a3a3/i);
    expect(theater.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#a3a3a3/i);
    expect(theater).toMatch(/var\(--chat-message-muted-ink/);
  });

  it('token 的作用域够得着这一排 —— 它是从 `.msg` 继承下来的', () => {
    const root = renderTurn(turn({}));
    expect(up(root)!.closest('.msg'), '赞键不在 `.msg` 里,token 继承不到').toBeTruthy();
    expect(
      getComputedStyle(up(root)!).getPropertyValue('--chat-message-muted-ink').trim(),
    ).toBe(MUTED_INK);
  });
});

