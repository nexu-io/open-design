// @vitest-environment jsdom
/**
 * 组件 22 · 重连 · S29 的**另一半探测**:浏览器自己说「这一屏没网了」。
 *
 * 今天那一行只有一个上膛口 —— 浏览器 ↔ daemon 那条 SSE **socket 真的断掉**
 * (`providers/daemon.ts` 的重连预算)。那条路本身是通的:`streamViaDaemon`
 * 在流被网络掐断时会如实数到 5/5 再交回给人(见
 * `tests/providers/daemon-sse-dead-daemon.test.ts` 与本次新增的
 * `daemon-sse-tab-offline.test.ts`)。
 *
 * 可**掉线不一定表现成 socket 断掉**。真机 2026-09-03:一条正在跑的长任务,
 * 把那个页签断网(CDP `Network.emulateNetworkConditions {offline:true}`),
 * 一分钟后 `navigator.onLine` 已经是 `false`,而屏幕上:
 *
 *   · 壳头照旧写着「进行中」,秒数还在往上走
 *   · 「正在重新连接 / 连接失败 / 重新连接」一个字都没有
 *
 * 原因是 daemon 跑在**本机回环**上:那条流没有被掐断,25 秒一次的 keepalive
 * 还在到,于是 75 秒的静默闸(`DAEMON_STREAM_IDLE_TIMEOUT_MS`)一次都没上膛,
 * 重连预算自然一次都没走。**浏览器早就知道,我们没问过它。**
 *
 * 所以这里验的是那个新的上膛口:`offline` / `online` 是真的浏览器事件,
 * 不是把 `onReconnect` 手动调一遍 —— 后者只能证明渲染,证不出探测。
 *
 * 读数的形状:`max = 1`,所以 `Reconnect` 不写「几分之几」
 * (`showCount = max > 1`)。这一档没有梯子在数,写「1/5」是假话。
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ChatReconnectView } from '../../src/runtime/chat/reconnect-state';
import type { ChatMessage } from '../../src/types';

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

const harness = vi.hoisted(() => ({
  reconnect: null as ChatReconnectView | null,
  timeline: [] as Array<ChatReconnectView | null>,
}));

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

vi.mock('../../src/providers/registry', () => ({
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

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ reconnect }: { reconnect: ChatReconnectView | null }) => {
    const last = harness.timeline.at(-1);
    if (JSON.stringify(last ?? null) !== JSON.stringify(reconnect ?? null)) {
      harness.timeline.push(reconnect ?? null);
    }
    harness.reconnect = reconnect ?? null;
    return null;
  },
}));

function renderProjectView() {
  const project = {
    id: 'project-1',
    name: 'Project',
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

/** 一条正在跑的轮次 —— 掉线时屏幕上就是它,壳头写着「进行中」。 */
function runningTurn(): ChatMessage[] {
  const startedAt = Date.now();
  return [
    {
      id: 'msg-1',
      role: 'assistant',
      agentId: 'agent-1',
      content: 'working on it',
      createdAt: startedAt,
      startedAt,
      runId: 'run-1',
      runStatus: 'running',
    } satisfies ChatMessage,
  ];
}

function primeDaemon() {
  listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
  listMessages.mockResolvedValue(runningTurn());
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  fetchChatRunStatus.mockResolvedValue({
    id: 'run-1',
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    exitCode: null,
    signal: null,
  });
  // 重挂通道占着不放:这一条里所有读数都必须来自浏览器的掉线信号,
  // 不许有一丝传输层的梯子混进来。
  reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));
}

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setOnLine(true);
  harness.reconnect = null;
  harness.timeline = [];
  window.sessionStorage.clear();
});

beforeEach(() => {
  primeDaemon();
  setOnLine(true);
});

describe('S29 · 这一屏断网时,重连那一行必须出得来', () => {
  it('shows the reconnect row when the tab goes offline mid-run', async () => {
    renderProjectView();
    await waitFor(() => expect(listMessages).toHaveBeenCalled());
    await waitFor(() => expect(harness.reconnect).toBeNull());

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() => expect(harness.reconnect).not.toBeNull());
    expect(
      harness.reconnect,
      '掉线一分钟屏幕上一个字都没有 = 用户看到一条「健康」的假运行',
    ).toEqual(
      expect.objectContaining({
        reason: 'transport',
        runId: 'run-1',
        conversationId: 'conv-1',
        attempt: 1,
        // 没有梯子在数,就不写「几分之几」(Reconnect 的 showCount = max > 1)。
        max: 1,
        exhausted: false,
      }),
    );
  });

  it('retracts the row when the tab comes back online', async () => {
    renderProjectView();
    await waitFor(() => expect(listMessages).toHaveBeenCalled());

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(harness.reconnect).not.toBeNull());

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });

    // 「恢复后整行消失,不留『已恢复』」—— reconnect-state.ts 文件头第 1 条。
    await waitFor(() => expect(harness.reconnect).toBeNull());
  });

  it('shows the row on mount when the tab is already offline', async () => {
    setOnLine(false);
    renderProjectView();
    await waitFor(() => expect(listMessages).toHaveBeenCalled());

    await waitFor(() => expect(harness.reconnect).not.toBeNull());
    expect(harness.reconnect?.runId).toBe('run-1');
  });

  it('leaves a settled turn alone — no row when nothing is running', async () => {
    listMessages.mockResolvedValue([
      {
        id: 'msg-1',
        role: 'assistant',
        agentId: 'agent-1',
        content: 'done',
        createdAt: Date.now(),
        runId: 'run-1',
        runStatus: 'succeeded',
      } satisfies ChatMessage,
    ]);
    renderProjectView();
    await waitFor(() => expect(listMessages).toHaveBeenCalled());

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    // 反向对照:没有在跑的轮次就没有可重连的东西。少了它,「无条件显示」也能把上面三条弄绿。
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(harness.reconnect).toBeNull();
  });
});
