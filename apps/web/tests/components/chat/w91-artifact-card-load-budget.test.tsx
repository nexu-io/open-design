// @vitest-environment jsdom
/**
 * 产物卡的 live iframe 要有**自己的一份并发预算**。
 *
 * 用户 2026-09-02 预警的风险:「会话里的产物卡片如果一多,并且都是 live iframe,
 * 那感觉首次加载会造成非常多的重复请求」。实测下来这条是真的:
 *
 *  · 真实数据里一条 assistant 消息最多产出 28 张卡(其中 13 张 html);一个会话
 *    p90 是 7 张、p50 是 2 张(7 个打包/开发数据库、45 个带卡会话)。
 *  · daemon 的 raw 路由发的是 `Cache-Control: no-cache`,所以**同一个文件的 N 张卡
 *    不省请求**:实测 8 张同文件卡 = 8 次文档请求(1×200 + 7×304),外加 8 次
 *    页面自己的外链请求 —— 每个 iframe 都是独立文档,各自把脚本再跑一遍。
 *  · `loading="lazy"` 几乎拦不住:900px 视口、24 张卡、不滚动,实测**一次起飞 16 个**。
 *  · `useInView` 默认 `once: true`,挂上去的 iframe **不会卸载**,滚过去只增不减。
 *
 * 而它当初绕过 `thumbnail-load-gate` 是有正当理由的:那道闸在**进项目路由时会被
 * 挂起**(`App.tsx: if (route.kind === 'project') suspendThumbnailLoads()`),而产物卡
 * 恰恰住在项目路由上 —— 走那道闸就永远拿不到槽位。
 *
 * 「有预算」和「会被挂起」本来是两件事,以前被同一个开关捆在一起。这个文件钉的是
 * 拆开之后的两半都成立:**有自己的预算,且不被项目路由挂起。**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileOpsSummary } from '../../../src/components/FileOpsSummary';
import {
  ARTIFACT_CARD_LOAD_BUDGET,
  THUMBNAIL_LOAD_BUDGET,
  resetThumbnailLoadGateForTests,
  resumeThumbnailLoads,
  suspendThumbnailLoads,
} from '../../../src/lib/thumbnail-load-gate';
import { HtmlProjectCoverFrame } from '../../../src/components/project-cover';
import type { FileOpEntry } from '../../../src/runtime/file-ops';

const entry = (path: string): FileOpEntry => ({
  path,
  fullPath: `/repo/${path}`,
  ops: ['write'],
  opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
  total: 1,
  status: 'done',
});

/** N 张 html 产物卡 —— 每张一个不同的文件,和真实「一轮产出一批」的形状一致。 */
const entries = (n: number): FileOpEntry[] =>
  Array.from({ length: n }, (_v, i) => entry(`deliverable-${i}.html`));

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

/**
 * **同时在飞**的产物卡文档数。
 *
 * jsdom 不会自己把 iframe 加载完,所以「挂在文档里、还没被 `fireEvent.load` 打过」
 * 就是「还在飞」。这正是真实浏览器里占着连接、占着渲染器的那一批。
 */
function inFlightCount(settled: Set<Element>): number {
  return cardIframes().filter((frame) => !settled.has(frame)).length;
}

/** 把当前挂着的 iframe 全部标记成加载完成,腾出槽位。 */
async function settleAll(settled: Set<Element>): Promise<void> {
  for (const frame of cardIframes()) {
    if (settled.has(frame)) continue;
    settled.add(frame);
    fireEvent.load(frame);
  }
  await flush();
}

beforeEach(() => {
  resetThumbnailLoadGateForTests();
  // 封面挂 iframe 之前会先 HEAD 验一下文件在不在
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
});

