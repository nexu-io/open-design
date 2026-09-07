// @vitest-environment jsdom
/**
 * 发送队列(交付稿组件 17 `cmp-queue`)—— 字色 / 字族 / 字号逐值对稿。
 *
 * 判据是**稿子的字面值**,不是「用了某个 token」:期望值一律写死成
 * `361b78253e:docs/design/chat-panel/src/tokens.css` 里那一档解出来的字符串,
 * 稿子哪天换值,这里就该红。
 *
 * 稿子出处(全部取自 `361b78253e:docs/design/chat-panel/src/components.css`,
 * `chat-panel-next.html` 是构建产物,不看):
 *   :2889  `.queue { max-height: 122px; overflow-y: auto }`
 *   :2892  `.queue .q { display:flex; align-items:flex-start; gap:8px; padding:7px 10px;
 *                       border-top:1px solid var(--border-soft); font-size:var(--t-mini);
 *                       color:var(--text) }`
 *   :2898  `.queue .q:first-child { border-top: none }`  ← 首行唯一的处理
 *   :2905  `.queue .q .grip { …16×22…; color: var(--text-faint); cursor: grab }`
 *   :2909  `.queue .q .grip:hover { color: var(--text-muted) }`   ← 只换字色
 *   :2910  `.queue .q .grip svg { width: 12px; height: 12px }`
 *   :2911  `.queue .q .ix { flex:none; font-family:var(--mono);
 *                           font-size:var(--t-cap); color:var(--text-soft) }`
 *   :2922  `.queue .q .tx { …display:-webkit-box; -webkit-line-clamp:2; overflow:hidden;
 *                           line-height: var(--lh-row) }`
 *   :327   `.term div, .queue .q .tx { overflow-wrap: anywhere }`
 *   :2930  `.qops button { …color: var(--text-soft) }`
 *   :2935  `.qops button:hover { background: var(--bg-fill-secondary); color: var(--text-strong) }`
 *   :2693  `.queue .q:first-child [data-tip]::after { bottom: auto; top: calc(100% + 6px) }`
 *          注释(:2692)原话:「队列第一行:卡头去掉之后它上面已经没有东西,
 *          朝上的气泡会顶出限高容器。」
 *
 * 三处**已裁决的有意偏离**,本文件一条都不碰、也不许被这里的断言反推回去:
 *   ① 队列外圈那道淡边框 —— 稿子明写「不套框不铺底」,产品 2026-08-27 裁决要框
 *      (规格 §5 C14)。护栏在 `queue-strip-border.test.tsx`。
 *   ② 行里有稿子没有的内容(头像 / 发送人 / 芯片)—— 见 `chat.css` 那一段注释。
 *   ③ 第三颗动作键「引导对话」(B11)是产品自有能力,稿子那颗图标没随稿进仓。
 *
 * ── 量法 ───────────────────────────────────────────────────────────────
 * jsdom 不跑层叠、不解 `var()`,`getComputedStyle` 在这里恒为空串。所以:
 *   · 共享量尺 `helpers/chat-mirror-cascade`(只读)负责它白名单里的属性;
 *   · 它的 `expand()` 是**属性白名单**,`-webkit-line-clamp` / `display` /
 *     `overflow-wrap` 一律**静默丢掉**(读回 `<unset>`,和「真的没人写」分不开;
 *     `font-family` / `line-height` 在 W73 之后已进名单),而且它按 `el.matches()` 匹配,
 *     jsdom 里 `:hover` 永远为假 —— hover 那两条稿子规则它一条也看不见。
 *   · 因此本文件另配一把**只做长手属性 + 可指定伪类状态**的小尺子 `state()`,
 *     并在第一组用例里和共享量尺**对同一个属性交叉验一次**,证明两把尺子
 *     在重叠处读数一致(不是各算各的)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import {
  createResolver,
  hashed,
  parseRules,
  specificity,
  stripComments,
  type Rule,
} from '../../helpers/chat-mirror-cascade';
import { I18nProvider } from '../../../src/i18n';
import { QueuedSendStrip } from '../../../src/components/ChatPane';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const CHAT_PANE_TSX = read('src/components/ChatPane.tsx');

/* ── 稿子的字面值 ──────────────────────────────────────────────────────
 * 全部来自 `361b78253e:docs/design/chat-panel/src/tokens.css` 的 `:root`
 * (产品强制亮色,见 `wsteam` 那条裁决),以及 components.css:106-116 的字号阶梯。
 * 写死字面值而不是写 `var(--text-soft)`:验收标准是「算出来的值和稿子逐字节相同」。 */
