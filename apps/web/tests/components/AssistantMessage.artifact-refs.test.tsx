// @vitest-environment jsdom

/**
 * 消息上的产物**版本身份**要真的走到卡片上。
 *
 * `FileOpsSummary` 已经会按 `artifactRefs` 分两套语义(HTML 系 vs 图片),但那一层
 * 拿到的是 `AssistantMessage` 递过去的东西。这条链断在中间的表现和「daemon 还没
 * 出快照」一模一样 —— 卡面照样是 live iframe、图片照样读当前文件 —— 所以它**必须
 * 单独有一条**,不能靠组件层那几条代劳。
 *
 * 语义(`specs/current/chat-artifact-versioning-design.md` §4 + 2026-09-02 产品口径):
 *  · HTML / 原型 / slide / 文档 → 卡面是当轮静态首屏截图,点击开工作区最新版本;
 *  · 图片 → 卡面是当轮不可变真图快照,点击开那张快照;
 *  · 两类都没快照时降级(live iframe / 当前文件),不出占位、不写失败文案。
 *
 * ── 假绿防线 ────────────────────────────────────────────────────────────
 * HTML 那条降级支要挂出 iframe 需要一次 HEAD 探测成功,而 jsdom 里相对 URL 的
 * `fetch` 会抛。不打桩的话「降级成 live iframe」那条会变成「网络在 jsdom 里失败了」。
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { CollabProvider } from '../../src/collab/collab-context';
import type { ChatMessage, ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

const PROJECT_ID = 'c7e3b234-2fb3-4f6e-8aae-a3a00697c476';
const HTML_SHOT = '/api/projects/p1/chat-artifact-snapshots/snap-html-1/thumbnail';
const IMAGE_SHOT = '/api/projects/p1/chat-artifact-snapshots/snap-img-1/content';
const TURN_STARTED_AT = 1787794097356;

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function stubHeadProbeAsReachable() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('', { status: 200 }));
}

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

function projectFile(name: string, kind: 'html' | 'image'): ProjectFile {
  return {
    name,
    path: name,
    localPath: `/Users/elian/.od/projects/${PROJECT_ID}/${name}`,
    type: 'file',
    size: 8961,
    mtime: TURN_STARTED_AT + 2_000,
    kind,
    mime: kind === 'html' ? 'text/html; charset=utf-8' : 'image/png',
    artifactKind: kind,
  } as ProjectFile;
}

function turn(files: ProjectFile[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '8832c4fd-ca02-4a30-8054-2ab5b7237898',
    role: 'assistant',
    content: '做好了。',
    runStatus: 'succeeded',
    startedAt: TURN_STARTED_AT,
    endedAt: TURN_STARTED_AT + 13_000,
    createdAt: TURN_STARTED_AT,
    events: [
      { kind: 'status', label: 'starting', detail: 'claude' },
      { kind: 'text', text: '做好了。' },
    ] as ChatMessage['events'],
    producedFiles: files,
    ...overrides,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage, files: ProjectFile[], props: Record<string, unknown> = {}) {
  return render(
    <CollabProvider value={projectCollabValue()}>
      <AssistantMessage
        message={message}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={files}
        isLast
        {...props}
      />
    </CollabProvider>,
  );
}

const htmlRef = {
  id: 'ref-1',
  label: 'landing.html',
  kind: 'html',
  displayPolicy: 'latest_with_static_preview',
  snapshotId: 'snap-html-1',
  thumbnailUrl: HTML_SHOT,
  snapshotState: 'ready',
};

const imageRef = {
  id: 'ref-2',
  label: 'hero.png',
  kind: 'image',
  displayPolicy: 'immutable_snapshot',
  // 已作废的字段,故意留着:线上还有宣布它的旧 daemon / 旧消息,而读取端必须
  // 无论如何都不把点击引向快照。
  openPolicy: 'snapshot',
  snapshotId: 'snap-img-1',
  snapshotUrl: IMAGE_SHOT,
  snapshotState: 'ready',
};

const mediaOf = (name: string) =>
  screen.getByTestId(`artifact-card-${name}`).querySelector<HTMLElement>('.artifact-card-media');

describe('AssistantMessage 把消息上的 artifactRefs 交给产物卡', () => {
  it('HTML 卡面换成当轮静态截图,点击仍开工作区最新版本', async () => {
    stubHeadProbeAsReachable();
    const files = [projectFile('landing.html', 'html')];
    const onRequestOpenFile = vi.fn();
    renderTurn(turn(files, { artifactRefs: [htmlRef] } as Partial<ChatMessage>), files, {
      onRequestOpenFile,
    });

    await waitFor(() => expect(mediaOf('landing.html')).not.toBeNull());
    expect(mediaOf('landing.html')!.getAttribute('src')).toBe(HTML_SHOT);
    expect(
      screen.getByTestId('artifact-card-landing.html').querySelector('iframe'),
      'refs 没走到卡上:卡面还挂着活 iframe,历史卡会跟着最新版本漂',
    ).toBeNull();

    fireEvent.click(screen.getByTestId('artifact-card-open-landing.html'));
    // 钉实参个数,不用否定式断言 —— 多一个可选参数会让 `not.toHaveBeenCalledWith`
    // 恒真,那条断言永远不会红。
    expect(onRequestOpenFile.mock.calls[0]).toHaveLength(1);
    expect(onRequestOpenFile.mock.calls[0]).toEqual(['landing.html']);
  });

  it('图片卡面认那一轮的快照,点击仍开工作区最新版本', () => {
    stubHeadProbeAsReachable();
    const files = [projectFile('hero.png', 'image')];
    const onRequestOpenFile = vi.fn();
    renderTurn(turn(files, { artifactRefs: [imageRef] } as Partial<ChatMessage>), files, {
      onRequestOpenFile,
    });

    expect(mediaOf('hero.png')!.getAttribute('src')).toBe(IMAGE_SHOT);

    fireEvent.click(screen.getByTestId('artifact-card-open-hero.png'));
    // 用户 2026-09-02:「html 和图片都是,产物缩略是快照,但跳过去产物永远指向最新的」。
    expect(onRequestOpenFile.mock.calls[0]).toHaveLength(1);
    expect(onRequestOpenFile.mock.calls[0]).toEqual(['hero.png']);
  });

  it('旧会话(消息上没有 refs)照旧:HTML 走 live iframe、图片读当前文件', async () => {
    stubHeadProbeAsReachable();
    const files = [projectFile('landing.html', 'html'), projectFile('hero.png', 'image')];
    renderTurn(turn(files), files);

    await waitFor(() =>
      expect(
        screen.getByTestId('artifact-card-landing.html').querySelector('iframe'),
      ).not.toBeNull(),
    );
    expect(mediaOf('hero.png')!.getAttribute('src')).toBe(
      `/api/projects/${PROJECT_ID}/raw/hero.png`,
    );
    // 降级是一张正常卡面,不是一句错误提示。
    expect(screen.getByTestId('file-ops-summary').textContent ?? '').not.toMatch(
      /失败|不可用|错误|无法|unavailable|failed|error/i,
    );
  });
});
