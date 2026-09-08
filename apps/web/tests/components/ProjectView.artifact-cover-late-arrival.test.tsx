// @vitest-environment jsdom

/**
 * 封面**晚到**的那一局 —— `chat-artifact-versioning-design.md` 第 505 行:
 * 「pending thumbnail 不出 placeholder,直接走 §6.4 的降级支;
 * **后台 ready 后消息投影更新**」。
 *
 * 前半条一直是对的,后半条一直是空的。HTML 卡的静态封面**故意不 await**
 * (`chat-artifacts/cover.ts`:「一轮对话不该为了一张缩略图多等几秒」),
 * 它在终止帧之后几百毫秒才落库;而客户端在 run 终止后**只拉一次**
 * (`scheduleConversationMessageRefresh`,150ms),那一拉必然早于封面。
 * 真机实测这一局输了 466 毫秒:ref 落库 17:13:05,封面 ready 17:13:06。
 * 之后再也没有第二次拉取 —— 于是卡片在整个会话里停在降级支的 live iframe 上,
 * 直到整页刷新。用户看到的就是「12 页 deck 在卡里活着跑」。
 *
 * ── 这个量法能看见缺陷吗 ────────────────────────────────────────────────
 * 要害是**顺序**,不是「有 ready ref 就画 img」。后者在坏掉的构建上也是绿的
 * (`artifact-card-version-semantics.test.tsx` 已经覆盖了那条,注入 prop 即可)。
 * 所以这里必须先让卡真的落到 iframe 上,再放事件进来,最后才断言它换成了 img:
 *
 *   ① 挂载时 `listMessages` 返回 `legacy_unavailable` —— 150ms 那一拉的真实返回;
 *   ② 断言卡面是 `<iframe>`(降级支);
 *   ③ 送进 `chat-artifact-refs-changed`,此时 `listMessages` 改口 `ready`;
 *   ④ 断言卡面换成 `<img src=thumbnailUrl>`,且 iframe 消失。
 *
 * 去掉 ③ 那一步的处理分支,④ 必须重新变红 —— 已验(见本次改动说明)。
 *
 * ── 为什么 ChatPane 的替身里挂的是**真的** AssistantMessage ────────────
 * 被测的是 ProjectView 的**消息状态**会不会因为那个事件而更新。卡片自己怎么在
 * `ready` 和降级之间选,是 `FileOpsSummary` 的事,已另有覆盖。所以这里把替身做薄:
 * 只替掉 ChatPane 的版式,`message → messageArtifactRefs → FileOpsSummary →
 * ArtifactCard` 整条仍然是真的,ProjectView 交出什么样的 message,卡就照着画。
 * 如果这里连 AssistantMessage 一起 mock 掉,断言的就是夹具而不是产品。
 *
 * ── jsdom 的两个坑(不绕过就是假绿)────────────────────────────────────
 * 1. HTML 降级支要挂出 iframe 有两道前置:`useInView`(jsdom 没有
 *    IntersectionObserver,直接判 true)和一次 `HEAD` 探测成功。默认 jsdom 里
 *    `fetch('/api/...')` 会抛(相对 URL 无 origin),iframe 根本挂不出来 ——
 *    那样第 ② 步会**假绿**:它测的是网络在 jsdom 里失败了。所以下面把 `fetch`
 *    打桩成 200。
 * 2. jsdom **不做布局**(`scrollHeight`/`clientHeight` 恒为 0)也不加载样式表,
 *    所以规格 §12.3 那条「pending → ready 不改变卡外框高度、不打断用户滚动」
 *    **在这里量不到**,本文件一个字都没有断言它。那一条只能真机验。
 */

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { useProjectFileEvents, type ProjectEvent } from '../../src/providers/project-events';
import type { ChatMessage } from '../../src/types';

