// @vitest-environment jsdom
/**
 * 选中文字之后那颗「添加到对话」,**滚动时要跟着选区走**,不是消失。
 *
 * ── 用户报的(2026-09-04,口述)──────────────────────────────────────────
 *
 *   「选中文本后,『添加到对话』按钮怎么一滚动就消失了?消失不会再显示吗?」
 *
 * 两问都成立:滚一下就没,而且**再也不回来** —— 唯一能把它叫回来的是
 * `selectionchange`,而滚动并不改变选区,所以除非用户重新选一次,它就一直不在。
 *
 * ── 这不是意外的回归,是一条被写死的裁决 ────────────────────────────────
 *
 * `quote-bar-scroll-lifecycle.test.tsx` 里那条用例的标题逐字是
 * 「chat viewport 真正位移时**关闭,并等待下一次 selectionchange 才重新出现**」。
 * 也就是说当时是**有意**这么做的,起因是 OPEND-2541「滚动会话时选中文案的
 * Add to chat 浮层随内容移动」—— 浮条用的是 `position: fixed`,滚动时会停在原地
 * 变成一条对不上任何东西的鬼影。当时的修法是「那就把它藏了」。
 *
 * ── 稿子给的是另一条路 ──────────────────────────────────────────────────
 *
 * `729fa43ce7:docs/design/chat-panel/src/components.css:3136` 逐字:
 *
 *     .sel    { position: relative; … }
 *     .selbar { position: absolute; left: 50%; translate: -50% 0;
 *               bottom: calc(100% + 7px); … }
 *
 * 稿子把浮条**挂在选区自己身上**(`absolute` 锚在 `.sel` 上),所以它天然跟着
 * 内容滚 —— 稿子里根本不存在「滚动时怎么办」这个问题,因为不会错位。
 * 我们用 `fixed`,才需要每次滚动重算位置。**「跟着走」才是稿子的行为**,
 * 「藏起来」是实现方式带出来的副作用被当成了规则。
 *
 * ── 所以这次要的是三段,不是一句 ────────────────────────────────────────
 *
 *  ① 选区还看得见 → 浮条**跟着移动**,不消失;
 *  ② 选区滚出可视区 → 这时候才藏(否则它会被夹在面板边上,悬在无关内容头上);
 *  ③ 选区又滚回来  → **自己回来**,不需要用户重新选一次。
 *
 * ③ 是用户那句「消失不会再显示吗」的正面回答,也是修之前最缺的一条。
 *
 * ── 防假绿 ──────────────────────────────────────────────────────────────
 *
 * 这个文件里选区的坐标**必须跟着 scrollTop 一起变**。旧那份夹具把
 * `range.getBoundingClientRect` 钉成常数,于是「滚动」只改了 scrollTop 而选区
 * 纹丝不动 —— 那在真浏览器里不存在。拿常数选区去测「跟随」,写什么都能绿。
 */
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuoteBar } from '../../../src/components/chat/QuoteBar';

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height, toJSON: () => ({}),
  } as DOMRect;
}

function Harness() {
  const scopeRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={scopeRef} data-testid="scope">
        <p data-message-id="assistant-1">一段可以添加到对话的选中文案</p>
      </div>
      <QuoteBar scopeRef={scopeRef} onQuote={vi.fn()} />
    </>
  );
}

const SCOPE_TOP = 0;
const SCOPE_HEIGHT = 640;
/** 选区在文档里的位置固定;**屏幕上**的位置 = 它减去滚动量,和真浏览器一致 */
const SELECTION_DOC_TOP = 300;
const SELECTION_HEIGHT = 24;

/**
 * 装好一个选区,并返回一个 `scrollTo` —— 它同时改 `scrollTop` **和**选区的
 * 屏幕坐标,这正是真浏览器滚动时发生的事。
 */