const DRAFT = {
  text: '#494949', //            --text        components.css:2896 `.q { color }`
  textStrong: '#202020', //      --text-strong components.css:2935 `.qops button:hover`
  textMuted: '#5c5c5c', //       --text-muted  components.css:2909 `.grip:hover`
  textSoft: '#848484', //        --text-soft   components.css:2911 `.ix`、:2930 `.qops button`
  textFaint: '#bdbdbd', //       --text-faint  components.css:2907 `.grip`
  fillSecondary: 'rgba(0, 0, 0, 0.06)', // --bg-fill-secondary  :2935
  mono: '"JiduMono Pro", ui-monospace, "SFMono-Regular", monospace', // --mono  :2911
  tMini: '12px', //              --t-mini = --font-size-12   :2896
  tCap: '12px', //               --t-cap  = --font-size-12   :2911
  lhRow: '1.5', //               --lh-row                    :2926
} as const;

/* ── 共享量尺(白名单属性,无伪类状态)────────────────────────────────── */
const SHARED_TARGETS = ['color', 'background-color', 'cursor', 'width', 'height', 'font-size'] as const;

const SHEETS = (): string[] => [
  read('src/styles/tokens.css'),
  read('src/styles/base.css'),
  readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  hashed(
    read('src/components/chat/ChatRoot.module.css'),
    chatRootStyles as unknown as Record<string, string>,
  ),
];

const TOKEN_SHEETS = (): string[] => [read('src/styles/tokens.css'), read('src/styles/base.css')];

const CSS = createResolver(SHEETS(), TOKEN_SHEETS(), SHARED_TARGETS);

/* ── 小尺子:任意长手属性 + 指定伪类状态 ──────────────────────────────
 * 只做三件共享量尺不做的事,其余(表的顺序、特异性、var 解析)一模一样地照做:
 *   ① 不做简写展开 —— 目标属性都是稿子里逐条写出来的长手,不会藏在简写后面;
 *   ② 允许把 `:hover` 这类**状态伪类**当成「已激活」来匹配(jsdom 里它恒为假);
 *      特异性仍按**原选择器**算,和浏览器一致;
 *   ③ `<unset>` 与「写了但值等于某某」分得开。
 */
const UNSET = '<unset>';

/** 只按顶层逗号拆 —— `:is(.a, .b)` 里的逗号是参数分隔,裸 split 会造出假选择器。 */
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

function deref(value: string): string {
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
}

/**
 * 层叠走完之后落在 `el` 上的 `prop`。
 *
 * @param states 要当成「已激活」的状态伪类(如 `:hover`)。匹配时从选择器上摘掉,
 *   特异性仍按原选择器算 —— 浏览器就是这么判的。
 */
function state(el: Element, prop: string, states: readonly string[] = []): string {
  let winner: { spec: number; order: number; value: string } | null = null;
  for (const rule of ALL_RULES) {
    const branch = splitTopLevel(rule.selector).find((s) => {
      let probe = s;
      for (const st of states) probe = probe.split(st).join('');
      probe = probe.trim();
      if (!probe) return false;
      try {
        return el.matches(probe);
      } catch {
        // 伪元素分支匹配不到元素本体,jsdom 不认识它们也无所谓 —— 只有这一类该吞。
        // 其余任何解析失败都必须响:吞掉等于悄悄丢一条规则,读回 UNSET 就是假绿。
        if (probe.includes('::')) return false;
        throw new Error(`量尺看不懂这条选择器,拒绝静默跳过:${probe}(出自 ${rule.selector})`);
      }
    });
    if (!branch) continue;
    const spec = specificity(branch);
    for (const decl of rule.body.split(';')) {
      const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (!m) continue;
      if (m[1]!.toLowerCase() !== prop) continue;
      if (!winner || spec > winner.spec || (spec === winner.spec && rule.order >= winner.order)) {
        winner = { spec, order: rule.order, value: m[2]!.trim() };
      }
    }
  }
  return winner ? deref(winner.value) : UNSET;
}

/* ── 夹具:真组件,真 props ─────────────────────────────────────────── */
interface Stage {
  rows: HTMLElement[];
  grip: (row: HTMLElement) => HTMLElement;
  index: (row: HTMLElement) => HTMLElement;
  title: (row: HTMLElement) => HTMLElement;
  actions: (row: HTMLElement) => HTMLElement[];
  tips: (row: HTMLElement) => HTMLElement[];
}

