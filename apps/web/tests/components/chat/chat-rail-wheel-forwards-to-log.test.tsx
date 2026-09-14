// @vitest-environment jsdom
/**
 * 红测:**滚轮落在消息导轨上时,导轨消化不掉的位移必须转发给聊天记录。**
 *
 * ── 症状(真机坐实) ────────────────────────────────────────────────────
 * `ChatMessageRail` 是一条绝对定位、20px 宽、**整个 log viewport 高**的覆盖层。
 * 指针落在它上面时,滚轮对聊天记录完全无效 —— 上下两个方向都死。
 *
 * 根因是结构性的:导轨是 `.chat-log` 的**兄弟节点**(同在 `.chat-log-viewport`
 * 的一个 grid cell 里叠着),不是祖先。Chromium 沿**祖先链**找滚动容器,
 * chat log 从来不在那条链上;往上找到的 `.chat-log-viewport` / `.chat-log-wrap`
 * / `.pane` 都不接受滚轮。⚠️ 轨道上的 `overscroll-behavior: contain` **不是**
 * 原因(已反证:改成 `auto` 后日志照样不动 —— scroll chaining 只往祖先传),
 * 所以这份规格一个字都不去测它。
 *
 * 伤害面:出现条件只是「≥2 条用户消息」,几乎每段对话都有;导轨平时
 * `opacity: 0` 但照样吃输入,而 `.chat-log` 又**故意没有滚动条**(导轨就是它的
 * 替代品),于是用户按肌肉记忆把指针停在右边缘,正好落进死区。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 这份规格能证明什么 / 不能证明什么
 * ═══════════════════════════════════════════════════════════════════════
 * **能证明**(下面每一条都对着一段实现):
 *  · 导轨的 `wheel` 监听是**原生**监听,且以 `{ passive: false }` 注册
 *    —— 这是 `preventDefault()` 能生效的唯一前提;
 *  · 一个真的 `WheelEvent` 打在导轨上时,位移按判据分账写进
 *    `track.scrollTop` / `log.scrollTop`,并且默认行为被取消;
 *  · 退避态(`is-retracted`)的解除条件;
 *  · 导轨既有行为(悬停短横出预览卡、点击跳转、轨道自身可滚)没被弄坏。
 *
 * **不能证明**(jsdom 既没有布局也没有命中测试):
 *  · 「指针物理落在导轨那 20px 上时,`wheel` 事件的 target 是不是导轨」——
 *    命中测试是浏览器的事,这里是直接往 nav 上 `dispatchEvent`;
 *  · `pointer-events: none` 之后浏览器把点击/悬停交给了底下的谁;
 *  · 真实滚轮的手感(接管之后是逐格写 `scrollTop`,不再有合成器的插值)。
 *  这三条只有真机能确认,已在交付说明里单列。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) =>
  (vars && Object.keys(vars).length > 0 ? `${key} ${Object.values(vars).join(' ')}` : key);

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// 量法
// ---------------------------------------------------------------------------

/**
 * 记下每一次 `wheel` 监听的注册 —— 注册**方式**本身就是判据的一半。
 *
 * React 18 把 `wheel` 一律注册成 passive,所以合成事件里的 `preventDefault()`
 * 是空操作。修复必须以 ref + 原生 `addEventListener` 落地,并显式
 * `{ passive: false }`;这里是唯一能把「注册方式」钉住的地方。
 */
type WheelRegistration = { target: EventTarget; options: unknown };
let wheelRegistrations: WheelRegistration[] = [];
let originalAddEventListener: typeof HTMLElement.prototype.addEventListener;

/**
 * 给一个元素装上会动的滚动几何 —— jsdom 不做排版,原生的
 * `scrollTop` / `scrollHeight` / `clientHeight` 恒为 0,拿它当判据只会假绿。
 * 写入按真实容器的语义夹在 `[0, 行程]` 内。
 */
function installScroller(
  el: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop?: number },
) {
  const travel = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  let top = Math.min(Math.max(geometry.scrollTop ?? 0, 0), travel);
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (next: number) => {
      top = Math.min(Math.max(next, 0), travel);
    },
  });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => geometry.scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => geometry.clientHeight,
  });
}