function mountSelection() {
  render(<Harness />);
  const scope = screen.getByTestId('scope');
  vi.spyOn(scope, 'getBoundingClientRect').mockImplementation(
    () => rect(0, SCOPE_TOP, 480, SCOPE_HEIGHT),
  );

  const textNode = scope.querySelector('p')?.firstChild;
  if (!textNode) throw new Error('fixture 坏了:没有可选的文本节点');
  const range = document.createRange();
  range.selectNodeContents(textNode);

  let scrollTop = 0;
  vi.spyOn(range, 'getBoundingClientRect').mockImplementation(
    () => rect(120, SELECTION_DOC_TOP - scrollTop, 160, SELECTION_HEIGHT),
  );
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => '添加到对话的选中文案',
  } as unknown as Selection);

  fireEvent(document, new Event('selectionchange'));

  const scrollTo = (next: number): void => {
    scrollTop = next;
    scope.scrollTop = next;
    fireEvent.scroll(scope);
  };
  const barTop = (): number | null => {
    const el = screen.queryByTestId('chat-quote-bar');
    if (!el) return null;
    return Number.parseFloat((el as HTMLElement).style.top);
  };
  return { scope, scrollTo, barTop };
}

describe('滚动时「添加到对话」跟着选区走', () => {
  it('① 选区还在可视区里 → 浮条不消失', () => {
    const { scrollTo } = mountSelection();
    expect(screen.getByTestId('chat-quote-bar')).toBeInTheDocument();

    scrollTo(48);

    expect(
      screen.queryByTestId('chat-quote-bar'),
      '选区还看得见,浮条不该消失 —— 用户报的正是这一条',
    ).toBeInTheDocument();
  });

  it('① 而且真的**跟着移动**了 —— 不是原地不动的鬼影(OPEND-2541 要防的)', () => {
    const { scrollTo, barTop } = mountSelection();
    const before = barTop();
    expect(before, '首帧要有位置').not.toBeNull();

    scrollTo(48);
    const after = barTop();

    expect(after, '滚动后浮条还在').not.toBeNull();
    expect(
      Math.round(before! - after!),
      '选区上移了 48px,浮条也要上移 48px;差值为 0 说明它停在原地变成了鬼影',
    ).toBe(48);
  });

  it('② 选区滚出可视区 → 这时候才藏', () => {
    const { scrollTo } = mountSelection();
    // 选区在文档 300px 处;滚过 340 之后它整段跑到面板顶边以上
    scrollTo(SELECTION_DOC_TOP + SELECTION_HEIGHT + 20);
    expect(
      screen.queryByTestId('chat-quote-bar'),
      '选区看不见了,浮条不该夹在面板边上悬着',
    ).not.toBeInTheDocument();
  });

  it('③ 选区又滚回来 → 自己回来,不用重新选一次', () => {
    const { scrollTo } = mountSelection();
    scrollTo(SELECTION_DOC_TOP + SELECTION_HEIGHT + 20);
    expect(screen.queryByTestId('chat-quote-bar')).not.toBeInTheDocument();

    scrollTo(0);

    expect(
      screen.queryByTestId('chat-quote-bar'),
      '用户原话:「消失不会再显示吗」—— 这一条就是那个「会」',
    ).toBeInTheDocument();
  });

  it('反向对照:选区被清掉,浮条照旧消失', () => {
    const { scrollTo } = mountSelection();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true, rangeCount: 0,
      getRangeAt: () => { throw new Error('no range'); },
      toString: () => '',
    } as unknown as Selection);

    scrollTo(10);

    expect(screen.queryByTestId('chat-quote-bar')).not.toBeInTheDocument();
  });
});

/* ── 跨多行的选区 ─────────────────────────────────────────────────────────
 *
 * 上面每一条走的都是 `visibleSelectionRects` 的**兜底分支**(`getClientRects()`
 * 空 → 退回 `getBoundingClientRect()` 的并集),于是 `first === last`,
 * `selectionOnScreen` 里那对 `Math.min` / `Math.max` **恒等于在比同一个矩形**。
 * 也就是说:多行那条路,上面一条都没覆盖到 —— 这是接手时对方自己报出来的盲区。
 *
 * 这一组把 `getClientRects()` 喂成真的多行(首行、中间、末行三块),专测
 * `first !== last`:一段比一屏还高的选区,**首尾两块都滚出去了、中间还占着满屏**,
 * 按「整段跨度和面板有没有交叠」判,它仍然**看得见**,浮条不许藏。
 * 若把判据写成「首块或末块在屏上」,这一格就会红 —— 那正是要防的写法。
 */
