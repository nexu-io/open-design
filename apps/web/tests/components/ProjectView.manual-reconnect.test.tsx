// @vitest-environment jsdom
/**
 * 组件 22-3 ·〔重新连接〕那颗按钮的**接线**验收。
 *
 * 真机量到的症状(2026-08-27):走到「连接失败 +〔重新连接〕」之后,
 *   · daemon 已经回来时按一下 —— **0.4 秒内整行消失**,对话接着跑,按钮是好的;
 *   · daemon 还没回来时按一下 —— **屏幕上一点变化都没有**。
 * 用户原话「点击 reconnect 咋没啥反应」,而「点了没变化」和「按钮坏了」
 * 在屏幕上长得一模一样。
 *
 * 成因不在按钮,在按下之后那条链:清重试记账 → 叫醒重挂扫描 → 拉运行状态 →
 * 起重挂。daemon 没回来时它在第三步就断了,而整条链上没有任何一样东西碰过
 * 流水尾部那一行。
 *
 * 状态机那一层的规则在 `tests/runtime/chat/reconnect-state.test.ts`;
 * 这里验的是 `ProjectView` 到底有没有把那条规则接上 —— 尤其是那把到期闸,
 * 它只存在于这一层(纯函数不认识计时器)。
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import {
  MANUAL_RECONNECT_FEEDBACK_MS,
  type ChatReconnectView,
} from '../../src/runtime/chat/reconnect-state';
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
const publishDaemonRunFinishedEvent = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();

const harness = vi.hoisted(() => ({
  reconnect: null as ChatReconnectView | null,
  onManualReconnect: null as null | (() => void),
  /** 每一次 `reconnect` 读数变化都记一笔 —— 「按下之后有没有回音」看的就是这条带子。 */
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
  publishDaemonRunFinishedEvent: (...args: unknown[]) => publishDaemonRunFinishedEvent(...args),
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
  ChatPane: ({
    reconnect,
    onManualReconnect,
  }: {
    reconnect: ChatReconnectView | null;
    onManualReconnect: (() => void) | undefined;
  }) => {
    harness.onManualReconnect = onManualReconnect ?? null;
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

interface ReattachHandlers {
  onReconnect: (state: { attempt: number; max: number; phase: string }) => void;
  onError: (err: Error) => void | Promise<void>;
}

/** 一条断了线、还挂着 `running` 的轮次 —— 重挂扫描会去接的正是它。 */
function runningTurn(): ChatMessage[] {
  const startedAt = Date.now();
  return [
    {
      id: 'msg-1',
      role: 'assistant',
      agentId: 'agent-1',
      content: '',
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
}

/**
 * 把屏幕开到 22-3:重挂接上了流,流上把 5 次预算走光,传输层交回给人。
 * 返回那条流的 handlers,后面还要用它模拟「再断一次」。
 */
async function driveToHandedBack(): Promise<ReattachHandlers> {
  let handlers: ReattachHandlers | null = null;
  reattachDaemonRun.mockImplementation(async (options: { handlers: ReattachHandlers }) => {
    handlers = options.handlers;
    // 永不 resolve:这一轮的重挂通道还占着,和真机上「流还开着但已经用尽预算」一致。
    return new Promise<void>(() => {});
  });

  renderProjectView();
  await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
  act(() => {
    handlers!.onReconnect({ attempt: 5, max: 5, phase: 'exhausted' });
  });
  await waitFor(() => expect(harness.reconnect?.exhausted).toBe(true));
  return handlers!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  harness.reconnect = null;
  harness.onManualReconnect = null;
  harness.timeline = [];
  window.sessionStorage.clear();
});

beforeEach(() => {
  primeDaemon();
});

describe('22-3 ·〔重新连接〕按下去必须有回音', () => {
  it('flips the row into 正在重新连接 the moment the button is pressed', async () => {
    await driveToHandedBack();
    expect(harness.onManualReconnect).toBeTypeOf('function');

    act(() => {
      harness.onManualReconnect!();
    });

    /*
     * 这一条就是用户报的那件事。按下之后 daemon 还没回来 —— 重挂扫描会走一遍
     * 然后什么都做不了 —— 但**屏幕必须当场变**,否则和按钮坏了没有区别。
     */
    expect(harness.reconnect, '按下之后读数原封不动 = 用户看到的「没啥反应」').toEqual(
      expect.objectContaining({ exhausted: false, attempt: 1, max: 5, manualRetry: true }),
    );
  });

  it('hands the button back when the press did not take', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await driveToHandedBack();

    act(() => {
      harness.onManualReconnect!();
    });
    expect(harness.reconnect?.exhausted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MANUAL_RECONNECT_FEEDBACK_MS + 50);
    });

    // 重挂通道还被上一条流占着,所以这次按压根本起不来第二条 —— 「没接上」的真形态。
    expect(reattachDaemonRun).toHaveBeenCalledTimes(1);
    expect(harness.reconnect?.exhausted, '卡在「正在重连」永远转 = 另一种死胡同').toBe(true);
    expect(harness.reconnect?.manualRetry).toBe(false);
  });

  it('shows the feedback before it falls back, never the other way round', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await driveToHandedBack();
    const pressedAt = harness.timeline.length;

    act(() => {
      harness.onManualReconnect!();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MANUAL_RECONNECT_FEEDBACK_MS + 50);
    });

    // 顺序断言:先「在试」,再「又失败了」。少了中间那一格,用户就什么都没看见。
    expect(harness.timeline.slice(pressedAt).map((v) => v?.exhausted)).toEqual([false, true]);
  });

  it('leaves nothing on screen when the press actually reconnects', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers = await driveToHandedBack();

    // daemon 回来了:上一条流以一次普通失败收场,重挂通道让出来。
    await act(async () => {
      await handlers.onError(new Error('stream closed'));
    });
    // 那一行要立得住 —— 交回给人之后不许被随后的 failed 抹掉(文件头第 2 条)。
    expect(harness.reconnect?.exhausted).toBe(true);

    let secondHandlers: ReattachHandlers | null = null;
    reattachDaemonRun.mockImplementation(async (options: { handlers: ReattachHandlers }) => {
      secondHandlers = options.handlers;
      return new Promise<void>(() => {});
    });

    act(() => {
      harness.onManualReconnect!();
    });
    expect(harness.reconnect?.manualRetry, '按下当场就该有回音').toBe(true);

    // 重挂真的起来了 → 整行消失(真机量到 0.4s 内)。
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(harness.reconnect).toBeNull());
    expect(secondHandlers).not.toBeNull();

    // 到期闸不许把已经消失的那一行画回来。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MANUAL_RECONNECT_FEEDBACK_MS + 50);
    });
    expect(harness.reconnect, '重挂接上了还回落 22-3 = 凭空多一次「连接失败」').toBeNull();
  });

  it('offers no second press while the first one is still in flight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await driveToHandedBack();

    act(() => {
      harness.onManualReconnect!();
    });
    /*
     * 连点防线不是一把锁,是形态本身:乐观读数的 `exhausted` 是 false,
     * 而 `Reconnect` 只有 `exhausted` 那一档才画按钮。窗口里屏幕上没有可按的东西,
     * 于是一次按压最多换来一次重挂扫描。
     */
    expect(harness.reconnect?.exhausted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MANUAL_RECONNECT_FEEDBACK_MS + 50);
    });
    expect(harness.reconnect?.exhausted).toBe(true);
  });
});