function stage(onReorder?: (ids: string[]) => void): Stage {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <div className="pane" data-chat-root="">
        <QueuedSendStrip
          items={[
            { id: 'q1', prompt: '设置页也加上深色模式开关' },
            { id: 'q2', prompt: '商品卡换成两列' },
          ]}
          onEdit={() => {}}
          onRemove={() => {}}
          onReorder={onReorder ?? (() => {})}
          onSendNow={() => {}}
        />
      </div>
    </I18nProvider>,
  );
  const rows = Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="chat-queued-send-row"]'),
  );
  if (rows.length !== 2) throw new Error(`夹具没渲染出两行,拿到 ${rows.length} 行`);
  const one = (row: HTMLElement, sel: string): HTMLElement => {
    const el = row.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`行里没有 ${sel}`);
    return el;
  };
  return {
    rows,
    grip: (row) => one(row, '.chat-queued-send-drag-handle'),
    index: (row) => one(row, '.chat-queued-send-index'),
    title: (row) => one(row, '.chat-queued-send-title'),
    actions: (row) => Array.from(row.querySelectorAll<HTMLElement>('.chat-queued-send-action')),
    tips: (row) => Array.from(row.querySelectorAll<HTMLElement>('[data-tooltip]')),
  };
}

/* ══════════════════════════════════════════════════════════════════════ */

describe('队列 · 两把尺子先各自证明看得见东西', () => {
  it('小尺子和共享量尺在重叠属性上读数一致', () => {
    const s = stage();
    const action = s.actions(s.rows[0]!)[0]!;
    const grip = s.grip(s.rows[0]!);
    // `.chat-queued-send-action { width: 16px }`(前块)与 `{ width: 22px }`(后块)
    // 同为 (0,1,0),后置的赢。两把尺子都得读回 22px,不然它们的层叠规矩不是一套。
    expect(CSS.resolved(action).width).toBe('22px');
    expect(state(action, 'width')).toBe('22px');
    expect(CSS.resolved(grip).color).toBe(DRAFT.textFaint);
    expect(state(grip, 'color')).toBe(DRAFT.textFaint);
  });

  it('小尺子分得开「没人写」和「写了个别的值」', () => {
    const s = stage();
    // 队列这一格没人写 `letter-spacing` —— 读回 UNSET 而不是空串 / 某个默认值
    expect(state(s.title(s.rows[0]!), 'letter-spacing')).toBe(UNSET);
    // 同一个元素上,写过的属性读得回来
    expect(state(s.title(s.rows[0]!), 'line-height')).not.toBe(UNSET);
  });

  it('小尺子的 hover 态确实换了一个读数(不是两边都回同一个值的空过)', () => {
    const s = stage();
    const grip = s.grip(s.rows[0]!);
    expect(state(grip, 'color')).not.toBe(state(grip, 'color', [':hover']));
  });
});

describe('A1 · 首行的提示气泡朝下弹', () => {
  /* 稿子 components.css:2693
   *   `.queue .q:first-child [data-tip]::after { bottom: auto; top: calc(100% + 6px) }`
   * 覆盖首行**每一个** `[data-tip]`(手柄也在内)。我们的提示走 body 上的
   * `TooltipLayer` portal,方向由 `data-tooltip-placement` 定,`bottom` 就是稿子那一档。 */
  it('首行每一颗带提示的控件都朝下弹', () => {
    const s = stage();
    const first = s.tips(s.rows[0]!);
    expect(first.length).toBeGreaterThanOrEqual(4); // 手柄 + 编辑 + 移除 + 第三颗
    for (const el of first) {
      expect(
        el.getAttribute('data-tooltip-placement'),
        `首行这颗控件的气泡没朝下:${el.getAttribute('aria-label')}`,
      ).toBe('bottom');
    }
  });

  it('非首行不受影响 —— 证明上面那条不是「整条都写死成 bottom」的空过', () => {
    const s = stage();
    const second = s.tips(s.rows[1]!);
    expect(second.some((el) => el.getAttribute('data-tooltip-placement') !== 'bottom')).toBe(true);
  });
});

