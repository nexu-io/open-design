// @vitest-environment jsdom

/**
 * W80 · 产物卡片长时间空白。
 *
 * 现场(2026-09-02 实测,namespace `chatpanel`,真 Chrome):一个会话里同一份
 * `slow-thinking-one-pager.html` 出了 **4 张卡**(4 轮回答各出一张),4 张全部
 * 掉进降级支 —— desktop renderer 的 IPC socket 在纯 web 的开发运行时里根本不
 * 存在(`connect ENOENT /tmp/open-design/ipc/chatpanel/desktop.sock`),所以这
 * 一轮没有静态封面。
 *
 * 降级本身是产品定的,这里**不动**:没有当轮快照就用 live iframe 显示最新 html,
 * 不出占位、不写「预览不可用」(2026-09-02:「不允许退回不就一个错误文案显示在
 * 上面了?这感觉更奇怪呢」)。下面最后两条就是守这个的反向对照。
 *
 * 这里修的是降级支上两个**和产品裁决无关**的缺陷:
 *
 *  ① 同一个地址被并发探测 N 次。4 张卡 = 4 次一模一样的 HEAD。
 *  ② 卡面在 iframe **还没画出任何东西**的时候就把「加载中」撤掉了。
 *     `HtmlProjectCoverFrame` 在 HEAD 探测回来(实测 3~135ms)的那一刻就挂出
 *     iframe 并撤掉 pendingContent,可是 iframe 里那份文档 `<head>` 里有一条
 *     render-blocking 的 `<script src="https://cdn.tailwindcss.com">`,而这台
 *     机器上那个域名**打不通**(curl 70s 超时、零字节)。于是解析器一直被卡住,
 *     `.artifact-card-frame` 只剩自己的 `background: var(--bg-panel)` ——
 *     一块**空白**,实测 6~21 秒(用户那次 59 秒)。
 *
 *     `pendingContent` 自己的注释写着「**只在「还没加载出来」时用**」。今天的
 *     代码把它撤在 `verified`,不是 `loaded` —— 它违反的是自己的契约。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactCards } from '../../src/components/FileOpsSummary';
import { HtmlProjectCoverFrame } from '../../src/components/project-cover';
import { CollabProvider } from '../../src/collab/collab-context';
import { workspaceContextFixture } from '../helpers/workspace-context';

const PROJECT_ID = 'c7e3b234-2fb3-4f6e-8aae-a3a00697c476';
const raw = (name: string) => `/api/projects/${PROJECT_ID}/raw/${name}`;
const COVER = '/api/projects/p1/chat-artifact-snapshots/snap-html-1/thumbnail';

/*
 * jsdom 里没有 IntersectionObserver,`useInView` 直接判 true —— 降级支会真的
 * 走到底。HEAD 探测则必须打桩:默认 jsdom 的 `fetch('/api/...')` 会抛(相对
 * URL 没有 origin),那样 iframe 根本挂不出来,下面几条会**假绿**成「网络在
 * jsdom 里失败了」。
 */
function stubHeadProbe(): { headProbes: () => number } {
  const seen: RequestInit[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    seen.push(init ?? {});
    return new Response('', { status: 200 });
  });
  return { headProbes: () => seen.filter((init) => init.method === 'HEAD').length };
}

const flush = async (hops = 12): Promise<void> => {
  for (let i = 0; i < hops; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

function projectCollabValue() {
  return {
    workspaceContext: workspaceContextFixture({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    }),
    workspaceContextLoading: false,
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'allowed' as const,
    isOwner: false,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
  };
}

function renderCards(items: Parameters<typeof ArtifactCards>[0]['items']) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <ArtifactCards items={items} projectId={PROJECT_ID} />
    </CollabProvider>,
  );
}

const cardOf = (name: string) => screen.getByTestId(`artifact-card-${name}`);

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * ① 同一份产物出多张卡 —— 并发探测只该打一次
 * ------------------------------------------------------------------ */
