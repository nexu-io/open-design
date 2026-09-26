// @vitest-environment jsdom
/**
 * 分享 / 导出菜单**不许自己弹出来**。
 *
 * 用户 2026-08-27:「这个弹窗动不动自己弹出来... 我感觉要么如果 publish 按钮
 * 出画面再回来, 就不再重新显示吧, 感觉这里重新显示会有 bug」。截图里那块
 * QUICK SHARE 菜单悬在产物卡上方,而用户并没有点任何按钮。
 *
 * 成因不在浮层定位,在**请求信号的消费方式**:
 *
 *  · `shareRequest` / `downloadRequest` 是 `ProjectView` 的状态,带一个
 *    `nonce`,**从设上之后再也不清空**(全仓只有 `setShareRequest({...})`,
 *    没有一处置 null)。
 *  · `FileViewer` 用一个**组件内的 `useRef`** 记「这个 nonce 已经消费过了」。
 *    ref 随组件一起死 —— `FileViewer` 一旦卸载重挂(切标签页、切文件、
 *    工作区重挂),它就归零,而那个 nonce 还在父组件里躺着,于是**旧请求被当成
 *    新请求重放一次**,菜单自己开出来。
 *
 * 同一个坑仓库里已经踩过一次并且修好了 —— `runtime/slide-nav.ts` 的 docblock
 * 逐字写着这件事:「A per-mount ref would only suppress replays for the current
 * mount: leaving the deck tab and coming back remounts HtmlViewer, the ref
 * resets, and the stale nonce reads as fresh」。分享/导出这两条只是没跟上。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { FileOpsSummary } from '../../src/components/FileOpsSummary';
import { nextShareRequestNonce } from '../../src/components/share-request-nonce';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FileViewer } from '../../src/components/FileViewer';
import { resetConsumedActionRequestsForTests } from '../../src/runtime/action-request';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-action-request-test-anchor]').forEach((node) => node.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  // 消费记录是模块级的(这正是它的意义),所以用例之间必须清干净
  resetConsumedActionRequestsForTests();
});

function htmlFile(): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1, kind: 'html', title: 'Page', entry: 'index.html',
      renderer: 'html', exports: ['html'],
    },
  };
}

/** 分享面板真正挂上之后才有的那些请求;不喂它们 `source` 是 null,`canShare` 永远为假。 */
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/deployments')) return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    if (url.includes('/deploy/config')) return new Response(JSON.stringify({ providerId: 'cloudflare-pages', configured: false }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  }));
}

function renderViewer(shareRequest: { nonce: number; anchorId?: string } | null) {
  return render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
      shareRequest={shareRequest}
    />,
  );
}

function viewerWithActionRequest({
  shareRequest = null,
  downloadRequest = null,
}: {
  shareRequest?: { nonce: number; anchorId?: string } | null;
  downloadRequest?: { nonce: number; anchorId?: string } | null;
}) {
  return (
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
      shareRequest={shareRequest}
      downloadRequest={downloadRequest}
    />
  );
}

/*
 * `FileViewer` 并不给 `AnchoredMenuShell` 传 `testId`,所以线上那块菜单没有
 * `data-testid` —— 按 testid 查会**恒为 null**,那样每一条断言都会「绿」得毫无
 * 意义(第一版就是这么假绿的)。认分享面板展开时的标题，不依赖权限门控或二级部署行。
 */
const menu = () => screen.queryByRole('heading', { name: 'Share', level: 2 });
const exportMenu = () => screen.queryByRole('menuitem', { name: /Export as PDF/i });
const anchoredMenu = () => document.querySelector('[data-anchored-menu]');

