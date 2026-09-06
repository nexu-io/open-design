// @vitest-environment jsdom
/**
 * Plane OPEND-2552 —— 「点击 Share 和 Export 按钮:点击一下应该展开,再点击一下
 * 应该关闭这个面板」。
 *
 * 产物动作面板有**两个入口**,共用同一块 `deployMenuOpen` 弹层:
 *
 *  · 产物卡上那两枚胶囊 → `shareRequest` / `downloadRequest` 信号
 *    (`FileViewer.share-request-replay.test.tsx` 已经守住那条路的开 / 关 / 再开);
 *  · **预览区右上角**那两枚 `chrome-action-unified` 按钮 → `openUnifiedActionMenu`。
 *
 * 这个文件守的是**第二条路**,以及它和第一条路共用的那几条收起语义:
 *
 *  1. 同一枚按钮第二次点击 = 收起,第三次 = 再展开;
 *  2. Share 与 Export 是**同一块面板的两个页签**,不是两块面板 —— 开着 Share 时
 *     点 Export 换页签而不是叠出第二块,反之亦然(互斥的另一种写法);
 *  3. Esc 收起;
 *  4. 点面板和按钮**之外**的地方收起 —— 但按钮自身那一下 `mousedown` 不算
 *     「外部」,否则 `mousedown` 先关、`click` 再开,用户会看到「点了没反应」。
 *
 * 为什么不是断言 `data-testid`:线上这块菜单没有 testid,按 testid 查恒为 null,
 * 每条断言都会假绿(`share-request-replay` 那个文件的第一版就这么翻过车)。这里
 * 一律认菜单里**只在展开时才存在**的 `menuitem` 行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FileViewer } from '../../src/components/FileViewer';
import { resetConsumedActionRequestsForTests } from '../../src/runtime/action-request';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
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
  } as ProjectFile;
}

/** 分享面板挂上之后才发的那几个请求;不喂它们 `canShare` 永远为假,按钮压根不出现。 */
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/deployments')) return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    if (url.includes('/deploy/config')) return new Response(JSON.stringify({ providerId: 'cloudflare-pages', configured: false }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  }));
}

function renderViewer() {
  return render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
    />,
  );
}

/** 展开时才存在的分享行。 */
const sharePanel = () => screen.queryByRole('menuitem', { name: /Get a share link|Deploy to Cloudflare Pages/i });
/** 展开时才存在的导出行。 */
const exportPanel = () => screen.queryByRole('menuitem', { name: /Export as PDF/i });
/** 整块面板 —— 用来数「有没有叠出第二块」。 */
const panels = () => document.querySelectorAll('.chrome-unified-popover');

/**
 * 右上角那两枚按钮。`chrome-action-unified` 是它们独有的类,按名字查会撞上
 * 预览区里别的 Export 入口。
 */
function toolbarAction(label: 'Share' | 'Export'): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>(
    `button.chrome-action-unified[aria-label="${label}"]`,
  );
  if (!node) throw new Error(`toolbar ${label} button not rendered`);
  return node;
}

async function waitForToolbar(): Promise<void> {
  await waitFor(() => expect(document.querySelector('button.chrome-action-unified[aria-label="Share"]')).not.toBeNull());
}

describe('OPEND-2552 · 右上角 Share / Export 是可反复开关的入口', () => {
  it('Share:点开 → 再点收起 → 三点再开', async () => {
    stubFetch();
    renderViewer();
    await waitForToolbar();

    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel(), '第一次点 Share 没有展开面板').not.toBeNull());
    expect(toolbarAction('Share')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel(), '第二次点 Share 没有收起面板').toBeNull());
    expect(toolbarAction('Share')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel(), '收起之后再也打不开了').not.toBeNull());
  });

  it('Export:点开 → 再点收起 → 三点再开', async () => {
    stubFetch();
    renderViewer();
    await waitForToolbar();

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() => expect(exportPanel(), '第一次点 Export 没有展开面板').not.toBeNull());
    expect(toolbarAction('Export')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() => expect(exportPanel(), '第二次点 Export 没有收起面板').toBeNull());
    expect(toolbarAction('Export')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() => expect(exportPanel(), '收起之后再也打不开了').not.toBeNull());
  });

  it('两枚互斥:开着 Share 时点 Export 换页签,不叠出第二块面板', async () => {
    stubFetch();
    renderViewer();
    await waitForToolbar();

    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel()).not.toBeNull());
    expect(panels()).toHaveLength(1);

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() => expect(exportPanel(), '点 Export 没有换到导出页签').not.toBeNull());
    expect(sharePanel(), '换页签之后分享那一份还在，等于两块面板叠着').toBeNull();
    expect(panels(), '叠出了第二块面板').toHaveLength(1);
    expect(toolbarAction('Share')).toHaveAttribute('aria-expanded', 'false');
    expect(toolbarAction('Export')).toHaveAttribute('aria-expanded', 'true');

    // 反向:回到 Share 也只是换页签
    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel()).not.toBeNull());
    expect(exportPanel()).toBeNull();
    expect(panels()).toHaveLength(1);
  });

  it('Esc 收起', async () => {
    stubFetch();
    renderViewer();
    await waitForToolbar();

    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel()).not.toBeNull());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(sharePanel(), 'Esc 没有收起面板').toBeNull());
  });

  it('点面板之外收起', async () => {
    stubFetch();
    renderViewer();
    await waitForToolbar();

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() => expect(exportPanel()).not.toBeNull());

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    await waitFor(() => expect(exportPanel(), '点面板外部没有收起').toBeNull());
    outside.remove();
  });

  it('按钮自己那一下 mousedown 不算「外部」—— 否则先关再开,看着像点了没反应', async () => {
    stubFetch();
    renderViewer();
    await waitForToolbar();

    // 完整的一次交互:mousedown → mouseup → click
    fireEvent.mouseDown(toolbarAction('Share'));
    fireEvent.mouseUp(toolbarAction('Share'));
    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel(), '第一整次点击没有把面板打开').not.toBeNull());

    // 第二次完整点击必须收起(而不是「mousedown 关掉 + click 又开」净效果不变)
    fireEvent.mouseDown(toolbarAction('Share'));
    fireEvent.mouseUp(toolbarAction('Share'));
    fireEvent.click(toolbarAction('Share'));
    await waitFor(() => expect(sharePanel(), '带 mousedown 的第二次点击没有收起').toBeNull());
  });
});
