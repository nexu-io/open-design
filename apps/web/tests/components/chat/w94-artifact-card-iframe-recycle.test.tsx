// @vitest-environment jsdom
/**
 * 滚出视口的产物卡 iframe 要能被**回收**,不能永远挂着。
 *
 * 用户 2026-09-02:「永不卸载感觉有问题呢?? 能不能有什么 LRU 策略做一个缓冲」。
 *
 * 今天的形状:`project-cover.tsx` 用的 `useInView` 默认 `once: true` —— 一旦进过
 * 视口,`inView` 就永久锁在 true,iframe 挂上去再也不卸。上一组真机滚了一遍 4 张卡
 * 的会话,数量是 2→3→4,**只增不减**。一条 assistant 消息实测最多产出 28 张卡
 * (13 张 html),而 `ChatPane` 的虚拟化要到 **80 条消息**才启动 —— 也就是说 79 条
 * 消息以内的会话,滚到底就是前面每一张产物卡的 live 文档全都还活在渲染器里。
 *
 * ── 为什么是 LRU 而不是「离视口多远就卸」 ────────────────────────────────
 *
 * 因为**按距离卸根本量不了**。产物卡住在 `.chat-log` 这个 `overflow-y: auto` 里,
 * 而 IntersectionObserver 的相交矩形要先被祖先的裁剪框裁一刀,再跟 root 比 ——
 * `rootMargin` 撑的是 root(视口),撑不开中间那一刀。2026-09-03 在真机上用
 * `0px / 160px / 3000px` 三个 margin 同时观测同一批卡,滚到三个位置,**三条读数
 * 一模一样**(`0000` / `0001` / `0110`)。所以:
 *
 *  · 现有的 `THUMBNAIL_OVERSCAN_MARGIN`(160px)对聊天里的产物卡是**不生效的**,
 *    卡是真的进了视口才开始加载;
 *  · 想按「离视口 N px」划一条回收线,除非把滚动容器当 root 传进来 —— 那要动
 *    ChatPane;而且屏幕越大留的越多,内存上界就不存在了。
 *
 * 按**最近可见时间**做 LRU 则只需要「现在看得见吗」这一个信号,裁剪反而帮了忙。
 * 而且它天然带迟滞:在视口边缘反复抖动的卡每次都刷新自己的时间戳,永远排在
 * 淘汰队尾。
 */
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { FileOpsSummary } from '../../../src/components/FileOpsSummary';
import { HtmlProjectCoverFrame } from '../../../src/components/project-cover';
import {
  ARTIFACT_CARD_LOAD_BUDGET,
  ARTIFACT_CARD_RETAIN_BUFFER,
  resetThumbnailLoadGateForTests,
} from '../../../src/lib/thumbnail-load-gate';
import type { FileOpEntry } from '../../../src/runtime/file-ops';

const entry = (path: string): FileOpEntry => ({
  path,
  fullPath: `/repo/${path}`,
  ops: ['write'],
  opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
  total: 1,
  status: 'done',
});

const entries = (n: number): FileOpEntry[] =>
  Array.from({ length: n }, (_v, i) => entry(`deliverable-${i}.html`));

// ── 可驱动的 IntersectionObserver ────────────────────────────────────────
// 真实浏览器里「卡在不在视口里」由滚动决定;jsdom 里由这个 stub 决定。每次
// `showOnly([...])` 就是一次滚动落位:被点名的卡可见,其余全部不可见。

type IORecord = {
  cb: IntersectionObserverCallback;
  elements: Set<Element>;
  observer: IntersectionObserver;
};

const ioRecords: IORecord[] = [];