/** 导轨在屏幕上的矩形 —— 退避解除按指针在不在这个矩形里判,jsdom 要自己给。 */
function installRect(el: HTMLElement, rect: { left: number; top: number; right: number; bottom: number }) {
  el.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  }) as DOMRect;
}

const scrollIntoView = vi.fn();
let originalScrollIntoView: PropertyDescriptor | undefined;

beforeEach(() => {
  wheelRegistrations = [];
  originalAddEventListener = HTMLElement.prototype.addEventListener;
  HTMLElement.prototype.addEventListener = function patched(
    this: HTMLElement,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === 'wheel') wheelRegistrations.push({ target: this, options });
    return originalAddEventListener.call(this, type, listener, options);
  } as typeof HTMLElement.prototype.addEventListener;

  originalScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollIntoView',
  );
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });

  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) =>
      clearTimeout(handle as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
  }
});

afterEach(() => {
  cleanup();
  HTMLElement.prototype.addEventListener = originalAddEventListener;
  if (originalScrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
  }
  scrollIntoView.mockClear();
  vi.clearAllMocks();
});

/** 三条用户消息 + 一条助手消息 —— 导轨要 ≥2 条用户消息才渲染。 */
function buildMessages(): ChatMessage[] {
  const out: ChatMessage[] = [
    { id: 'u1', role: 'user', content: 'first question', createdAt: 1 } as ChatMessage,
    { id: 'u2', role: 'user', content: 'second question', createdAt: 2 } as ChatMessage,
    { id: 'u3', role: 'user', content: 'third question', createdAt: 3 } as ChatMessage,
  ];
  out.push({
    id: 'a1',
    role: 'assistant',
    content: 'an answer',
    createdAt: 4,
    runId: 'run-1',
    runStatus: 'done',
    agentId: 'amr',
    events: [],
  } as unknown as ChatMessage);
  return out;
}