describe('封面探测 · 重复请求', () => {
  /*
   * 防真空。下面那条要断言「4 张卡只打 1 次 HEAD」,可万一这把尺子根本数不出
   * 东西(fetch 没被走到、过滤条件写错、init 里压根没有 method),那条会**假绿**
   * 成 0 === 1 之外的任何巧合。所以先证明:4 个**不同**地址就是数出 4。
   */
  it('量法自证:四个不同地址的封面,探测计数确实数到 4', async () => {
    const probe = stubHeadProbe();
    render(
      <>
        {['a.html', 'b.html', 'c.html', 'd.html'].map((name) => (
          <HtmlProjectCoverFrame
            key={name}
            src={raw(name)}
            initial=""
            iframeClassName="artifact-card-frame"
            glyphClassName="artifact-card-mini"
            diagnostic={`p:${name}`}
            ungated
          />
        ))}
      </>,
    );
    await flush();

    expect(probe.headProbes()).toBe(4);
  });

  it('同一份产物在多轮回答里各出一张卡:并发探测只打一次', async () => {
    const probe = stubHeadProbe();
    render(
      <>
        {[0, 1, 2, 3].map((i) => (
          <HtmlProjectCoverFrame
            key={i}
            src={raw('slow-thinking-one-pager.html')}
            initial=""
            iframeClassName="artifact-card-frame"
            glyphClassName="artifact-card-mini"
            diagnostic={`p:slow-thinking-one-pager.html#${i}`}
            ungated
          />
        ))}
      </>,
    );
    await flush();

    // 实测线上是 4 次(外加 FileViewer 结构性的 2 次,合计 10)。
    expect(probe.headProbes()).toBe(1);
    // 合并的是**请求**,不是结果:4 张卡都得照常挂出自己的 iframe。
    await waitFor(() =>
      expect(document.querySelectorAll('iframe.artifact-card-frame')).toHaveLength(4),
    );
  });
});

/* ------------------------------------------------------------------ *
 * ② 空白:iframe 挂上了 ≠ 画出来了
 * ------------------------------------------------------------------ */
describe('降级卡面 · 加载中不是空白', () => {
  it('iframe 还没 load 完之前,卡面仍然是「加载中」,不是一块空白', async () => {
    stubHeadProbe();
    renderCards([{ name: 'slow-thinking-one-pager.html', kind: 'html' }]);

    const card = cardOf('slow-thinking-one-pager.html');
    const frame = await waitFor(() => {
      const found = card.querySelector<HTMLIFrameElement>('iframe.artifact-card-frame');
      expect(found, '降级支没挂出 live iframe').not.toBeNull();
      return found!;
    });

    /*
     * 这一刻:HEAD 已经回来,iframe 已经挂上,但它一个像素都还没画。今天的代码
     * 在这里已经把 PixelLiquid 撤掉了 —— 用户看到的就是 `.artifact-card-frame`
     * 自己的底色,一块空白,而且要空 6~59 秒。
     */
    expect(
      card.querySelector('[data-testid="pixel-liquid"]'),
      'iframe 还没 load,卡面就已经不是「加载中」了',
    ).not.toBeNull();
    expect(frame.style.visibility, '还没画出来的 iframe 不该压在加载态上面').toBe('hidden');

    await act(async () => {
      fireEvent.load(frame);
    });

    // 画出来了才交给 iframe。
    expect(card.querySelector('[data-testid="pixel-liquid"]')).toBeNull();
    expect(frame.style.visibility).not.toBe('hidden');
  });
});

/* ------------------------------------------------------------------ *
 * 反向对照 —— 这两条防的是「修快了,把产品行为一起改掉」
 * ------------------------------------------------------------------ */
describe('反向对照 · 产品行为原样', () => {
  it('有当轮快照时,卡面仍然走 <img>,没有被顺手改成 iframe', () => {
    stubHeadProbe();
    renderCards([{ name: 'deck.html', kind: 'html', coverUrl: COVER }]);

    const card = cardOf('deck.html');
    const img = card.querySelector<HTMLImageElement>('img.artifact-card-media');
    expect(img, '有 coverUrl 就该是静态截图 <img>').not.toBeNull();
    expect(img!.getAttribute('src')).toBe(COVER);
    expect(card.querySelector('iframe')).toBeNull();
  });

  it('没有当轮快照时,降级仍然是一张正常卡面:live iframe,不是占位/灰块/错误文案', async () => {
    stubHeadProbe();
    renderCards([{ name: 'landing.html', kind: 'html' }]);

    const card = cardOf('landing.html');
    const frame = await waitFor(() => {
      const found = card.querySelector<HTMLIFrameElement>('iframe.artifact-card-frame');
      expect(found).not.toBeNull();
      return found!;
    });
    // 降级读的是工作区**最新**那一份。
    expect(frame.getAttribute('src')).toBe(raw('landing.html'));
    // 不是文档卡那种「图标 + 文件名」的兜底。
    expect(card.querySelector('.artifact-card-doc')).toBeNull();
    // 一个字的失败文案都不许有。
    expect(card.textContent ?? '').not.toMatch(
      /失败|不可用|错误|无法|加载中|unavailable|failed|error|loading/i,
    );

    await act(async () => {
      fireEvent.load(frame);
    });
    // load 之后卡面就是那张 live iframe 本身,加载态退干净。
    expect(card.querySelector('[data-testid="pixel-liquid"]')).toBeNull();
    expect(card.querySelector('iframe.artifact-card-frame')).toBe(frame);
  });
});