describe('A2 · 最左是拖拽手柄,不是上移箭头', () => {
  it('行里第一个可聚焦控件就是手柄,而且是稿子那颗六点图形', () => {
    const s = stage();
    const row = s.rows[0]!;
    const controls = Array.from(row.querySelectorAll('button'));
    expect(controls[0]).toBe(s.grip(row));
    // 稿子 :1322 的 `.grip` svg:两列 cx 9/15、三行 cy 6/12/18、r 1.5
    const circles = Array.from(s.grip(row).querySelectorAll('circle')).map(
      (c) => `${c.getAttribute('cx')},${c.getAttribute('cy')},${c.getAttribute('r')}`,
    );
    expect(circles).toEqual([
      '9,6,1.5', '15,6,1.5', '9,12,1.5', '15,12,1.5', '9,18,1.5', '15,18,1.5',
    ]);
  });

  it('手柄是真能拖的 —— 拖完真的回调了新顺序(不是画个手型光标的假控件)', () => {
    const onReorder = vi.fn();
    const s = stage(onReorder);
    const grip = s.grip(s.rows[0]!);
    expect(grip.getAttribute('draggable')).toBe('true');

    const data = new Map<string, string>();
    const dt = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
      dropEffect: '',
      setDragImage: () => {},
    };
    const fire = (target: Element, type: string, extra: Record<string, unknown> = {}) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { dataTransfer: dt }, extra);
      target.dispatchEvent(ev);
    };
    fire(grip, 'dragstart');
    // 掉在第二行的下半 → 落到它后面
    const rect = { top: 0, height: 34, bottom: 34, left: 0, right: 100, width: 100 };
    vi.spyOn(s.rows[1]!, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
    fire(s.rows[1]!, 'dragover', { clientY: 30 });
    fire(s.rows[1]!, 'drop', { clientY: 30 });
    expect(onReorder).toHaveBeenCalledWith(['q2', 'q1']);
  });

  it('手柄的盒子 / 光标 / 字色逐值对稿', () => {
    const s = stage();
    const grip = s.grip(s.rows[0]!);
    const resolved = CSS.resolved(grip);
    expect(resolved.width).toBe('16px'); //  稿 :2906
    expect(resolved.height).toBe('22px'); // 稿 :2906
    expect(resolved.cursor).toBe('grab'); // 稿 :2907
    expect(resolved.color).toBe(DRAFT.textFaint); // 稿 :2907
    // 稿 :2910 `.grip svg { width: 12px; height: 12px }` —— 只管手柄,动作键是 14
    const svg = grip.querySelector('svg')!;
    expect(state(svg, 'width')).toBe('12px');
    expect(state(svg, 'height')).toBe('12px');
  });

  it('hover 只换字色、换成 --text-muted —— 稿子那条不铺底', () => {
    const s = stage();
    const grip = s.grip(s.rows[0]!);
    // 稿 :2909 `.queue .q .grip:hover { color: var(--text-muted) }` —— 整条规则只有一句
    expect(state(grip, 'color', [':hover'])).toBe(DRAFT.textMuted);
    // 稿子的 `.grip:hover` 没有 background:hover 前后底色必须一样
    expect(state(grip, 'background', [':hover'])).toBe(state(grip, 'background'));
  });
});

describe('A3 · 序号用等宽字体', () => {
  it('字族 / 字号 / 字色逐值对稿(稿 :2911)', () => {
    const s = stage();
    const ix = s.index(s.rows[0]!);
    expect(state(ix, 'font-family')).toBe(DRAFT.mono);
    expect(CSS.resolved(ix)['font-size']).toBe(DRAFT.tCap);
    expect(CSS.resolved(ix).color).toBe(DRAFT.textSoft);
  });

  it('等宽不是从行上继承来的 —— 正文那一格仍是无衬线', () => {
    const s = stage();
    expect(state(s.title(s.rows[0]!), 'font-family')).not.toBe(DRAFT.mono);
  });
});

describe('A4 · 消息最多两行,第三行起截断', () => {
  it('两行截断那一套逐条对稿(稿 :2922)', () => {
    const s = stage();
    const tx = s.title(s.rows[0]!);
    expect(state(tx, 'display')).toBe('-webkit-box');
    expect(state(tx, '-webkit-box-orient')).toBe('vertical');
    expect(state(tx, '-webkit-line-clamp')).toBe('2');
    expect(state(tx, 'overflow')).toBe('hidden');
    expect(state(tx, 'line-height')).toBe(DRAFT.lhRow);
  });

  it('长词不会把行撑破 —— 稿 :327 `.queue .q .tx { overflow-wrap: anywhere }`', () => {
    const s = stage();
    expect(state(s.title(s.rows[0]!), 'overflow-wrap')).toBe('anywhere');
  });

  it('前块那条 `white-space: nowrap` 已经被后块解开(不然 clamp 永远只有一行)', () => {
    const s = stage();
    expect(state(s.title(s.rows[0]!), 'white-space')).toBe('normal');
  });
});

