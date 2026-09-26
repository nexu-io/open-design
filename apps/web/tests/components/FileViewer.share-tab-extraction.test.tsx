// @vitest-environment jsdom
/**
 * 阶段 0 · Z11a —— 摘出 `ShareTab` 之前的回归网。
 *
 * Z11b 要把 HtmlViewer 的分享页签整块搬到
 * `apps/web/src/components/share/ShareTab.tsx`，约定是**只搬不改、行为逐字不变**。
 * 「逐字不变」这句话今天没有任何东西能验证 —— 现有的 FileViewer 测试覆盖的是
 * deck preview / srcdoc refresh / readonly save，`action-menu-toggle` 守的是
 * 弹层的**开关语义**（它自己写明「线上这块菜单没有 testid」），**面板内部长什么样
 * 零覆盖**。
 *
 * 所以这里存的是**整棵子树的 HTML 基线**，逐字节比对。它比逐条断言更适合这个
 * 用途：逐条断言只能守住我想得到的那几条，基线守的是整棵子树，包括我没想到的
 * 那些 class、属性顺序和条件分支。
 *
 * ⚠️ 为什么不用 `toMatchSnapshot`：这个仓的 apps/web 里**一个 vitest 快照都没有**，
 * 快照客户端在当前 config 下没初始化（`SnapshotClient.setup()` 报错）。而且固定
 * 基线文件更适合本任务 —— **没有 `-u` 这个逃生口**，改了就是红的，只能改回去。
 *
 * ⚠️ 两份基线，缺一不可：
 *  · `personal` —— 没有工作区身份。此时面板展示登录提示，不渲染团队可见范围或生成链接。
 *  · `team` —— 有团队工作区身份。此时才渲染**工作区可见范围**与**发布**两段，
 *    也就是分享功能真正要动的那部分。
 * 只存 personal 那一份等于放着三分之二的面板不设防。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
} from '@open-design/contracts';

import { FileViewer } from '../../src/components/FileViewer';
import { TooltipLayer } from '../../src/components/TooltipLayer';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { resetConsumedActionRequestsForTests } from '../../src/runtime/action-request';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { TEAM_PROJECTS_CHANGED_EVENT } from '../../src/collab/useWorkspaceContext';
import { PROJECT_SHARE_HISTORY_CHANGED_EVENT } from '../../src/components/share/share-publication-events';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  resetConsumedActionRequestsForTests();
});

const FIXTURES = resolve(__dirname, '../fixtures/share-tab');

function baseline(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8');
}

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
function stubFetch(published = false, historicalUrl?: string) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    // Keep the production local social payload fallback instead of returning a malformed payload.
    if (url.includes('/social-share')) return new Response('{}', { status: 503 });
    if (url.includes('publish-public')) {
      const publication = { url: 'https://open-design.ai/artifact/project-1/stable-slug', slug: 'stable-slug', fileName: 'index.html' };
      if (init?.method === 'POST') return new Response(JSON.stringify(publication), { status: 200 });
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response(JSON.stringify({ publication: published ? { ...publication, url: historicalUrl ?? publication.url, slug: historicalUrl ? 'historical-slug' : publication.slug } : null }), { status: 200 });
    }
    if (url.includes('/deployments')) return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    if (url.includes('/deploy/config')) return new Response(JSON.stringify({ providerId: 'cloudflare-pages', configured: false }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: 'team-workspace-a',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
}

function collabValue(workspaceContext: WorkspaceCollabContext | null): CollabContextValue {
  return {
    workspaceContext,
    workspaceContextLoading: false,
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'allowed',
    isOwner: true,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => {},
    requestPublish: () => {},
    refreshPresence: () => {},
    checkStatusNow: () => {},
  };
}

function renderViewer(workspaceContext: WorkspaceCollabContext | null, options: { streaming?: boolean; viewerOnly?: boolean; shareRequest?: { nonce: number; anchorId: string } } = {}) {
  const viewer = (
    <>
    {options.shareRequest ? <button data-artifact-anchor={options.shareRequest.anchorId}>Card Share</button> : null}
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
      streaming={options.streaming}
      viewerOnly={options.viewerOnly}
      shareRequest={options.shareRequest}
    />
    </>
  );
  if (!workspaceContext) return render(viewer);
  return render(<CollabProvider value={collabValue(workspaceContext)}>{viewer}</CollabProvider>);
}

it('does not issue a stop request from a read-only published HTML share panel', async () => {
  const request = stubFetch(true);
  const context = teamContext();
  const file = htmlFile();
  function Host({ readOnly }: { readOnly: boolean }) {
    return <CollabProvider value={collabValue(context)}><FileViewer projectId="project-1" projectKind="prototype" file={file} liveHtml="<html><body>Hello</body></html>" viewerOnly={readOnly} /></CollabProvider>;
  }
  const { rerender } = render(<Host readOnly={false} />);
  fireEvent.click(toolbarAction('Share'));
  expect(await screen.findByRole('switch', { name: /link access/i })).toHaveAttribute('aria-checked', 'true');
  rerender(<Host readOnly />);
  // Viewer-only permission cannot turn link access off or issue an owner-only
  // stop request. S13 signed-out known-URL retention has its own mounted spec.
  await waitFor(() => expect(screen.getByRole('switch', { name: /link access/i })).toBeDisabled());
  expect(screen.getByRole('switch', { name: /link access/i })).toHaveAttribute('aria-checked', 'true');
  expect(request.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
});

function toolbarAction(label: 'Share' | 'Export'): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>(
    `button.chrome-action-unified[aria-label="${label}"]`,
  );
  if (!node) throw new Error(`toolbar ${label} button not rendered`);
  return node;
}

async function openSharePanel(
  workspaceContext: WorkspaceCollabContext | null = null,
): Promise<HTMLElement> {
  stubFetch();
  renderViewer(workspaceContext);
  await waitFor(() =>
    expect(document.querySelector('button.chrome-action-unified[aria-label="Share"]')).not.toBeNull(),
  );
  fireEvent.click(toolbarAction('Share'));
  await waitFor(() => expect(document.querySelector('.chrome-unified-panel--share')).not.toBeNull());
  return document.querySelector<HTMLElement>('.chrome-unified-panel--share')!;
}

describe('Z11a · ShareTab 搬动前的 DOM 基线', () => {
  it('个人工作区:面板只有自有托管部署那一段,逐字节不变', async () => {
    const panel = await openSharePanel(null);
    expect(panel.innerHTML).toBe(baseline('share-panel.personal.html'));
    expect(screen.getByRole('heading', { name: 'Share', level: 2 })).toBeVisible();
  });

  it('团队工作区:可见范围 + 发布两段也在,逐字节不变', async () => {
    const panel = await openSharePanel(teamContext());
    expect(panel.innerHTML).toBe(baseline('share-panel.team.html'));
    expect(screen.getByRole('heading', { name: 'Share', level: 2 })).toBeVisible();
  });

  it('团队基线确实比个人基线多出那两段(否则上一条在裸奔)', () => {
    const personal = baseline('share-panel.personal.html');
    const team = baseline('share-panel.team.html');
    // Removing the tooltip SVG changes byte ratios, not section ownership.
    for (const marker of ['class="chrome-access-select"', 'Generate and copy link']) {
      expect(team).toContain(marker);
      expect(personal).not.toContain(marker);
    }
    for (const html of [personal, team]) {
      expect(html).not.toContain('Deploy to Vercel');
      expect(html).not.toContain('Deploy to Cloudflare Pages');
    }
    expect(team).toContain('share-menu-section-label--help');
  });

  /**
   * 页签按钮**不走基线**。它们身上会多出一个 `export-ready-nudge` 类,出现与否
   * 取决于时序,拿它做逐字节基线必然间歇性发红 —— 而发红的守卫最后都会被关掉。
   * 它们本来也不随面板搬走,所以这里只钉住「还是那两枚、顺序没变、都还在同一个
   * 外壳里」。
   */
  it('页签按钮那一对留在原地,不随面板搬走', async () => {
    stubFetch();
    renderViewer(null);
    await waitFor(() =>
      expect(document.querySelector('button.chrome-action-unified[aria-label="Share"]')).not.toBeNull(),
    );
    const bar = toolbarAction('Share').parentElement;
    expect(bar, '两枚页签按钮的外壳没了').not.toBeNull();

    const labels = [...bar!.querySelectorAll('button.chrome-action-unified')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels, 'Export 在前、Share 在后的顺序变了').toEqual(['Export', 'Share']);
    expect(
      toolbarAction('Share').parentElement,
      '两枚按钮被拆到了不同的外壳里',
    ).toBe(toolbarAction('Export').parentElement);
    expect(bar!.closest('.share-menu'), '按钮外壳脱离了 .share-menu').not.toBeNull();
  });
});