class StubIntersectionObserver {
  private record: IORecord;
  constructor(cb: IntersectionObserverCallback) {
    this.record = { cb, elements: new Set(), observer: this as unknown as IntersectionObserver };
    ioRecords.push(this.record);
  }
  observe(el: Element): void {
    this.record.elements.add(el);
  }
  unobserve(el: Element): void {
    this.record.elements.delete(el);
  }
  disconnect(): void {
    this.record.elements.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function cardIndexOf(el: Element): number | null {
  const card = el.closest('[data-artifact-card]');
  const id = card?.getAttribute('data-testid') ?? '';
  const m = /^artifact-card-deliverable-(\d+)\.html$/.exec(id);
  const digits = m?.[1];
  return digits === undefined ? null : Number(digits);
}

/** 一次「滚动落位」:只有 `visible` 里的卡在视口里。 */
function showOnly(visible: number[]): void {
  const set = new Set(visible);
  for (const record of [...ioRecords]) {
    const entriesOut = [...record.elements].map((el) => {
      const idx = cardIndexOf(el);
      const isIntersecting = idx === null ? true : set.has(idx);
      return { isIntersecting, target: el } as unknown as IntersectionObserverEntry;
    });
    if (entriesOut.length === 0) continue;
    act(() => {
      record.cb(entriesOut, record.observer);
    });
  }
}

const flush = async (hops = 8): Promise<void> => {
  for (let i = 0; i < hops; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

function cardIframes(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>('iframe.artifact-card-frame')];
}

function mountedIndices(): number[] {
  return cardIframes()
    .map((f) => cardIndexOf(f))
    .filter((i): i is number => i !== null)
    .sort((a, b) => a - b);
}

/** 同时在飞(挂着但还没 load 完)的文档数 —— 就是并发预算管着的那一批。 */
function inFlightCount(settled: Set<Element>): number {
  return cardIframes().filter((frame) => !settled.has(frame)).length;
}

/** 把当前挂着的 iframe 全部标记成加载完成,腾出槽位。 */
async function settleAll(settled: Set<Element>): Promise<void> {
  for (let round = 0; round < 12; round++) {
    const pending = cardIframes().filter((f) => !settled.has(f));
    if (pending.length === 0) break;
    for (const frame of pending) {
      settled.add(frame);
      act(() => {
        frame.dispatchEvent(new Event('load'));
      });
    }
    await flush();
  }
}

/**
 * 走一趟「从头滚到尾」。每落位一次就把当前挂着的都加载完,再记一次读数。
 * `window` 是一屏能同时看见几张卡 —— 真机实测 594×476 的 `.chat-log`、
 * 173px 卡、181px 行距,一屏 2.6 行,也就是 5~6 张(错位时最多 8 张)。
 */
async function scrollThrough(
  total: number,
  window: number,
  settled: Set<Element>,
  onStep?: (top: number) => void,
): Promise<number[]> {
  const counts: number[] = [];
  for (let top = 0; top + window <= total; top += window) {
    showOnly(Array.from({ length: window }, (_v, i) => top + i));
    await flush(12);
    await settleAll(settled);
    counts.push(cardIframes().length);
    onStep?.(top);
  }
  return counts;
}

beforeEach(() => {
  ioRecords.length = 0;
  resetThumbnailLoadGateForTests();
  vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
});

afterEach(() => {
  cleanup();
  resetThumbnailLoadGateForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderCards(n: number, projectId: string): Promise<void> {
  render(<FileOpsSummary entries={entries(n)} projectId={projectId} />);
  await waitFor(() => {
    expect(screen.getAllByTestId('artifact-card-deliverable-0.html')).toHaveLength(1);
  });
  await flush(20);
}

describe('产物卡 iframe 的回收', () => {
  it('滚过一整条长会话之后,远远滚出视口的那些 iframe 不在 DOM 里了', async () => {
    await renderCards(24, 'proj-recycle');
    const settled = new Set<Element>();

    await scrollThrough(24, 6, settled);

    // 最后一屏是 18~23。它前面还有 `ARTIFACT_CARD_RETAIN_BUFFER` 张留作缓冲,
    // 再往前的必须已经被卸掉 —— 否则就是今天那个「只增不减」。
    const mounted = mountedIndices();
    const coldest = 18 - ARTIFACT_CARD_RETAIN_BUFFER;
    for (let i = 0; i < coldest; i++) {
      expect(mounted).not.toContain(i);
    }
    expect(mounted.length).toBeLessThan(24);
  });

  it('防真空①:同一套量法在**没有回收**的泳道上数出的是只增不减,在产物卡上才会回落', async () => {
    // 上半场是**对照组**:首页/设计页的项目网格走 background 泳道,这次一个字
    // 都没动它。同样一套「滚一遍 + 数 iframe」的量法,在那边必须读出单调增并
    // 一路涨到 12 —— 这证明这把尺子真的数得出数,下半场那条回落不是读成 0 混的。
    render(
      <>
        {Array.from({ length: 12 }, (_v, i) => (
          <span key={i} className="grid-cell">
            <GridFrame index={i} />
          </span>
        ))}
      </>,
    );
    await flush(20);

    const gridSettled = new Set<Element>();
    const gridCounts: number[] = [];
    for (let top = 0; top + 3 <= 12; top += 3) {
      showOnlyGrid([top, top + 1, top + 2]);
      await flush(12);
      for (const frame of gridIframes()) {
        if (gridSettled.has(frame)) continue;
        gridSettled.add(frame);
        act(() => {
          frame.dispatchEvent(new Event('load'));
        });
      }
      await flush(8);
      gridCounts.push(gridIframes().length);
    }
    for (let i = 1; i < gridCounts.length; i++) {
      expect(gridCounts[i]!).toBeGreaterThanOrEqual(gridCounts[i - 1]!);
    }
    expect(gridCounts.at(-1)).toBe(12);

    // 下半场是**实验组**:同一把尺子量产物卡。曲线必须先涨上去、封顶,再在滚到
    // 一屏只有两张卡的地方(真实会话 p50 就是 2 张)**回落** —— 而不是一路只增。
    cleanup();
    ioRecords.length = 0;
    resetThumbnailLoadGateForTests();

    await renderCards(24, 'proj-curve');
    const settled = new Set<Element>();
    const counts = await scrollThrough(24, 6, settled);
    expect(counts.length).toBeGreaterThan(2);

    const peak = Math.max(...counts);
    // 涨得动:峰值要真的越过缓冲区,否则「有上界」是句空话。
    expect(peak).toBeGreaterThan(ARTIFACT_CARD_RETAIN_BUFFER);
    // 有上界:任何一刻挂着的都不超过「这一屏 + 缓冲区」。
    expect(peak).toBeLessThanOrEqual(6 + ARTIFACT_CARD_RETAIN_BUFFER);

    // 回落:滚到一屏只剩两张卡的位置。
    showOnly([22, 23]);
    await flush(12);
    await settleAll(settled);
    const trough = cardIframes().length;
    expect(trough).toBeLessThan(peak);
    expect(trough).toBeLessThanOrEqual(2 + ARTIFACT_CARD_RETAIN_BUFFER);
  });

  it('防真空②:滚回去之后它**真的回来了**,不是卸掉就再也不回来', async () => {
    await renderCards(24, 'proj-return');
    const settled = new Set<Element>();

    await scrollThrough(24, 6, settled);
    expect(mountedIndices()).not.toContain(0);

    // 滚回开头
    showOnly([0, 1, 2, 3, 4, 5]);
    await flush(12);
    await settleAll(settled);

    expect(mountedIndices()).toContain(0);
    expect(mountedIndices()).toContain(5);
  });

  it('被回收掉的卡滚回来时是**重新排队**的,不是拿着上次那张通行证一起重挂', async () => {
    await renderCards(24, 'proj-requeue');
    const settled = new Set<Element>();

    await scrollThrough(24, 6, settled);
    expect(mountedIndices()).not.toContain(0);

    // 一次性滚回一整屏冷卡。槽位是 `settled` 的那一刻起就不再计入 `loadingCount`,
    // 所以如果回收没有把槽位还回去,这六张会**同时**重挂,直接绕过并发预算。
    showOnly([0, 1, 2, 3, 4, 5]);
    await flush(12);
    expect(inFlightCount(settled)).toBeGreaterThan(0);
    expect(inFlightCount(settled)).toBeLessThanOrEqual(ARTIFACT_CARD_LOAD_BUDGET);
  });

  it('被回收的那一格显示的是像素液体,不是灰块/占位/错误文案', async () => {
    await renderCards(24, 'proj-liquid-recycled');
    const settled = new Set<Element>();

    await scrollThrough(24, 6, settled);

    const recycled = screen.getByTestId('artifact-card-deliverable-0.html');
    expect(recycled.querySelector('iframe')).toBeNull();
    expect(recycled.querySelector('[data-testid="pixel-liquid"]')).not.toBeNull();
    expect(recycled.querySelector('.artifact-card-mini.is-loading')).not.toBeNull();
    // 「预览不可用 / 加载失败」那一族是产品 2026-09-02 明确否掉的。
    expect(recycled.querySelector('.artifact-card-thumb')?.textContent ?? '').toBe('');
  });
});

describe('反向对照:不许被这次改动弄坏的东西', () => {
  it('视口里的和缓冲区内的一张都没被卸', async () => {
    await renderCards(24, 'proj-keep');
    const settled = new Set<Element>();

    await scrollThrough(24, 6, settled);

    const mounted = mountedIndices();
    // 视口里的六张
    for (const i of [18, 19, 20, 21, 22, 23]) expect(mounted).toContain(i);
    // 紧挨着的缓冲区(最近看过的那一屏)也要还在 —— 这就是「缓冲」的意义
    for (const i of [12, 13, 14, 15, 16, 17]) expect(mounted).toContain(i);
  });

  it('有 coverUrl 的 <img> 卡一个都没被回收(它本来就没有 iframe)', async () => {
    render(
      <FileOpsSummary
        entries={entries(24)}
        projectId="proj-img"
        artifactRefs={Array.from({ length: 24 }, (_v, i) => ({
          label: `deliverable-${i}.html`,
          displayPolicy: 'latest_with_static_preview',
          snapshotState: 'ready',
          thumbnailUrl: `/api/chat-artifacts/d${i}/thumbnail`,
        }))}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('artifact-card-deliverable-0.html')).toHaveLength(1);
    });
    await flush(20);

    expect(document.querySelectorAll('img.artifact-card-media')).toHaveLength(24);
    await scrollThrough(24, 6, new Set<Element>());

    // 一张 <img> 都不许少,而且整条路上一个 iframe 都不该出现。
    expect(document.querySelectorAll('img.artifact-card-media')).toHaveLength(24);
    expect(cardIframes()).toHaveLength(0);
  });

  it('刚落地的并发预算没被破坏:整条滚动路径上同时在飞的从没超过 4', async () => {
    await renderCards(24, 'proj-budget');
    const settled = new Set<Element>();

    let peak = 0;
    let worstInFlight = 0;
    for (let top = 0; top + 6 <= 24; top += 6) {
      showOnly(Array.from({ length: 6 }, (_v, i) => top + i));
      await flush(12);
      worstInFlight = Math.max(worstInFlight, inFlightCount(settled));
      await settleAll(settled);
      peak = Math.max(peak, cardIframes().length);
    }

    // 量法自证:峰值必须真的越过缓冲区,否则「不超过 4」是句空话。
    expect(peak).toBeGreaterThan(ARTIFACT_CARD_RETAIN_BUFFER);
    expect(worstInFlight).toBeGreaterThan(0);
    expect(worstInFlight).toBeLessThanOrEqual(ARTIFACT_CARD_LOAD_BUDGET);
  });

  it('排队等槽位的那一格仍然是像素液体,不是灰块/占位/错误文案', async () => {
    await renderCards(24, 'proj-liquid');
    showOnly([0, 1, 2, 3, 4, 5]);
    await flush(12);

    const mounted = new Set(cardIframes().map((f) => f.closest('[data-artifact-card]')));
    const queued = [0, 1, 2, 3, 4, 5]
      .map((i) => screen.getByTestId(`artifact-card-deliverable-${i}.html`))
      .filter((card) => !mounted.has(card));
    expect(queued.length).toBeGreaterThan(0);

    for (const card of queued) {
      expect(card.querySelector('[data-testid="pixel-liquid"]')).not.toBeNull();
      expect(card.querySelector('.artifact-card-mini.is-loading')).not.toBeNull();
      expect(card.querySelector('.artifact-card-thumb')?.textContent ?? '').toBe('');
    }
  });

  it('小幅来回滚动不触发拆装 —— 这正是「缓冲」要挡住的那件事', async () => {
    await renderCards(24, 'proj-jitter');
    const settled = new Set<Element>();

    showOnly([0, 1, 2, 3, 4, 5]);
    await flush(12);
    await settleAll(settled);
    const before = new Map(
      cardIframes().map((f) => [cardIndexOf(f)!, f] as const),
    );
    expect(before.size).toBe(6);

    // 上下各晃一行,来回三趟
    for (let i = 0; i < 3; i++) {
      showOnly([2, 3, 4, 5, 6, 7]);
      await flush(10);
      await settleAll(settled);
      showOnly([0, 1, 2, 3, 4, 5]);
      await flush(10);
      await settleAll(settled);
    }

    // 原来那六张必须是**同一批 DOM 节点**:一次都没被拆过。
    for (const [idx, node] of before) {
      const now = cardIframes().find((f) => cardIndexOf(f) === idx);
      expect(now).toBe(node);
    }
  });
});

// ── 网格那条泳道的小工具(防真空①用)────────────────────────────────────

/** 首页/设计页网格那一支:不传 `ungated`、不传 `pendingContent`。 */
function GridFrame({ index }: { index: number }): ReactElement {
  return (
    <HtmlProjectCoverFrame
      src={`/api/projects/p/raw/grid-${index}.html`}
      initial="G"
      iframeClassName="thumb-iframe"
      glyphClassName="project-thumb-glyph"
      diagnostic={`grid-${index}`}
    />
  );
}

function gridIframes(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>('iframe.thumb-iframe')];
}

function showOnlyGrid(visible: number[]): void {
  const set = new Set(visible);
  for (const record of [...ioRecords]) {
    const out = [...record.elements].map((el) => {
      const host = el.closest('.grid-cell');
      const idx = host ? [...document.querySelectorAll('.grid-cell')].indexOf(host) : -1;
      return {
        isIntersecting: idx < 0 ? true : set.has(idx),
        target: el,
      } as unknown as IntersectionObserverEntry;
    });
    if (out.length === 0) continue;
    act(() => {
      record.cb(out, record.observer);
    });
  }
}