describe('B · 首行高亮那条死规则连类名一起清掉', () => {
  /* 稿子里**没有**首行高亮:`.queue .q:first-child`(components.css:2898)唯一的
   * 处理是 `border-top: none`。规则今天已删,类名跟着走 —— 留着就是一个
   * 没有任何规则消费、却在 diff 里长得像「首行有特殊态」的钩子。 */
  it('ChatPane 不再按 index === 0 挂 -active', () => {
    expect(CHAT_PANE_TSX).not.toContain('chat-queued-send-row-active');
  });

  it('真实 DOM 的首行身上也没有它', () => {
    const s = stage();
    expect(s.rows[0]!.classList.contains('chat-queued-send-row-active')).toBe(false);
    // 校准:查询不是瞎的
    s.rows[0]!.classList.add('chat-queued-send-row-active');
    expect(s.rows[0]!.matches('.chat-queued-send-row-active')).toBe(true);
    s.rows[0]!.classList.remove('chat-queued-send-row-active');
  });

  it('首行和次行的底色一样 —— 稿子首行只少一条上边线,不换底', () => {
    const s = stage();
    expect(CSS.resolved(s.rows[0]!)['background-color']).toBe(
      CSS.resolved(s.rows[1]!)['background-color'],
    );
    expect(CSS.resolved(s.rows[0]!)['background-color']).toBe('transparent');
  });
});

describe('C · 顺手扫到的字色偏差', () => {
  it('动作键的底色 / 字色对稿(稿 :2930 常态、:2935 hover)', () => {
    const s = stage();
    const action = s.actions(s.rows[0]!)[0]!;
    expect(CSS.resolved(action).color).toBe(DRAFT.textSoft);
    expect(state(action, 'background', [':hover'])).toBe(DRAFT.fillSecondary);
    expect(state(action, 'color', [':hover'])).toBe(DRAFT.textStrong);
  });

  it('hover 前后确实换了色 —— 上面那条不是两边同值的空过', () => {
    const s = stage();
    const action = s.actions(s.rows[0]!)[0]!;
    expect(state(action, 'color', [':hover'])).not.toBe(state(action, 'color'));
  });

  /* 稿子里 hover 反馈**只挂在控件上**(`.grip:hover` / `.qops button:hover`),
     整行**没有** `.queue .q:hover` —— grep 过整份 components.css,`.queue` 一族
     只有 :2889 / :2892 / :2898 / :2905 / :2909 / :2910 / :2911 / :2922 / :327 / :2693 十条。
     我们原来那条整行底色是**卡片时代的残留**(和已经被撤掉的 border / background /
     min-height / box-shadow 同一次提交进来的),按稿子对齐的那一版没把它一起收掉。
     队列现在是一叠靠分隔线立起来的待办,整行铺色会读成「这一条被选中了」。 */
  it('行本身 hover 不换底色 —— 稿子没有 `.queue .q:hover`', () => {
    const s = stage();
    const row = s.rows[0]!;
    expect(state(row, 'background', [':hover'])).toBe(state(row, 'background'));
    // 钉字面值,不只钉「相等」:两边一起变成别的颜色时「相等」照样绿
    expect(state(row, 'background', [':hover'])).toBe('none');
    // 卡片时代那条想要的底色本来是另一个东西 —— 证明上面不是空过
    expect(state(row, 'background', [':hover'])).not.toBe(
      'color-mix(in srgb, #ededed 70%, transparent)',
    );
  });

  it('行的字号是稿子的 --t-mini(:2896)', () => {
    const s = stage();
    expect(CSS.resolved(s.rows[0]!)['font-size']).toBe(DRAFT.tMini);
  });

  it('正文字色是稿子的 --text(:2896 挂在 `.q` 上,我们挂在 `.tx` 上,读数须相同)', () => {
    const s = stage();
    expect(CSS.resolved(s.title(s.rows[0]!)).color).toBe(DRAFT.text);
  });
});