function mountActionAnchor(anchorId: string): void {
  const anchor = document.createElement('button');
  anchor.setAttribute('data-action-request-test-anchor', 'true');
  anchor.setAttribute('data-artifact-anchor', anchorId);
  anchor.getBoundingClientRect = () => ({
    x: 220,
    y: 300,
    left: 220,
    top: 300,
    right: 278,
    bottom: 328,
    width: 58,
    height: 28,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(anchor);
}

describe('产物卡 Share / Export 请求是可反复开关的入口', () => {
  it('passes the real card anchor through the existing request to one Share panel after generation', async () => {
    stubFetch();
    function CardAndViewer({ live }: { live: boolean }) {
      const [request, setRequest] = useState<{ nonce: number; anchorId: string } | null>(null);
      return <>
        <FileOpsSummary
          projectId="project-1"
          entries={[{ path: 'index.html', fullPath: '/repo/index.html', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 }, total: 1, status: 'done' }]}
          turnIsLive={live}
          onPublish={(name, anchorId) => {
            expect(name).toBe('index.html');
            setRequest({ nonce: Date.now(), anchorId });
          }}
        />
        {viewerWithActionRequest({ shareRequest: request })}
      </>;
    }
    const view = render(<CardAndViewer live />);
    const share = screen.getByTestId('artifact-card-publish-index.html');
    share.getBoundingClientRect = () => ({ x: 220, y: 300, left: 220, top: 300, right: 278, bottom: 328, width: 58, height: 28, toJSON: () => ({}) });
    const anchor = share.getAttribute('data-artifact-anchor');
    expect(share).toBeDisabled();
    fireEvent.click(share);
    expect(anchoredMenu()).toBeNull();
    view.rerender(<CardAndViewer live={false} />);
    expect(screen.getAllByTestId('artifact-card-publish-index.html')).toHaveLength(1);
    expect(share).toHaveAttribute('data-artifact-anchor', anchor);
    expect(share).toBeEnabled();
    fireEvent.click(share);
    await waitFor(() => expect(anchoredMenu()).not.toBeNull());
    expect(document.querySelectorAll('[data-anchored-menu]')).toHaveLength(1);
    expect(document.querySelectorAll('.chrome-unified-panel--share')).toHaveLength(1);
  });

  it('F13 real artifact-card Share reopens after the panel Close button at the same millisecond', async () => {
    stubFetch();
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000);
    const seen: number[] = [];
    function CardAndViewer() {
      const [request, setRequest] = useState<{ nonce: number; anchorId: string } | null>(null);
      return <>
        <FileOpsSummary
          projectId="project-1"
          entries={[{ path: 'index.html', fullPath: '/repo/index.html', ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 }, total: 1, status: 'done' }]}
          turnIsLive={false}
          onPublish={(name, anchorId) => {
            expect(name).toBe('index.html');
            setRequest(previous => {
              const nonce = nextShareRequestNonce(previous?.nonce, Date.now());
              seen.push(nonce);
              return { nonce, anchorId };
            });
          }}
        />
        {viewerWithActionRequest({ shareRequest: request })}
      </>;
    }
    render(<CardAndViewer />);
    const cardShare = screen.getByTestId('artifact-card-publish-index.html');
    cardShare.getBoundingClientRect = () => ({ x: 220, y: 300, left: 220, top: 300, right: 278, bottom: 328, width: 58, height: 28, toJSON: () => ({}) });
    fireEvent.click(cardShare);
    await waitFor(() => expect(anchoredMenu()).not.toBeNull());
    expect(document.querySelectorAll('.chrome-unified-panel--share')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(anchoredMenu()).toBeNull());
    expect(document.querySelectorAll('.chrome-unified-panel--share')).toHaveLength(0);
    fireEvent.click(cardShare);
    await waitFor(() => expect(anchoredMenu()).not.toBeNull());
    expect(document.querySelectorAll('.chrome-unified-panel--share')).toHaveLength(1);
    expect(seen).toEqual([1710000000000, 1710000000001]);
    expect(document.querySelector('.social-share-grid')).toBeNull();
  });

  it('Share 同一枚入口点第二次关闭，第三次可再打开', async () => {
    stubFetch();
    const anchorId = 'publish:index.html';
    mountActionAnchor(anchorId);
    const view = render(viewerWithActionRequest({
      shareRequest: { nonce: 1, anchorId },
    }));

    await waitFor(() => expect(anchoredMenu()).not.toBeNull());

    view.rerender(viewerWithActionRequest({
      shareRequest: { nonce: 2, anchorId },
    }));
    await waitFor(() => expect(anchoredMenu(), '第二次点 Share 没有关闭面板').toBeNull());

    view.rerender(viewerWithActionRequest({
      shareRequest: { nonce: 3, anchorId },
    }));
    await waitFor(() => expect(anchoredMenu(), '第三次点 Share 没有重新打开面板').not.toBeNull());
  });

  it('Export 同一枚入口点第二次关闭，第三次可再打开', async () => {
    stubFetch();
    const anchorId = 'export:index.html';
    mountActionAnchor(anchorId);
    const view = render(viewerWithActionRequest({
      downloadRequest: { nonce: 11, anchorId },
    }));

    await waitFor(() => expect(exportMenu()).not.toBeNull());
    expect(anchoredMenu()).not.toBeNull();

    view.rerender(viewerWithActionRequest({
      downloadRequest: { nonce: 12, anchorId },
    }));
    await waitFor(() => expect(anchoredMenu(), '第二次点 Export 没有关闭面板').toBeNull());

    view.rerender(viewerWithActionRequest({
      downloadRequest: { nonce: 13, anchorId },
    }));
    await waitFor(() => expect(exportMenu(), '第三次点 Export 没有重新打开面板').not.toBeNull());
  });
});