afterEach(() => {
  cleanup();
  resetThumbnailLoadGateForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('产物卡的并发预算', () => {
  it('12 张卡同时进视口,同时在飞的 iframe 文档正好停在预算上', async () => {
    render(<FileOpsSummary entries={entries(12)} projectId="proj-budget" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('artifact-card-deliverable-0.html')).toHaveLength(1);
    });
    await flush(20);

    const settled = new Set<Element>();
    /*
     * 用 `toBe` 而不是 `toBeLessThanOrEqual`:量法必须**数得出**这个数。
     * 一个坏掉的量法(选择器写错、卡根本没渲染)会读成 0,而 0 是能通过
     * 「不超过预算」的 —— 那种绿是假的。这里要求它**恰好顶到预算**。
     */
    expect(inFlightCount(settled)).toBe(ARTIFACT_CARD_LOAD_BUDGET);
  });

  it('排队的那些最终全部加载,没有一张被丢掉', async () => {
    render(<FileOpsSummary entries={entries(12)} projectId="proj-drain" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('artifact-card-deliverable-0.html')).toHaveLength(1);
    });
    await flush(20);

    const settled = new Set<Element>();
    const seen = new Set<string>();
    for (let round = 0; round < 20 && seen.size < 12; round++) {
      for (const frame of cardIframes()) seen.add(frame.getAttribute('src') ?? '');
      expect(inFlightCount(settled)).toBeLessThanOrEqual(ARTIFACT_CARD_LOAD_BUDGET);
      await settleAll(settled);
    }
    for (const frame of cardIframes()) seen.add(frame.getAttribute('src') ?? '');

    // 限流到 K 之后把剩下的丢掉,也能过上面那条「不超过预算」——
    // 所以这里必须钉「12 个 src 全部真的挂过 iframe」。
    expect(seen.size).toBe(12);
  });

  it('进项目路由把缩略图闸挂起时,产物卡照样拿得到槽位', async () => {
    suspendThumbnailLoads(); // App.tsx 进项目时做的事
    render(<FileOpsSummary entries={entries(12)} projectId="proj-suspended" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('artifact-card-deliverable-0.html')).toHaveLength(1);
    });
    await flush(20);

    // 这是它当初绕过那道闸的**全部理由**:改完必须仍然成立。
    expect(inFlightCount(new Set())).toBe(ARTIFACT_CARD_LOAD_BUDGET);
    resumeThumbnailLoads();
  });
});

describe('首页/设计页那条闸没有被改动', () => {
  /** 项目网格那一支:不传 `ungated`、不传 `pendingContent`。 */
  function renderGrid(n: number) {
    return render(
      <>
        {Array.from({ length: n }, (_v, i) => (
          <HtmlProjectCoverFrame
            key={i}
            src={`/api/projects/p/raw/grid-${i}.html`}
            initial="G"
            iframeClassName="thumb-iframe"
            glyphClassName="project-thumb-glyph"
            diagnostic={`grid-${i}`}
          />
        ))}
      </>,
    );
  }

  function gridIframes(): HTMLIFrameElement[] {
    return [...document.querySelectorAll<HTMLIFrameElement>('iframe.thumb-iframe')];
  }

  it('网格仍然用原来那份 6 的预算,不是产物卡那份', async () => {
    renderGrid(12);
    await flush(20);
    expect(gridIframes()).toHaveLength(THUMBNAIL_LOAD_BUDGET);
    expect(THUMBNAIL_LOAD_BUDGET).not.toBe(ARTIFACT_CARD_LOAD_BUDGET);
  });

  it('网格仍然会被「进项目就挂起」收走槽位', async () => {
    renderGrid(12);
    await flush(20);
    expect(gridIframes().length).toBeGreaterThan(0);

    act(() => {
      suspendThumbnailLoads();
    });
    await flush();
    expect(gridIframes()).toHaveLength(0);
    resumeThumbnailLoads();
  });
});

describe('降级仍然是一张正常卡面', () => {
  it('有 coverUrl 时走 <img>,卡里一个 iframe 都没有', async () => {
    render(
      <FileOpsSummary
        entries={[entry('shot.html')]}
        projectId="proj-cover"
        artifactRefs={[
          {
            label: 'shot.html',
            displayPolicy: 'latest_with_static_preview',
            snapshotState: 'ready',
            thumbnailUrl: '/api/chat-artifacts/shot/thumbnail',
          },
        ]}
      />,
    );
    await flush(20);

    const card = screen.getByTestId('artifact-card-shot.html');
    expect(card.querySelector('img.artifact-card-media')).not.toBeNull();
    expect(card.querySelector('iframe')).toBeNull();
  });

  it('排队等槽位时卡面是像素液体,不是灰块/占位文案', async () => {
    render(<FileOpsSummary entries={entries(12)} projectId="proj-liquid" />);
    await waitFor(() => {
      expect(screen.getAllByTestId('artifact-card-deliverable-0.html')).toHaveLength(1);
    });
    await flush(20);

    const mounted = new Set(cardIframes().map((f) => f.closest('[data-artifact-card]')));
    const queued = [...document.querySelectorAll('[data-artifact-card]')].filter(
      (card) => !mounted.has(card),
    );
    expect(queued.length).toBeGreaterThan(0);

    for (const card of queued) {
      // 加载态是产品选的像素液体(2026-08-26),排队等槽位就是「还没加载出来」。
      expect(card.querySelector('[data-testid="pixel-liquid"]')).not.toBeNull();
      expect(card.querySelector('.artifact-card-mini.is-loading')).not.toBeNull();
      // 缩略图那一格里不许出现任何文案 ——「预览不可用 / 加载失败」那一族是
      // 产品 2026-09-02 明确否掉的(卡面右上角的〔导出〕是卡壳本来的动作,不算)。
      expect(card.querySelector('.artifact-card-thumb')?.textContent ?? '').toBe('');
    }
  });
});
