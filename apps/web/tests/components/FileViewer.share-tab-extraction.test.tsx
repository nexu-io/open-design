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
 *  · `personal` —— 没有工作区身份。此时面板**只渲染「自有托管部署」那一段**。
 *  · `team` —— 有团队工作区身份。此时才渲染**工作区可见范围**与**发布**两段，
 *    也就是分享功能真正要动的那部分。
 * 只存 personal 那一份等于放着三分之二的面板不设防。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
} from '@open-design/contracts';

import { FileViewer } from '../../src/components/FileViewer';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
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
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.includes('/deployments')) return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    if (url.includes('/deploy/config')) return new Response(JSON.stringify({ providerId: 'cloudflare-pages', configured: false }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  }));
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

function renderViewer(workspaceContext: WorkspaceCollabContext | null) {
  const viewer = (
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
    />
  );
  if (!workspaceContext) return render(viewer);
  return render(<CollabProvider value={collabValue(workspaceContext)}>{viewer}</CollabProvider>);
}

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
  });

  it('团队工作区:可见范围 + 发布两段也在,逐字节不变', async () => {
    const panel = await openSharePanel(teamContext());
    expect(panel.innerHTML).toBe(baseline('share-panel.team.html'));
  });

  it('团队基线确实比个人基线多出那两段(否则上一条在裸奔)', () => {
    const personal = baseline('share-panel.personal.html');
    const team = baseline('share-panel.team.html');
    expect(team.length).toBeGreaterThan(personal.length * 2);
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

describe('Z11a · 基线守不住、但必须守住的几条', () => {
  it('分享与导出仍是同一块弹层的两个页签,不是两块弹层', async () => {
    await openSharePanel(null);
    expect(document.querySelectorAll('.chrome-unified-popover')).toHaveLength(1);

    fireEvent.click(toolbarAction('Export'));
    await waitFor(() =>
      expect(document.querySelector('.chrome-unified-panel--share'), '换页签后分享那一份还在').toBeNull(),
    );
    expect(document.querySelectorAll('.chrome-unified-popover'), '叠出了第二块弹层').toHaveLength(1);
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
    expect(
      screen.queryAllByRole('menuitem').length,
      '分享面板里一行 menuitem 都没有,说明搬丢了内容',
    ).toBeGreaterThan(0);
  });
});