const PROJECT_ID = 'project-1';
const CONVERSATION_ID = 'conv-1';
const MESSAGE_ID = 'msg-1';
const ARTIFACT = 'opendesign-seed-pitch.html';
const COVER_URL = `/api/projects/${PROJECT_ID}/chat-artifact-snapshots/snap-1/thumbnail`;
const RAW_URL = `/api/projects/${PROJECT_ID}/raw/${ARTIFACT}`;

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (value: string) => value }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

/*
 * 部分 mock:产物卡要用真的 `projectFileUrl` 去拼降级支那个 iframe 的 src ——
 * 那正是第 ② 步要断言的东西,替成假的就等于自己写了个答案。
 */
vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: vi.fn(async () => null),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }));
vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

vi.mock('../../src/state/projects', () => ({
  cacheTabsLocally: vi.fn((projectId: string, tabs: unknown) => ({ projectId, tabs })),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: vi.fn(),
  patchProject: vi.fn(),
  persistTabsToDaemonNow: vi.fn(),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: vi.fn(),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({ AppChromeHeader: () => null }));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => null,
}));

/*
 * 薄替身:只替掉 ChatPane 的版式,产物卡那条链路留真的。ProjectView 手里的
 * message 是什么样,卡就画成什么样 —— 这正是本文件要观察的东西。
 */
vi.mock('../../src/components/ChatPane', async () => {
  const { AssistantMessage } = await import('../../src/components/AssistantMessage');
  return {
    ChatPane: ({ messages }: { messages: ChatMessage[] }) => (
      <>
        {messages
          .filter((message) => message.role === 'assistant')
          .map((message) => (
            <AssistantMessage
              key={message.id}
              message={message}
              streaming={false}
              projectId={PROJECT_ID}
            />
          ))}
      </>
    ),
  };
});

/** 这一轮产出的 HTML。有 `producedFiles` 才会出产物卡。 */
function producedHtml() {
  return [
    {
      name: ARTIFACT,
      path: ARTIFACT,
      size: 49_711,
      mtime: Date.now(),
      kind: 'html' as const,
      mime: 'text/html',
    },
  ];
}

/**
 * 一条**已经结束**的轮次。
 *
 * `snapshotState` 由调用方给:挂载那次是 `legacy_unavailable`(150ms 那一拉的
 * 真实返回 —— 封面还没渲染完,ref 上根本没有 snapshot 行),事件之后才是 `ready`。
 */
function finishedTurn(ref: Record<string, unknown>): ChatMessage[] {
  return [
    {
      id: MESSAGE_ID,
      role: 'assistant',
      agentId: 'agent-1',
      content: '做好了',
      createdAt: Date.now(),
      runId: 'run-1',
      runStatus: 'succeeded',
      producedFiles: producedHtml(),
      artifactRefs: [ref],
    } as unknown as ChatMessage,
  ];
}

const pendingRef = {
  id: 'ref-1',
  label: ARTIFACT,
  kind: 'html',
  displayPolicy: 'latest_with_static_preview',
  workspaceArtifactId: 'wa-1',
  snapshotState: 'legacy_unavailable',
};

const readyRef = {
  ...pendingRef,
  snapshotId: 'snap-1',
  thumbnailUrl: COVER_URL,
  snapshotState: 'ready',
};

function renderProjectView() {
  const project = {
    id: PROJECT_ID,
    name: 'OpenDesign 种子轮路演 Deck',
    skillId: null,
    designSystemId: null,
  } as never;
  return render(
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: null }}
      routeFileName={null}
      config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
      agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
      daemonLive
      onModeChange={() => {}}
      onAgentChange={() => {}}
      onAgentModelChange={() => {}}
      onRefreshAgents={() => {}}
      onOpenSettings={() => {}}
      onBack={() => {}}
      onClearPendingPrompt={() => {}}
      onTouchProject={() => {}}
      onProjectChange={() => {}}
      onProjectsRefresh={() => {}}
    />,
  );
}