function renderChat() {
  return render(
    <ChatPane
      messages={buildMessages()}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

interface Surfaces {
  nav: HTMLElement;
  track: HTMLElement;
  log: HTMLElement;
}

/**
 * 起一份导轨 + 聊天记录,并按参数给两者装上真实几何。
 *
 * `trackTravel` = 轨道自己的滚动行程。0 表示「那一列短横比导轨矮,轨道压根
 * 不可滚」—— 这是短会话里的常态,也是缺陷最容易被撞上的形态。
 */
async function mount(opts: { trackTravel: number; trackScrollTop?: number }): Promise<Surfaces> {
  renderChat();
  await tick();

  const nav = screen.getByTestId('chat-message-rail') as HTMLElement;
  const track = nav.querySelector('.chat-message-rail__track') as HTMLElement;
  const log = screen.getByTestId('chat-log') as HTMLElement;
  expect(track, '轨道不见了 —— 后面的读数都不作数').toBeTruthy();

  installScroller(track, {
    clientHeight: 400,
    scrollHeight: 400 + opts.trackTravel,
    scrollTop: opts.trackScrollTop ?? 0,
  });
  installScroller(log, { clientHeight: 600, scrollHeight: 4000, scrollTop: 1000 });
  installRect(nav, { left: 780, top: 0, right: 800, bottom: 600 });
  return { nav, track, log };
}

/** 往导轨上打一个真的滚轮事件,回报两边各动了多少、默认行为有没有被取消。 */
function wheelOnRail(
  surfaces: Surfaces,
  init: { deltaY: number; deltaMode?: number; ctrlKey?: boolean },
) {
  const beforeLog = surfaces.log.scrollTop;
  const beforeTrack = surfaces.track.scrollTop;
  const event = new WheelEvent('wheel', {
    deltaY: init.deltaY,
    deltaMode: init.deltaMode ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  surfaces.nav.dispatchEvent(event);
  return {
    logMoved: surfaces.log.scrollTop - beforeLog,
    trackMoved: surfaces.track.scrollTop - beforeTrack,
    defaultPrevented: event.defaultPrevented,
  };
}

// ---------------------------------------------------------------------------
// 防真空:量法得先能看见缺陷
// ---------------------------------------------------------------------------

describe('防真空 · 量法本身站得住', () => {
  it('装上去的滚动几何是真的会动的 —— 不然下面所有 0 都读不出意思', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    surfaces.log.scrollTop = 1234;
    expect(surfaces.log.scrollTop, 'log 的 scrollTop 写不进去').toBe(1234);
    surfaces.log.scrollTop = 999999;
    expect(surfaces.log.scrollTop, 'log 的写入没有按行程夹住').toBe(3400);
  });

  it('导轨确实在场,而且它不是聊天记录的祖先 —— 缺陷的结构前提', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    expect(surfaces.nav.contains(surfaces.log), '导轨要是 log 的祖先,浏览器自己就会把滚轮传下去').toBe(false);
    expect(surfaces.log.contains(surfaces.nav)).toBe(false);
    expect(
      surfaces.nav.parentElement,
      '两者应当是同一个 viewport 下的兄弟',
    ).toBe(surfaces.log.parentElement);
  });
});

// ---------------------------------------------------------------------------
// ★ 主诉
// ---------------------------------------------------------------------------

describe('★ 导轨吃不下的滚轮要转发给聊天记录', () => {
  it('轨道不可滚时,向下滚要把整份位移交给聊天记录', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const result = wheelOnRail(surfaces, { deltaY: 120 });
    expect(result.logMoved, '聊天记录一动不动 —— 这就是用户报的死区').toBe(120);
    expect(result.trackMoved).toBe(0);
  });

  it('轨道不可滚时,向上滚同样要转发 —— 缺陷是上下两个方向都死', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const result = wheelOnRail(surfaces, { deltaY: -120 });
    expect(result.logMoved).toBe(-120);
  });

  it('轨道可滚但已经到底,继续向下滚要转发给聊天记录', async () => {
    // 行程 200,起点就在 200 —— 向下没有余量。
    const surfaces = await mount({ trackTravel: 200, trackScrollTop: 200 });
    const result = wheelOnRail(surfaces, { deltaY: 120 });
    expect(result.trackMoved, '轨道已经到底,不该再动').toBe(0);
    expect(result.logMoved).toBe(120);
  });

  it('轨道只吃得下一半时,剩下的一半不许丢', async () => {
    // 行程 200,起点 150 ⇒ 向下余量 50。
    const surfaces = await mount({ trackTravel: 200, trackScrollTop: 150 });
    const result = wheelOnRail(surfaces, { deltaY: 120 });
    expect(result.trackMoved, '轨道该先吃到它自己的底').toBe(50);
    expect(result.logMoved, '剩下的 70 该落到聊天记录上').toBe(70);
  });

  it('DOM_DELTA_LINE 的滚轮要折算成像素再转发,不能按 3px 当一格', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const result = wheelOnRail(surfaces, { deltaY: 3, deltaMode: 1 });
    expect(
      result.logMoved,
      'Firefox 部分平台一格滚轮 deltaY 就是 3;不折算等于纹丝不动',
    ).toBeGreaterThan(3);
  });
});