describe('Shared share shell header', () => {
  it.each([false, true])('puts workspace scope after the public action with deployment in the header, published=%s', async published => {
    stubFetch(published);
    renderViewer(teamContext());
    fireEvent.click(toolbarAction('Share'));
    const action = published
      ? await screen.findByRole('button', { name: /copy share link/i })
      : await screen.findByRole('menuitem', { name: /Generate and copy link/i });
    const scope = screen.getByText('Visibility in workspace');
    const trigger = document.querySelector('.chrome-access-trigger')!;
    const chevron = trigger.querySelector(':scope > svg')!;
    for (const [name, value] of Object.entries({ width: '12', height: '12', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      expect(chevron).toHaveAttribute(name, value);
    }
    expect(chevron.querySelector('path')).toHaveAttribute('d', 'm4 6 4 4 4-4');
    const row = scope.parentElement!.parentElement!;
    expect(trigger.parentElement!.parentElement).toBe(row);
    expect(row.nextElementSibling).toHaveTextContent('Only you can access this project. Choose workspace members to share it with the team.');
    fireEvent.click(screen.getByRole('button', { name: 'More sharing options' }));
    const deploy = screen.getByRole('menuitem', { name: /Deploy to Vercel/i });
    expect(action.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scope.compareDocumentPosition(deploy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it.each([
    ['toolbar', false], ['toolbar', true], ['artifact-card', false], ['artifact-card', true],
  ] as const)('%s published=%s closes and reopens without changing publication', async (origin, published) => {
    const historicUrl = 'https://open-design.ai/artifact/project-1/historical-slug';
    const fetchMock = stubFetch(published, historicUrl);
    renderViewer(teamContext(), origin === 'artifact-card'
      ? { shareRequest: { nonce: 701, anchorId: 'header-card' } } : {});
    if (origin === 'toolbar') fireEvent.click(toolbarAction('Share'));
    if (published) await screen.findByRole('switch', { name: /link access/i });
    else await screen.findByRole('menuitem', { name: /Generate and copy link/i });
    const heading = await screen.findByRole('heading', { name: 'Share', level: 2 });
    expect(heading.parentElement?.nextElementSibling).toHaveClass('chrome-unified-panel--share');
    if (published) expect(document.querySelector('.chrome-publish-url')?.textContent).toBe(historicUrl);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveAccessibleName('Close');
    expect(close).toBeEnabled();
    fireEvent.click(close);
    expect(screen.queryByRole('heading', { name: 'Share' })).toBeNull();
    expect(document.querySelector('.chrome-unified-panel--share')).toBeNull();
    fireEvent.click(toolbarAction('Share'));
    await screen.findByRole('heading', { name: 'Share' });
    if (published) expect(document.querySelector('.chrome-publish-url')?.textContent).toBe(historicUrl);
    const publishRequests = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).includes('publish-public') && ['POST', 'DELETE'].includes(init?.method ?? 'GET'));
    expect(publishRequests).toEqual([]);
  });
});

describe('G4 · retired HTML publishing section label', () => {
  it.each(['toolbar', 'artifact-card'] as const)('%s keeps publishing without the old label', async (origin) => {
    const changed = vi.fn();
    window.addEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, changed, { once: true });
    const fetchMock = stubFetch();
    renderViewer(teamContext(), origin === 'artifact-card'
      ? { shareRequest: { nonce: 401, anchorId: 'g4-card' } } : {});
    expect(toolbarAction('Share')).toBeEnabled();
    if (origin === 'toolbar') fireEvent.click(toolbarAction('Share'));
    const publish = await screen.findByRole('menuitem', { name: /Generate and copy link/i });
    // Actual English rendering of fileViewer.shareMenuPublishViaOd, not a mocked t().
    expect(screen.queryByText('QUICK SHARE · OPENDESIGN')).toBeNull();
    expect(document.querySelectorAll('.chrome-unified-panel--share')).toHaveLength(1);
    if (origin === 'artifact-card') {
      expect(document.querySelector('[data-artifact-anchor="g4-card"]')).not.toBeNull();
      expect(document.querySelector('.chrome-access-trigger')).not.toBeNull();
    } else {
      fireEvent.click(document.querySelector<HTMLButtonElement>('.chrome-access-trigger')!);
      expect(screen.getAllByRole('option')).toHaveLength(2);
      const selected = screen.getByRole('option', { name: 'Only me' });
      expect(selected).toHaveAttribute('aria-selected', 'true');
      const check = selected.querySelector(':scope > svg');
      expect(check).not.toBeNull();
      for (const [name, value] of Object.entries({ width: '13', height: '13', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
        expect(check).toHaveAttribute(name, value);
      }
      expect(check?.querySelector('path')).toHaveAttribute('d', 'm3 8 3 3 7-7');
      expect(screen.getByRole('option', { name: 'Workspace members' }).querySelector(':scope > svg')).toBeNull();
    }
    fireEvent.click(publish);
    await screen.findByRole('switch', { name: /link access/i });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/files/index.html/publish-public',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect((changed.mock.calls[0]?.[0] as CustomEvent | undefined)?.detail).toEqual({ projectId: 'project-1' });
  });

  it.each(['toolbar', 'artifact-card'] as const)('%s hydrates the exact publication URL and keeps copy/stop usable', async (origin) => {
    const changed = vi.fn();
    window.addEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, changed, { once: true });
    const fetchMock = stubFetch(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText } });
    renderViewer(teamContext(), origin === 'artifact-card'
      ? { shareRequest: { nonce: 402, anchorId: 'g4-published-card' } } : {});
    if (origin === 'toolbar') fireEvent.click(toolbarAction('Share'));
    const stop = await screen.findByRole('switch', { name: /link access/i });
    const url = 'https://open-design.ai/artifact/project-1/stable-slug';
    const panel = document.querySelector<HTMLElement>('.chrome-unified-panel--share')!;
    expect(panel.querySelector('.chrome-publish-url')?.textContent).toBe(url);
    expect(panel.querySelector('.chrome-publish-url')).toHaveAttribute('title', url);
    // S4-T: the team visibility control belongs to the unified Share panel regardless of its entry point.
    expect(screen.getByText('Visibility in workspace')).toBeVisible();
    expect(panel.querySelector('.chrome-access-trigger')).not.toBeNull();
    expect(panel.querySelector('input')).toBeNull();
    expect(screen.queryByText('QUICK SHARE · OPENDESIGN')).toBeNull();
    expect(stop).toBeEnabled();
    const copy = screen.getByRole('button', { name: /copy share link/i });
    expect(copy).toBeEnabled();
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    fireEvent.click(stop);
    await screen.findByRole('menuitem', { name: /Generate and copy link/i });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/files/index.html/publish-public',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ slug: 'stable-slug' }) }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect((changed.mock.calls[0]?.[0] as CustomEvent | undefined)?.detail).toMatchObject({
      projectId: 'project-1',
      confirmedStop: { sourceFilePath: 'index.html', accountScope: expect.any(String), generation: expect.any(Number) },
    });
  });
});