/** 让 HTML 降级支那道 HEAD 探测**通过** —— 见文件头的假绿说明。 */
function stubHeadProbeAsReachable() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response('', { status: 200 }),
  );
}

function primeDaemon() {
  listConversations.mockResolvedValue([{ id: CONVERSATION_ID, title: 'Conversation' }]);
  listMessages.mockResolvedValue(finishedTurn(pendingRef));
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  fetchProjectFiles.mockResolvedValue(producedHtml());
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  fetchChatRunStatus.mockResolvedValue(null);
}

/** ProjectView 挂给 `useProjectFileEvents` 的那个 handler(第 3 个实参)。 */
function projectEventHandler(): (evt: ProjectEvent) => void {
  const calls = vi.mocked(useProjectFileEvents).mock.calls;
  const handler = calls.at(-1)?.[2];
  if (typeof handler !== 'function') {
    throw new Error('ProjectView never subscribed to the project event stream');
  }
  return handler as (evt: ProjectEvent) => void;
}

const card = () =>
  document.querySelector<HTMLElement>(`[data-testid="artifact-card-${ARTIFACT}"]`);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

beforeEach(() => {
  primeDaemon();
  stubHeadProbeAsReachable();
});

describe('封面在终止帧之后才落地时,卡面必须自己换成快照', () => {
  it('先降级成 live iframe,收到 chat-artifact-refs-changed 后换成 <img> 快照', async () => {
    renderProjectView();
    await waitFor(() => expect(listMessages).toHaveBeenCalled());

    // ① + ②:150ms 那一拉返回的就是「没有 ready 快照」,卡落在降级支上。
    const frame = await waitFor(() => {
      const found = card()?.querySelector<HTMLIFrameElement>('iframe');
      expect(found, '没有当轮快照时,卡面应当是 live iframe(§6.4 降级支)').toBeTruthy();
      return found!;
    }, { timeout: 2_000 });
    expect(frame.getAttribute('src')).toBe(RAW_URL);
    expect(
      card()?.querySelector('img.artifact-card-media'),
      '快照还没落地就画 img,卡面会是一张碎图',
    ).toBeNull();

    // ③:封面这时候才渲染完落库,daemon 推事件,重拉才能拿到 ready。
    listMessages.mockResolvedValue(finishedTurn(readyRef));
    act(() => {
      projectEventHandler()({
        type: 'chat-artifact-refs-changed',
        projectId: PROJECT_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      } as ProjectEvent);
    });

    // ④:卡面自己换成当轮静态首屏截图,不需要整页刷新。
    const shot = await waitFor(() => {
      const found = card()?.querySelector<HTMLImageElement>('img.artifact-card-media');
      expect(
        found,
        '封面已经 ready 却还挂着 live iframe:整条会话里 deck 会一直活着跑',
      ).toBeTruthy();
      return found!;
    }, { timeout: 2_000 });
    expect(shot.getAttribute('src')).toBe(COVER_URL);
    expect(
      card()?.querySelector('iframe'),
      '换成快照后还留着 iframe = 两份卡面同时在,活的那份还会跟着 latest 漂',
    ).toBeNull();
  });

  it('别的项目的同名事件不该惊动这条会话', async () => {
    renderProjectView();
    await waitFor(() => expect(listMessages).toHaveBeenCalled());
    await waitFor(() => expect(card()?.querySelector('iframe')).toBeTruthy(), {
      timeout: 5_000,
    });

    const before = listMessages.mock.calls.length;
    act(() => {
      projectEventHandler()({
        type: 'chat-artifact-refs-changed',
        projectId: 'some-other-project',
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      } as ProjectEvent);
    });

    /*
     * 反向对照。少了它,一个「收到任何事件就无脑重拉」的实现也能把上面那条弄绿,
     * 而那种实现会让每个开着的项目互相拉对方的会话。
     */
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(listMessages.mock.calls.length).toBe(before);
  });
});