describe('★ 接管的前提:非 passive 的原生监听', () => {
  it('导轨的 wheel 监听显式声明了 `{ passive: false }`', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const registrations = wheelRegistrations.filter((r) => r.target === surfaces.nav);
    expect(
      registrations.length,
      '导轨上没有原生 wheel 监听 —— React 的 onWheel 是 passive,preventDefault() 在里面是空操作',
    ).toBeGreaterThan(0);
    for (const registration of registrations) {
      expect(
        registration.options,
        `wheel 监听的注册参数是 ${JSON.stringify(registration.options)};必须是 { passive: false }`,
      ).toMatchObject({ passive: false });
    }
  });

  it('接管时取消默认行为 —— 否则浏览器会把轨道再滚一次,叠成双份位移', async () => {
    const surfaces = await mount({ trackTravel: 200, trackScrollTop: 0 });
    const result = wheelOnRail(surfaces, { deltaY: 120 });
    expect(result.trackMoved, '有余量时先给轨道').toBe(120);
    expect(result.logMoved, '轨道吃得下就别去动聊天记录').toBe(0);
    expect(result.defaultPrevented, '没取消默认,浏览器会再滚一次轨道').toBe(true);
  });

  it('什么都写不动时把滚轮原样还给浏览器,不白吞一次输入', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const result = wheelOnRail(surfaces, { deltaY: 0 });
    expect(result.defaultPrevented).toBe(false);
  });

  it('ctrl + 滚轮是缩放,不接管', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const result = wheelOnRail(surfaces, { deltaY: 120, ctrlKey: true });
    expect(result.defaultPrevented, '吞掉 ctrl+滚轮等于把浏览器缩放从用户手里拿走').toBe(false);
    expect(result.logMoved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ★ 退避态不该继续吃输入
// ---------------------------------------------------------------------------

describe('★ 退避态(点完跳转)', () => {
  const clickFirstMarker = (nav: HTMLElement) => {
    const marker = nav.querySelector('.chat-message-rail__marker') as HTMLElement;
    fireEvent.click(marker);
    return marker;
  };

  it('点完短横之后导轨进入退避态', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    clickFirstMarker(surfaces.nav);
    await tick();
    expect(surfaces.nav.classList.contains('is-retracted')).toBe(true);
  });

  it('退避态下 `pointer-events` 关掉 —— 隐形的东西不吃输入', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    clickFirstMarker(surfaces.nav);
    await tick();
    // 层叠由同目录的 `chat-rail-retracted-pointer-events.test.ts` 单独算;
    // 这里只钉住「类名确实挂上了」,两份合起来才是完整判据。
    expect(surfaces.nav.className).toContain('is-retracted');
  });

  it('指针离开导轨的矩形就解除退避 —— 不能靠 mouseleave,那时它已经不被命中了', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    clickFirstMarker(surfaces.nav);
    await tick();
    expect(surfaces.nav.classList.contains('is-retracted')).toBe(true);

    // 导轨矩形是 left 780 / right 800;400 在它左边,也就是正文里。
    await act(async () => {
      document.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 400, clientY: 300, bubbles: true }),
      );
    });
    expect(
      surfaces.nav.classList.contains('is-retracted'),
      '指针已经离开导轨,退避却没解除 —— 导轨从此再也不亮,比原缺陷更糟',
    ).toBe(false);
  });

  it('指针还停在导轨上时保持退避 —— 别在跳转落地的同时又把导轨亮回来', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    clickFirstMarker(surfaces.nav);
    await tick();

    await act(async () => {
      document.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 790, clientY: 300, bubbles: true }),
      );
    });
    expect(surfaces.nav.classList.contains('is-retracted')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 反向:导轨既有的四件事一件都不许坏
// ---------------------------------------------------------------------------

describe('反向 · 导轨既有行为', () => {
  it('轨道自身可滚时,滚轮仍然先滚轨道(长会话里那一列短横)', async () => {
    const surfaces = await mount({ trackTravel: 200, trackScrollTop: 0 });
    const result = wheelOnRail(surfaces, { deltaY: 80 });
    expect(result.trackMoved).toBe(80);
    expect(result.logMoved).toBe(0);
  });

  it('悬停短横仍然弹出预览卡', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const markers = surfaces.nav.querySelectorAll('.chat-message-rail__marker');
    expect(markers.length, '三条用户消息应当有三根短横').toBe(3);
    fireEvent.mouseEnter(markers[1] as HTMLElement);
    await tick();
    const preview = surfaces.nav.querySelector('.chat-message-rail__preview');
    expect(preview, '预览卡没出来').toBeTruthy();
    expect(preview?.textContent).toContain('second question');
  });

  it('点击短横仍然跳到对应的那条消息', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    const markers = surfaces.nav.querySelectorAll('.chat-message-rail__marker');
    scrollIntoView.mockClear();
    fireEvent.click(markers[2] as HTMLElement);
    await tick();
    expect(scrollIntoView, '没有滚向目标消息').toHaveBeenCalled();
    const target = surfaces.log.querySelector('[data-chat-message-id="u3"]');
    expect(target, '第三条用户消息应当在流水里').toBeTruthy();
    expect(
      scrollIntoView.mock.instances.some((instance) => instance === target),
      '滚的不是被点的那条消息',
    ).toBe(true);
  });

  it('短横数量仍然跟着正文的用户消息走(导轨与流水不许漂移)', async () => {
    const surfaces = await mount({ trackTravel: 0 });
    expect(surfaces.nav.querySelectorAll('.chat-message-rail__marker').length).toBe(3);
    expect(surfaces.log.querySelectorAll('[data-chat-message-id]').length).toBeGreaterThanOrEqual(3);
  });
});