it('K3 re-reads remote stop/resume on the still-mounted Owner comment rail, but never invents stop on failed DELETE', async () => {
  const fallback = stubFetch(true).getMockImplementation()!;
  let stopped = false;
  let failStop = false;
  const syncReads: boolean[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/comment-sync-state')) {
      syncReads.push(stopped);
      return new Response(JSON.stringify({ pending: 0, lastError: null, sessionMissing: false, shareStopped: stopped }), { status: 200 });
    }
    if (url.includes('/publish-public') && init?.method === 'DELETE') {
      if (failStop) return new Response(JSON.stringify({ error: 'temporary failure' }), { status: 503 });
      stopped = true;
    }
    if (url.includes('/publish-public') && init?.method === 'POST') stopped = false;
    return fallback(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  renderViewer(teamContext());
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(await screen.findByTestId('comment-side-panel')).toBeTruthy();
  await waitFor(() => expect(syncReads).toEqual([false]));
  fireEvent.click(toolbarAction('Share'));
  fireEvent.click(await screen.findByRole('switch', { name: /link access/i }));
  await waitFor(() => expect(syncReads).toContain(true));
  expect(await screen.findByText('The link is disabled.')).toBeVisible();
  expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
  fireEvent.click(await screen.findByRole('menuitem', { name: /Generate and copy link/i }));
  await waitFor(() => expect(syncReads.at(-1)).toBe(false));
  await waitFor(() => expect(screen.queryByText('The link is disabled.')).toBeNull());
  failStop = true;
  const beforeFailure = syncReads.length;
  fireEvent.click(await screen.findByRole('switch', { name: /link access/i }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/publish-public') && init?.method === 'DELETE' && failStop)).toBe(true));
  await waitFor(() => expect(syncReads.length).toBeGreaterThan(beforeFailure));
  expect(syncReads.at(-1)).toBe(false);
  expect(screen.queryByText('The link is disabled.')).toBeNull();
  expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
});

describe('S12 · HTML share menu', () => {
  it.each(['streaming', 'viewerOnly'] as const)('keeps provider actions disabled while %s', async (restriction) => {
    stubFetch();
    renderViewer(teamContext(), { [restriction]: true });
    if (restriction === 'viewerOnly') {
      expect(toolbarAction('Share')).toBeDisabled();
      fireEvent.click(toolbarAction('Share'));
      expect(screen.queryByRole('menuitem', { name: /Deploy to/i })).toBeNull();
      return;
    }
    fireEvent.click(toolbarAction('Share'));
    fireEvent.click(screen.getByRole('button', { name: 'More sharing options' }));
    for (const name of [/Deploy to Vercel/i, /Deploy to Cloudflare Pages/i]) {
      const provider = await screen.findByRole('menuitem', { name });
      expect(provider).toBeDisabled();
      expect(provider).toHaveAttribute('title');
      fireEvent.click(provider);
    }
    expect(screen.queryByRole('combobox', { name: /Provider/i })).toBeNull();
  });

  it('keeps artifact-card Share focused on publishing while showing team visibility', async () => {
    stubFetch();
    renderViewer(teamContext(), { shareRequest: { nonce: 123, anchorId: 's12-card' } });
    await screen.findByRole('menuitem', { name: /Generate and copy link/i });
    expect(screen.queryByRole('menuitem', { name: /Deploy to/i })).toBeNull();
    expect(document.querySelector('.social-share-grid')).toBeNull();
    expect(screen.getByText('Visibility in workspace')).toBeVisible();
    expect(document.querySelector('.chrome-access-trigger')).not.toBeNull();
  });

  it('keeps deployment providers but excludes social sharing after publication', async () => {
    stubFetch(true);
    renderViewer(teamContext());
    fireEvent.click(toolbarAction('Share'));
    await screen.findByRole('switch', { name: /link access/i });
    const panel = document.querySelector<HTMLElement>('.chrome-unified-panel--share')!;
    expect(panel.querySelector('.chrome-publish-url')?.textContent).toBe('https://open-design.ai/artifact/project-1/stable-slug');
    fireEvent.click(screen.getByRole('button', { name: 'More sharing options' }));
    expect(screen.getByRole('menuitem', { name: /Deploy to Vercel/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /Deploy to Cloudflare Pages/i })).toBeEnabled();
    expect(panel.querySelector('.social-share-grid')).toBeNull();
    expect(panel.querySelectorAll('.social-share-button')).toHaveLength(0);
  });
  it('F14 help hover and leave show then dismiss the real Share-panel explanation without publishing', async () => {
    const fetchMock = stubFetch();
    renderViewer(teamContext());
    render(<TooltipLayer />);
    fireEvent.click(toolbarAction('Share'));
    const help = await screen.findByRole('button', { name: 'Anyone with the link can view it online.' });
    fireEvent.pointerOver(help);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Anyone with the link can view it online.');
    fireEvent.pointerOut(help, { relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('publish-public') && init?.method === 'POST')).toBe(false);
  });

  it('S1-T2: team scope requires confirmation, commits exact move once, and rolls back a failed return', async () => {
    window.localStorage.removeItem('od.projects.moveConfirmSkip');
    const fetchMock = stubFetch();
    const fallback = fetchMock.getMockImplementation();
    let settleTeam!: (value: Response) => void;
    let settlePrivate!: (value: Response) => void;
    const teamMove = new Promise<Response>(resolve => { settleTeam = resolve; });
    const privateMove = new Promise<Response>(resolve => { settlePrivate = resolve; });
    const moves: RequestInit[] = [];
    let teamShared = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/collab/status')) return Response.json(teamShared ? { ownerMemberId: 'member-a' } : {});
      if (String(input).endsWith('/api/workspace/projects/team')) return Response.json({ projects: teamShared ? [{ projectId: 'project-1' }] : [] });
      if (String(input).endsWith('/api/workspaces/workspace-a/projects/project-1/move') && init?.method === 'POST') {
        moves.push(init);
        return moves.length === 1 ? teamMove : privateMove;
      }
      return fallback!(input, init);
    });
    renderViewer(teamContext());
    fireEvent.click(toolbarAction('Share'));
    const privateTrigger = await screen.findByRole('button', { name: 'Only me' });
    const chooseTeam = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Only me' }));
      const teamOption = screen.getByRole('option', { name: 'Workspace members' });
      fireEvent.click(teamOption);
      expect(screen.queryByRole('option', { name: 'Workspace members' })).toBeNull();
      expect(screen.queryByRole('option', { name: 'Only me' })).toBeNull();
    };
    chooseTeam();
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(moves).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(privateTrigger).toBeEnabled();
    expect(moves).toHaveLength(0);
    chooseTeam();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }));
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(JSON.parse(String(moves[0]?.body))).toEqual({ visibility: 'team' });
    expect(moves[0]?.headers).toMatchObject({ 'x-od-workspace-id': 'workspace-a' });
    expect(privateTrigger).toBeDisabled();
    teamShared = true;
    await act(async () => settleTeam(Response.json({ project: { id: 'project-1' } })));
    const teamTrigger = await screen.findByRole('button', { name: 'Workspace members' });
    expect(teamTrigger).toBeEnabled();
    expect(screen.getByText('Shared with workspace members')).toBeVisible();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('publish-public') && init?.method === 'POST')).toBe(false);

    fireEvent.click(teamTrigger);
    fireEvent.click(screen.getByRole('option', { name: 'Only me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move' }));
    await waitFor(() => expect(moves).toHaveLength(2));
    expect(JSON.parse(String(moves[1]?.body))).toEqual({ visibility: 'personal' });
    await act(async () => settlePrivate(Response.json({ error: { message: 'temporarily unavailable' } }, { status: 503 })));
    expect(screen.getByRole('button', { name: 'Workspace members' })).toBeEnabled();
    expect(screen.getByText('Could not move back to private')).toBeVisible();
  });

  it('S1-T2: a late first team revalidation cannot undo the newest event scope', async () => {
    resetCoalescedGet();
    const fetchMock = stubFetch();
    const fallback = fetchMock.getMockImplementation();
    let releaseFirst!: (response: Response) => void;
    const staleStatus = new Promise<Response>(resolve => { releaseFirst = resolve; });
    let revalidating = false;
    let eventReads = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/collab/status')) {
        if (!revalidating) return Response.json({});
        eventReads++;
        return eventReads === 1 ? staleStatus : Response.json({ ownerMemberId: 'member-a' });
      }
      if (url.endsWith('/api/workspace/projects/team')) return Response.json({ projects: [] });
      return fallback!(input, init);
    });
    renderViewer(teamContext());
    fireEvent.click(toolbarAction('Share'));
    await screen.findByRole('button', { name: 'Only me' });
    revalidating = true;
    act(() => { window.dispatchEvent(new Event(TEAM_PROJECTS_CHANGED_EVENT)); });
    await waitFor(() => expect(eventReads).toBe(1));
    act(() => { window.dispatchEvent(new Event(TEAM_PROJECTS_CHANGED_EVENT)); });
    await screen.findByRole('button', { name: 'Workspace members' });
    expect(eventReads).toBe(2);
    await act(async () => { releaseFirst(Response.json({})); });
    expect(screen.getByRole('button', { name: 'Workspace members' })).toBeVisible();
    resetCoalescedGet();
  });
});