describe('分享请求只许消费一次 —— 重挂之后不许重放', () => {
  it('同一个 nonce 在 FileViewer 重挂之后**不许**再把菜单开出来', async () => {
    const request = { nonce: 1730000000000 };

    stubFetch();
    const first = renderViewer(request);
    await waitFor(() => expect(menu()).not.toBeNull());
    // 用户看完关掉(或者锚点滚走被自动收起)——总之这一轮结束了
    first.unmount();

    // 切个标签页再回来:FileViewer 重挂,而父组件里那个 shareRequest 原封不动
    renderViewer(request);
    // 给 effect 和 canShare 翻真留出时间
    await new Promise((r) => setTimeout(r, 60));
    expect(menu(), '旧的分享请求在重挂后又把菜单开了一次').toBeNull();
  });

  it('**新的** nonce 仍旧要开(反向对照:别把消费记录锁死)', async () => {
    stubFetch();
    const first = renderViewer({ nonce: 1730000000000 });
    await waitFor(() => expect(menu()).not.toBeNull());
    first.unmount();

    // 用户又点了一次 —— `Date.now()` 给出新的 nonce
    renderViewer({ nonce: 1730000009999 });
    await waitFor(() => expect(menu(), '新请求被旧的消费记录挡掉了').not.toBeNull());
  });

  it('首次那一轮当然要开(反向对照:证明上面两条不是因为根本没开过)', async () => {
    stubFetch();
    renderViewer({ nonce: 1730000000000 });
    await waitFor(() => expect(menu()).not.toBeNull());
  });

  it('没有请求时不该有菜单(空对照)', async () => {
    stubFetch();
    renderViewer(null);
    await new Promise((r) => setTimeout(r, 60));
    expect(menu()).toBeNull();
  });
});

/* 工具栏入口必须开在自身旁边，而不是复用上次的产物卡锚点。 */
describe('工具栏入口切换锚点', () => {
  it('卡上开过一次之后,点工具栏 Share 在工具栏旁打开顶层浮层', async () => {
    stubFetch();
    renderViewer({ nonce: 1730000000000, anchorId: 'publish:index.html' });
    // 卡上那枚按钮不在 DOM 里(聊天流没渲染),锚点落空 —— 菜单不画
    await new Promise((r) => setTimeout(r, 60));

    // 用户改用工具栏上的 Share
    const shareBtn = await screen.findByRole('button', { name: /^share$/i });
    shareBtn.click();

    await waitFor(() => expect(menu(), '点了工具栏却没开出菜单').not.toBeNull());
    const portal = document.querySelector('[data-anchored-menu]');
    expect(portal).not.toBeNull();
    expect(portal?.parentElement).toBe(document.body);
    expect(portal?.getAttribute('data-anchored-menu')).toBe(shareBtn.getAttribute('data-artifact-anchor'));
    expect(portal?.getAttribute('data-anchored-menu')).not.toBe('publish:index.html');
  });
});
