// @vitest-environment jsdom
/**
 * Plan 药丸(第 71 格)必须和**对话内容 / 输入框同一条中线**。
 *
 * 产品的原话:「把这个 todo 放到左右居中第/步和上面的 hover 卡片,都对话内和下面
 * 输入框中心对齐」。
 *
 * 真机量过(无头 Chrome + CDP,真 CSS 真 DOM,`.pane` 宽 460 的默认档):
 *   面板中线 234 · 流水内容中线 234 · 输入框内容中线 234 · 输入框壳中线 234
 *   药丸中线 **74.16**(偏左 159.84) · 浮层中线 **134**(偏左 100)
 * 窄档(`.pane` 320)同一笔账:三者中线 164,药丸 74.16、浮层 134。
 * 两档都偏,而且偏的量随面板宽度变 —— 所以修法不能是写死一个位移。
 *
 * 中线是怎么定的:`.pane` 是一列 flex,`.chat-composer-slot` 和
 * `.chat-queued-send-strip` 都靠**交叉轴 stretch 铺满整列 + 左右对称的内缩**
 * 拿到那条中线,`.composer` 自己的左右内距也是对称的。药丸沿用同一套 ——
 * 满宽一行、`justify-content: center` 把药丸摆到中间 —— 面板拖宽拖窄、
 * 侧栏开合,中线自动跟着走,不需要任何一个写死的偏移量。
 *
 * jsdom 排不出版,所以这里钉的是**能算的那几笔账**,每一条都可证伪:
 *   · 那一行不满宽 / 不居中 → 中线不可能等于面板中线;
 *   · 左右内缩不对称 → 中线被推走;
 *   · 浮层贴着药丸左边缘开(`left: 0`)→ 浮层中线 ≠ 药丸中线;
 *   · 浮层的宽度上限不跟着那一行收 → `.pane { overflow: hidden }` 会把它切掉。
 * 真实几何由 `docs/design/chat-mirror/measure.mjs` 那套 CDP 量法复核。
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatPane } from '../../../src/components/ChatPane';
import planStyles from '../../../src/components/chat/PlanPill.module.css';
import type { ChatMessage } from '../../../src/types';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/components/chat/PlanPill.module.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');
const HOST_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/viewer/composio.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 选择器列表**只按顶层逗号切**。
 *
 * `:is(.a, .b)` / `:where()` / `min(320px, 100%)` 里都有逗号,朴素的 `split(',')`
 * 会切出 `:is(.a` 这种废选择器 —— 而且它谁也匹配不到,于是断言静默变成真空。
 */
function splitTopLevel(list: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === sep && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/**
 * 这个选择器**实际吃到**的所有声明,按源码顺序接起来。
 *
 * 同一个选择器可能出现在好几条规则里(共享的那条 + 后面单独收窄的那条),
 * 特异性相同时后写的赢,所以要全收、按顺序接,不能只取第一条。
 */
function declarationsFor(selector: string, source = CSS): string {
  const bodies: string[] = [];
  for (const [, selectorList, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = splitTopLevel(selectorList ?? '').map((s) => s.replace(/\s+/g, ' '));
    if (selectors.includes(selector)) bodies.push(body ?? '');
  }
  expect(bodies.length, `找不到 ${selector} 的规则`).toBeGreaterThan(0);
  return bodies.join('\n');
}

/** 这条规则最终吃到的某个属性值(后写的赢),没有就 null。 */
function valueOf(body: string, prop: string): string | null {
  let out: string | null = null;
  for (const [, value] of body.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))) {
    out = (value ?? '').trim();
  }
  return out;
}

/**
 * CSS Module 在测试里给出的是**加了哈希**的类名(`_row_f059df`),而源文件里写的是
 * `.row`。按哈希名反推回本地名再去源文件里找规则 —— 这样组件换了哪个 key,
 * 断言跟着换,不会出现「测的选择器和组件用的选择器不是同一个」。
 */