describe('跨多行的选区(first !== last,上面那几条覆盖不到的路)', () => {
  function mountTallSelection(scrollTop: number) {
    render(<Harness />);
    const scope = screen.getByTestId('scope');
    vi.spyOn(scope, 'getBoundingClientRect').mockImplementation(
      () => rect(0, SCOPE_TOP, 480, SCOPE_HEIGHT),
    );
    const textNode = scope.querySelector('p')?.firstChild;
    if (!textNode) throw new Error('fixture 坏了');
    const range = document.createRange();
    range.selectNodeContents(textNode);

    // 文档坐标:首行 100、中间 700、末行 1300 —— 整段 1224px,比 640px 的面板高
    const rows = [100, 700, 1300];
    vi.spyOn(range, 'getClientRects').mockImplementation(
      () => rows.map((top) => rect(120, top - scrollTop, 160, 24)) as unknown as DOMRectList,
    );
    vi.spyOn(range, 'getBoundingClientRect').mockImplementation(
      () => rect(120, rows[0]! - scrollTop, 160, 1224),
    );
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false, rangeCount: 1,
      getRangeAt: () => range,
      toString: () => '一段跨了很多行的选中文案',
    } as unknown as Selection);

    fireEvent(document, new Event('selectionchange'));
    return scope;
  }

  it('首尾两块都滚出去了、中间还在屏上 → 仍然算看得见,不许藏', () => {
    // 滚到 800:首行在 -700(面板上方外),末行在 500(还在面板内)
    mountTallSelection(800);
    expect(
      screen.queryByTestId('chat-quote-bar'),
      '按整段跨度判才对;只看首块或末块的写法会在这里把浮条藏掉',
    ).toBeInTheDocument();
  });

  it('反向对照:整段都滚过去了 → 才藏', () => {
    // 滚到 2000:末行也到了 -700,整段都在面板上方
    mountTallSelection(2000);
    expect(screen.queryByTestId('chat-quote-bar')).not.toBeInTheDocument();
  });
});

describe('量不到的面板不算「选区在屏外」的证据', () => {
  /*
   * 判据要求面板**有高度**才算得出交叠。面板高度为 0 时(还没布局、被隐藏、
   * 或者测试里没人给它坐标),交叠恒为假 —— 那会把每个选区都判成看不见。
   *
   * 这不是假想:`chat-scroll-following.test.tsx` 那条选区暂停追尾的用例只 mock 了
   * 选区矩形、没 mock 面板矩形,加上可见性判据之后浮条整个消失,全量套件里红了一条。
   * 「没测量」不等于「测量结果为否」,所以这一档放行。
   */
  it('面板矩形是 0 高时,浮条照常出来', () => {
    render(<Harness />);
    const scope = screen.getByTestId('scope');
    // 不 mock scope 的矩形 —— jsdom 默认全 0,正是布局未完成时的形状
    const textNode = scope.querySelector('p')?.firstChild;
    if (!textNode) throw new Error('fixture 坏了');
    const range = document.createRange();
    range.selectNodeContents(textNode);
    vi.spyOn(range, 'getBoundingClientRect').mockImplementation(
      () => rect(120, 300, 160, 24),
    );
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false, rangeCount: 1,
      getRangeAt: () => range,
      toString: () => '一段选中文案',
    } as unknown as Selection);

    fireEvent(document, new Event('selectionchange'));

    expect(
      screen.queryByTestId('chat-quote-bar'),
      '面板量不到就藏,等于把「没测量」当成「不可见」',
    ).toBeInTheDocument();
  });
});