describe('Z11a · 基线守不住、但必须守住的几条', () => {
  it('分享与导出仍是同一块弹层的两个页签,不是两块弹层', async () => {
    await openSharePanel(null);
    expect(document.querySelectorAll('.chrome-unified-popover')).toHaveLength(1);

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() =>
      expect(document.querySelector('.chrome-unified-panel--share'), '换页签后分享那一份还在').toBeNull(),
    );
    expect(document.querySelectorAll('.chrome-unified-popover'), '叠出了第二块弹层').toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Share' })).toBeNull();
  });

  it('面板挂在预览区容器内,不是 body 级 dialog(负向)', async () => {
    const panel = await openSharePanel(null);
    expect(panel.closest('.share-menu'), '面板脱离了 .share-menu 容器').not.toBeNull();
    expect(panel.getAttribute('role'), '面板自己不该是 dialog').not.toBe('dialog');
    expect(
      document.body.querySelector(':scope > .chrome-unified-panel--share'),
      '面板被提到了 body 级',
    ).toBeNull();
  });

  it('弹层里仍有可点的 menuitem 行(面板不是空壳)', async () => {
    await openSharePanel(null);
    fireEvent.click(screen.getByRole('button', { name: 'More sharing options' }));
    expect(
      screen.queryAllByRole('menuitem').length,
      '分享面板里一行 menuitem 都没有,说明搬丢了内容',
    ).toBeGreaterThan(0);
  });
});