const local = (hashed: string | undefined): string =>
  (hashed ?? '').replace(/^_([A-Za-z0-9]+)_[a-z0-9]{4,10}$/, '$1');

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  } else {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  }
});

const TODOS = [
  { content: '复刻商品列表页结构与栅格', status: 'completed' },
  { content: '抽出商品卡为共享组件', status: 'completed' },
  { content: '按同一套间距做设置页', status: 'in_progress' },
  { content: '接上两页之间的跳转', status: 'pending' },
  { content: '统一空状态与加载态', status: 'pending' },
];

const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: '把这两页做出来', createdAt: 1 },
  {
    id: 'a1',
    role: 'assistant',
    content: '好的',
    createdAt: 2,
    events: [{ kind: 'tool_use', id: 'tw-1', name: 'TodoWrite', input: { todos: TODOS } }],
  },
];

function renderPane() {
  return render(
    <ChatPane
      messages={messages}
      streaming
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />,
  );
}

describe('Plan 药丸 · 和对话内容 / 输入框同一条中线', () => {
  it('药丸浮在滚动区底部,不再作为普通 flex 孩子撑出白带', () => {
    renderPane();
    const pill = screen.getByTestId('chat-plan-pill');
    const slot = screen.getByTestId('chat-bottom-float-slot');
    expect(pill.parentElement).toBe(slot);
    expect(slot.parentElement?.classList.contains('chat-log-viewport')).toBe(true);
    expect(slot.parentElement?.parentElement?.classList.contains('chat-log-wrap')).toBe(true);
    const body = declarationsFor('.chat-bottom-float-slot', HOST_CSS);
    expect(valueOf(body, 'position')).toBe('absolute');
    expect(valueOf(body, 'bottom')).toBe('12px');
    expect(valueOf(body, 'display')).toBe('flex');
    expect(valueOf(body, 'justify-content'), '药丸靠这条落到那一行的正中').toBe('center');
    expect(valueOf(body, 'pointer-events'), '满宽定位层不许挡住消息文字').toBe('none');
    expect(valueOf(declarationsFor(`.${local(planStyles.wrap)}`), 'pointer-events')).toBe('auto');
  });

  it('横向内缩取输入框那一列的同一个 token,而且左右对称', () => {
    const body = declarationsFor('.chat-bottom-float-slot', HOST_CSS);
    const left = valueOf(body, 'left');
    const right = valueOf(body, 'right');
    // 不对称就是把中线整体推走 —— 居中的账在这里就已经算错了。
    expect(left).toBe(right);
    // 取的必须是输入框 / 发送队列那一列同一个 token:换成字面量,
    // `.app` 那一档把它改成 10px 时药丸就单独留在 12px 上。
    expect(left).toContain('--chat-composer-inline-inset');
  });

  it('药丸自己不再左对齐 —— 旧的 align-self: flex-start 是这次的病根', () => {
    const body = declarationsFor(`.${local(planStyles.wrap)}`);
    expect(valueOf(body, 'align-self')).toBeNull();
    expect(valueOf(body, 'margin'), '横向内缩归宿主管,药丸自己不再兼这份差').toBeNull();
    expect(valueOf(body, 'position'), '水平定位只许宿主拥有').toBeNull();
  });

  it('浮层在同一条中线上开,而不是贴着药丸左边缘', () => {
    const body = declarationsFor(`.${local(planStyles.wrap)} .${local(planStyles.pop)}`);
    expect(valueOf(body, 'position')).toBe('absolute');
    // 稿子原文就是这两条(`.pmini .pop { left: 50%; transform: translateX(-50%) }`);
    // 产品这一侧当初为了躲开面板左边缘改成了 left: 0 —— 药丸居中之后那个理由没有了。
    expect(valueOf(body, 'left')).toBe('50%');
    expect(valueOf(body, 'transform')).toBe('translateX(-50%)');
    // 往上开、8px 缝这两件事不许在这次一起动。
    expect(valueOf(body, 'bottom')).toBe('calc(100% + 8px)');
  });

  it('浮层的定位基准是那一行,不是药丸 —— 否则百分比宽度上限没有意义', () => {
    const slot = declarationsFor('.chat-bottom-float-slot', HOST_CSS);
    const wrap = declarationsFor(`.${local(planStyles.wrap)}`);
    expect(valueOf(slot, 'position'), '包含块必须是满宽的公共浮层位').toBe('absolute');
    expect(valueOf(wrap, 'position'), '药丸自己不能再当包含块,否则 100% 只有药丸那么宽').toBeNull();
  });

  it('Plan 只有一个固定的底部位置,不再为了同时展示 Jump 上移', () => {
    expect(CSS).not.toMatch(/\.raised\s*\{/);
  });

  it('浮层被夹在那一行之内 —— .pane 是 overflow:hidden,窄面板下会被切', () => {
    const body = declarationsFor(`.${local(planStyles.wrap)} .${local(planStyles.pop)}`);
    const maxWidth = valueOf(body, 'max-width');
    expect(maxWidth).not.toBeNull();
    // `min(320px, 100%)`:320 是稿子的上限,100% 是那一行(= 输入框那一列)的宽度。
    // 只写 320px 的话,窄面板(320px 档实测那一行只有 292px)会把浮层两头切掉。
    const parts = splitTopLevel(maxWidth!.replace(/^min\(/, '').replace(/\)$/, ''));
    expect(maxWidth!.startsWith('min('), `max-width 要夹一层 min(),现在是 ${maxWidth}`).toBe(true);
    expect(parts).toContain('320px');
    expect(parts).toContain('100%');
  });

  it('不是靠写死的位移居中 —— 面板可拖宽拖窄,写死的量当场漂移', () => {
    const subjects: Array<[string, string]> = [
      ['.chat-bottom-float-slot', HOST_CSS],
      [`.${local(planStyles.wrap)}`, CSS],
      [`.${local(planStyles.wrap)} .${local(planStyles.pop)}`, CSS],
    ];
    for (const [selector, source] of subjects) {
      const body = declarationsFor(selector, source);
      for (const prop of ['left', 'right', 'margin-left', 'margin-right', 'inset-inline-start']) {
        const value = valueOf(body, prop);
        if (value === null) continue;
        expect(value, `${selector} 的 ${prop} 用了写死的像素`).not.toMatch(/^-?\d+(\.\d+)?px$/);
      }
    }
  });

  it('居中之后仍然看得见、仍然悬停 / 键盘打得开', () => {
    renderPane();
    const wrap = screen.getByTestId('chat-plan-pill');
    // 还在,而且还是那句「第 N / M 步」(无 provider 时 i18n 落回 en)
    expect(wrap).toHaveTextContent('Step 3 of 5');
    // 浮层里整张清单还在
    const steps = within(screen.getByTestId('chat-plan-pill-steps')).getAllByRole('listitem');
    expect(steps.map((li) => li.textContent)).toEqual(TODOS.map((t) => t.content));
    // 悬停 / 聚焦的触发面仍然挂在**药丸自己那一层**上,不是满宽的那一行 ——
    // 挂到行上,整条空白都会把浮层勾出来。
    expect(wrap.className).toBe(planStyles.wrap);
    expect(wrap.querySelector('button')).not.toBeNull();
    expect(wrap.contains(screen.getByTestId('chat-plan-pill-steps'))).toBe(true);
    for (const trigger of [`.${local(planStyles.wrap)}:hover .${local(planStyles.pop)}`, `.${local(planStyles.wrap)}:focus-within .${local(planStyles.pop)}`]) {
      expect(valueOf(declarationsFor(trigger), 'opacity')).toBe('1');
    }
    // 而且公共浮层位本身不许成为触发面
    expect(HOST_CSS).not.toMatch(/\.chat-bottom-float-slot:hover/);
  });
});
