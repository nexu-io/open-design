// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectView,
  clearStreamingConversationMarker,
  finalizeActiveAssistantMessagesOnStop,
  findExistingArtifactProjectFile,
  resolveRetryTarget,
  resolveSucceededRunStatus,
  selectPrimaryProjectFile,
  shouldClearActiveRunRefs,
} from '../../src/components/ProjectView';
import type { Artifact, ChatMessage, ProjectFile } from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
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
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();
const writeProjectTextFile = vi.fn();

const replayArtifact: Artifact = {
  identifier: 'real-daemon-smoke',
  artifactType: 'text/html',
  title: 'Real Daemon Smoke',
  html: '<!doctype html><html><body><h1>Real Daemon Smoke</h1></body></html>',
};

function artifactProjectFile(name: string, mtime: number): ProjectFile {
  return {
    artifactManifest: {
      entry: name,
      exports: ['html'],
      kind: 'html',
      metadata: {
        artifactType: 'text/html',
        identifier: 'real-daemon-smoke',
        inferred: false,
      },
      renderer: 'html',
      title: 'Real Daemon Smoke',
      version: 1,
    },
    kind: 'html',
    mime: 'text/html',
    mtime,
    name,
    size: 100,
  };
}

function projectFile(
  name: string,
  kind: ProjectFile['kind'],
  mtime: number,
  artifactManifest?: ProjectFile['artifactManifest'],
): ProjectFile {
  return {
    artifactManifest,
    kind,
    mime: kind === 'html' ? 'text/html' : 'application/octet-stream',
    mtime,
    name,
    size: 100,
  };
}

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) => fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: (...args: unknown[]) => writeProjectTextFile(...args),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
  cacheTabsLocally: (_projectId: string, state: unknown) => state,
  persistTabsToDaemonNow: vi.fn(),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

const chatPaneSpy = vi.fn();
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: Record<string, unknown>) => {
    chatPaneSpy(props);
    return null;
  },
}));

const fileWorkspaceSpy = vi.fn();
vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: (props: Record<string, unknown>) => {
    fileWorkspaceSpy(props);
    return null;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

async function waitForReadyChatPaneProps() {
  await waitFor(() => {
    expect(chatPaneSpy).toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.sendDisabled).toBe(false);
  });
  return chatPaneSpy.mock.calls.at(-1)?.[0] as {
    onSend?: (prompt: string, attachments: unknown[], comments: unknown[]) => Promise<void>;
    initialDraft?: string;
  };
}

describe('terminal replay artifact recovery', () => {
  it('only reuses existing artifacts created at or after the current run started', () => {
    const runCreatedAt = 1_000;
    const stale = artifactProjectFile('real-daemon-smoke.html', runCreatedAt - 1);
    const current = artifactProjectFile('real-daemon-smoke-2.html', runCreatedAt + 1);

    expect(findExistingArtifactProjectFile(replayArtifact, [stale], { minMtime: runCreatedAt }))
      .toBeNull();
    expect(findExistingArtifactProjectFile(replayArtifact, [stale, current], { minMtime: runCreatedAt }))
      .toBe(current);
  });
});

describe('selectPrimaryProjectFile', () => {
  it('prefers explicit primary manifests over newer renderable files', () => {
    const newer = projectFile('preview.html', 'html', 2_000);
    const primary = projectFile('index.html', 'html', 1_000, {
      entry: 'index.html',
      exports: ['html'],
      kind: 'html',
      primary: true,
      renderer: 'html',
      title: 'Index',
      version: 1,
    });

    expect(selectPrimaryProjectFile([newer, primary])).toBe(primary);
  });

  it('ignores sidecar manifest files when choosing a fallback', () => {
    const sidecar = projectFile('index.html.artifact.json', 'text', 2_000);
    const html = projectFile('index.html', 'html', 1_000);

    expect(selectPrimaryProjectFile([sidecar, html])).toBe(html);
  });
});

describe('retry target resolution', () => {
  const userMessage: ChatMessage = {
    id: 'user-1',
    role: 'user',
    content: 'Create a login page',
    createdAt: 1,
  };
  const failedAssistant: ChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Generation failed',
    createdAt: 2,
    runStatus: 'failed',
  };

  it('returns the prior transcript and original user turn for the last failed assistant', () => {
    const systemContext: ChatMessage = {
      id: 'assistant-0',
      role: 'assistant',
      content: 'Earlier result',
      createdAt: 0,
      runStatus: 'succeeded',
    };

    expect(resolveRetryTarget([systemContext, userMessage, failedAssistant], failedAssistant.id)).toEqual({
      failedAssistant,
      userMsg: userMessage,
      priorMessages: [systemContext],
      preservedAttempts: [failedAssistant],
    });
  });

  it('keeps earlier failed retry attempts visible while reusing the original user turn', () => {
    const firstFailure: ChatMessage = {
      ...failedAssistant,
      id: 'assistant-1',
      content: 'First attempt produced partial output',
      events: [{ kind: 'text', text: 'thinking before failure' }],
      producedFiles: [
        {
          name: 'partial.html',
          kind: 'html',
          mime: 'text/html',
          mtime: 1,
          size: 100,
        },
      ],
    };
    const secondFailure: ChatMessage = {
      ...failedAssistant,
      id: 'assistant-2',
      content: 'Retry failed too',
    };

    expect(resolveRetryTarget([userMessage, firstFailure, secondFailure], secondFailure.id)).toEqual({
      failedAssistant: secondFailure,
      userMsg: userMessage,
      priorMessages: [],
      preservedAttempts: [firstFailure, secondFailure],
    });
  });

  it('rejects non-terminal, non-last, or non-user-preceded retry targets', () => {
    expect(resolveRetryTarget([userMessage, { ...failedAssistant, runStatus: 'running' }], failedAssistant.id))
      .toBeNull();
    expect(resolveRetryTarget([userMessage, failedAssistant, { ...userMessage, id: 'user-2' }], failedAssistant.id))
      .toBeNull();
    expect(resolveRetryTarget([failedAssistant], failedAssistant.id)).toBeNull();
  });
});

describe('ProjectView daemon cleanup', () => {
  beforeEach(() => {
    listProjectRuns.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('does not abort daemon cancel reattach controllers during unmount cleanup', async () => {
    let seenCancelSignal: { aborted: boolean } | null = null;
    let seenSignal: { aborted: boolean } | null = null;

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'working',
        createdAt: Date.now(),
        runId: 'run-1',
        runStatus: 'running',
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exitCode: null,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: { signal: { aborted: boolean }; cancelSignal?: { aborted: boolean } }) => {
      seenSignal = options.signal;
      seenCancelSignal = options.cancelSignal ?? null;
      return new Promise<void>(() => {});
    });

    const view = render(
      <ProjectView
        project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
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

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(seenSignal).not.toBeNull();
    expect(seenCancelSignal).not.toBeNull();

    view.unmount();

    if (!seenSignal || !seenCancelSignal) throw new Error('Expected reattach signals to be captured');
    expect((seenSignal as any).aborted).toBe(true);
    expect((seenCancelSignal as any).aborted).toBe(false);
  });

  it('marks successful daemon completion as succeeded even before runId reaches message state', () => {
    expect(resolveSucceededRunStatus('running')).toBe('succeeded');
    expect(resolveSucceededRunStatus('queued')).toBe('succeeded');
    expect(resolveSucceededRunStatus(undefined)).toBe('succeeded');
    expect(resolveSucceededRunStatus('failed')).toBe('failed');
    expect(resolveSucceededRunStatus('canceled')).toBe('canceled');
  });

  // Regression: a phantom 'running' row in DB (no runId, no matching active
  // daemon run) used to stick the UI on "Waiting for first output —
  // Working 24m+" forever. The reattach loop now self-heals by marking
  // such a message as failed so the composer is interactive again.
  //
  // TODO(reconcile): re-add the three unit tests for
  // finalizeActiveAssistantMessagesOnStop / clearStreamingConversationMarker /
  // shouldClearActiveRunRefs that landed on main alongside this hunk —
  // they were dropped at merge because their bodies sat on top of HEAD's
  // self-heals fixture and the test body that follows uses the
  // `startedAt` variable declared only in this `it()` opener.
  it('self-heals running messages with no runId when daemon has no active run', async () => {
    const startedAt = Date.now();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-phantom',
        role: 'assistant',
        content: '',
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    render(
      <ProjectView
        project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
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

    await waitFor(() => expect(listActiveChatRuns).toHaveBeenCalled());
    await waitFor(() => {
      const failedCall = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.id === 'msg-phantom' && call[2]?.runStatus === 'failed',
      );
      expect(failedCall).toBeTruthy();
    });
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('persists a delayed daemon run id after switching projects so returning can reattach', async () => {
    const projectOne = { id: 'project-1', name: 'Project One', skillId: null, designSystemId: null };
    const projectTwo = { id: 'project-2', name: 'Project Two', skillId: null, designSystemId: null };
    const messagesByConversation = new Map<string, ChatMessage[]>([
      ['conv-1', []],
      ['conv-2', []],
    ]);

    listConversations.mockImplementation(async (projectId: string) => [
      projectId === 'project-1'
        ? { id: 'conv-1', title: 'Conversation 1' }
        : { id: 'conv-2', title: 'Conversation 2' },
    ]);
    listMessages.mockImplementation(async (_projectId: string, conversationId: string) =>
      messagesByConversation.get(conversationId) ?? [],
    );
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-delayed',
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
      exitCode: null,
      signal: null,
    });
    saveMessage.mockImplementation(async (_projectId: string, conversationId: string, message: ChatMessage) => {
      const existing = messagesByConversation.get(conversationId) ?? [];
      const next = existing.filter((item) => item.id !== message.id);
      next.push(message);
      messagesByConversation.set(conversationId, next);
      return message;
    });
    reattachDaemonRun.mockImplementation(async () => new Promise<void>(() => {}));

    let capturedRunCreated: ((runId: string) => void) | null = null;
    let capturedStreamSignal: AbortSignal | null = null;
    let capturedCancelSignal: AbortSignal | null = null;
    let capturedAssistantMessageId: string | null = null;
    streamViaDaemon.mockImplementation(async (options: {
      assistantMessageId?: string;
      signal: AbortSignal;
      cancelSignal?: AbortSignal;
      onRunCreated?: (runId: string) => void;
    }) => {
      capturedRunCreated = options.onRunCreated ?? null;
      capturedStreamSignal = options.signal;
      capturedCancelSignal = options.cancelSignal ?? null;
      capturedAssistantMessageId = options.assistantMessageId ?? null;
      return new Promise<void>(() => {});
    });

    const view = render(
      <ProjectView
        project={projectOne as never}
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

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps.onSend!('keep running', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(capturedRunCreated).not.toBeNull();

    view.rerender(
      <ProjectView
        project={projectTwo as never}
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

    await waitFor(() => expect((capturedStreamSignal as AbortSignal | null)?.aborted).toBe(true));
    expect((capturedCancelSignal as AbortSignal | null)?.aborted).toBe(false);

    capturedRunCreated!('run-delayed');

    await waitFor(() => {
      const persistedAssistant = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-1' &&
          call[1] === 'conv-1' &&
          call[2]?.id === capturedAssistantMessageId &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-delayed' &&
          call[2]?.runStatus === 'queued',
      );
      expect(persistedAssistant).toBeTruthy();
    });

    view.rerender(
      <ProjectView
        project={projectOne as never}
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

    await waitFor(() => {
      expect(reattachDaemonRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-delayed' }),
      );
    });
  });

  // Regression: when a project is created via PluginLoopHome with the
  // auto-send sessionStorage flag set, ProjectView used to seed
  // ChatComposer.initialDraft with project.pendingPrompt. The composer
  // latched that seed into local state, then auto-send fired the same
  // text as a real user message — leaving the textarea populated while
  // the run streamed. The user reported "好像发送了输入框的 query 还
  // 没有清除". With the fix, auto-send projects must hand the composer
  // an undefined initialDraft so the textarea stays empty; the seed
  // still flows through autoSendSeedRef so the prompt is delivered.
  it('does not seed composer initialDraft when auto-send sessionStorage flag is set', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-2', '1');

    try {
      render(
        <ProjectView
          project={{
            id: 'project-2',
            name: 'Project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: 'design a landing page for a coffee shop',
          } as never}
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

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      const seededCall = chatPaneSpy.mock.calls.find(
        (call) => call[0]?.initialDraft === 'design a landing page for a coffee shop',
      );
      expect(seededCall).toBeUndefined();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-2');
    }
  });

  it('auto-sends Home-staged design files as first-turn daemon attachments', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockResolvedValue(undefined);

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-files', '1');
    window.sessionStorage.setItem(
      'od:auto-send-attachments:project-files',
      JSON.stringify([
        { path: 'brief.pdf', name: 'brief.pdf', kind: 'file', size: 5 },
        { path: 'logo.png', name: 'logo.png', kind: 'image', size: 7 },
      ]),
    );

    try {
      render(
        <ProjectView
          project={{
            id: 'project-files',
            name: 'Project',
            skillId: null,
            designSystemId: null,
          } as never}
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

      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expect(streamViaDaemon.mock.calls[0]?.[0]).toMatchObject({
        attachments: ['brief.pdf', 'logo.png'],
        history: [
          expect.objectContaining({
            role: 'user',
            content: '',
            attachments: [
              { path: 'brief.pdf', name: 'brief.pdf', kind: 'file', size: 5 },
              { path: 'logo.png', name: 'logo.png', kind: 'image', size: 7 },
            ],
          }),
        ],
      });
      expect(window.sessionStorage.getItem('od:auto-send-first:project-files')).toBeNull();
      expect(window.sessionStorage.getItem('od:auto-send-attachments:project-files')).toBeNull();
    } finally {
      window.sessionStorage.removeItem('od:auto-send-first:project-files');
      window.sessionStorage.removeItem('od:auto-send-attachments:project-files');
    }
  });

  it('queues board comment attachments while the current daemon run is still busy', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async () => new Promise<void>(() => {}));

    render(
      <ProjectView
        project={{
          id: 'project-comments',
          name: 'Project',
          skillId: null,
          designSystemId: null,
        } as never}
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

    const chatProps = await waitForReadyChatPaneProps();
    await chatProps.onSend!('keep running', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0]?.streaming).toBe(true);
    });

    const workspaceProps = fileWorkspaceSpy.mock.calls.at(-1)?.[0] as {
      onSendBoardCommentAttachments?: (attachments: unknown[]) => Promise<boolean | void>;
    };
    expect(workspaceProps.onSendBoardCommentAttachments).toBeTruthy();

    await workspaceProps.onSendBoardCommentAttachments!([
      {
        id: 'hero-board-1',
        order: 1,
        filePath: 'preview.html',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        comment: 'Use a warmer accent',
        currentText: 'Hero',
        pagePosition: { x: 10, y: 20, width: 100, height: 40 },
        htmlHint: '<main data-od-id="hero">',
        source: 'board-batch',
      },
    ]);

    await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0] as {
        queuedItems?: Array<{
          prompt?: string;
          commentAttachments?: Array<{
            comment: string;
            commentContext?: string;
            elementId?: string;
          }>;
        }>;
      };
      expect(latest.queuedItems).toHaveLength(1);
      // Each board comment is queued as its own task: the comment text becomes
      // the task prompt while the attachment rides along as element context
      // (comment blanked, commentContext === 'query').
      expect(latest.queuedItems?.[0]?.prompt).toBe('Use a warmer accent');
      const queuedAttachment = latest.queuedItems?.[0]?.commentAttachments?.[0];
      expect(queuedAttachment?.elementId).toBe('hero');
      expect(queuedAttachment?.commentContext).toBe('query');
    });
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it('audits design-system workspace output after first auto-send and seeds a bounded repair prompt', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: false,
      projectPath: '/tmp/ds',
      filesInspected: 12,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'ui_kits/app/index.html must mount the kit.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    });
    let streamCallCount = 0;
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      streamCallCount += 1;
      options.onRunCreated?.(`run-ds-${streamCallCount}`);
      if (streamCallCount === 1) {
        options.handlers.onDone();
      }
    });

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-ds', '1');

    render(
      <ProjectView
        project={{
          id: 'project-ds',
          name: 'Cherry Studio Design System',
          skillId: null,
          designSystemId: 'user:cherry-studio',
          pendingPrompt: 'Create this project as a design system.',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:cherry-studio',
          },
        } as never}
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

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalled());
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds')).toBe('1');
    await waitFor(() => {
      const repairSeed = chatPaneSpy.mock.calls.find(
        (call) => typeof call[0]?.initialDraft === 'string'
          && call[0].initialDraft.includes('Fix the design-system package audit findings below.')
          && call[0].initialDraft.includes('ui_kit_index_missing_runtime_bootstrap'),
      );
      expect(repairSeed).toBeTruthy();
    });
    expect(saveMessage.mock.calls.some((call) =>
      call[2]?.role === 'assistant'
      && call[2]?.events?.some((event: { kind?: string; label?: string; detail?: string }) =>
        event.kind === 'status'
        && event.label === 'audit'
        && event.detail?.includes('Package audit found 1 error'),
      ),
    )).toBe(true);
  });

  it('clears design-system auto-repair budget when the first audit passes', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue({
      ok: true,
      projectPath: '/tmp/ds',
      filesInspected: 24,
      errors: [],
      warnings: [],
    });
    streamViaDaemon.mockImplementation(async (options: {
      handlers: { onDone: () => void };
      onRunCreated?: (runId: string) => void;
    }) => {
      options.onRunCreated?.('run-ds-pass');
      options.handlers.onDone();
    });

    chatPaneSpy.mockClear();
    window.sessionStorage.setItem('od:auto-send-first:project-ds-pass', '1');

    render(
      <ProjectView
        project={{
          id: 'project-ds-pass',
          name: 'Passing Design System',
          skillId: null,
          designSystemId: 'user:passing-ds',
          pendingPrompt: 'Create this project as a design system.',
          metadata: {
            importedFrom: 'design-system',
            entryFile: 'DESIGN.md',
            sourceFileName: 'user:passing-ds',
          },
        } as never}
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

    await waitFor(() => expect(fetchProjectDesignSystemPackageAudit).toHaveBeenCalledWith('project-ds-pass'));
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('od:design-system-audit-auto-repair:project-ds-pass')).toBeNull();
  });

  // Sister check: without the auto-send flag, the composer should still
  // seed from pendingPrompt so the user can edit before manually sending.
  it('seeds composer initialDraft with pendingPrompt when auto-send flag is absent', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    chatPaneSpy.mockClear();
    window.sessionStorage.removeItem('od:auto-send-first:project-3');

    render(
      <ProjectView
        project={{
          id: 'project-3',
          name: 'Project',
          skillId: null,
          designSystemId: null,
          pendingPrompt: 'design a landing page for a coffee shop',
        } as never}
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

    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());
    // The first render — before activeConversationId resolves — must
    // pass the seed through so ChatComposer can populate its draft.
    const seedingCall = chatPaneSpy.mock.calls.find(
      (call) => call[0]?.initialDraft === 'design a landing page for a coffee shop',
    );
    expect(seedingCall).toBeTruthy();
  });

  // Root-cause regression for the "Working 24m+ / Waiting for first output"
  // stuck UI. The phantom was created at line `persistMessage(assistantMsg)`
  // in handleSend: a daemon assistant row was written to DB with
  // runStatus='running' BEFORE POST /api/runs returned a runId. If that POST
  // never returned (slow daemon, network blip, component unmount mid-flight),
  // the row was orphaned forever with no runId for the reattach loop to
  // recover. The fix: persistMessage / persistMessageById / updateMessageById
  // all refuse to write a daemon assistant row that is still active without
  // a runId. The first DB write for that row only happens once onRunCreated
  // pins the daemon's runId onto the message.
  it('does not persist an assistant message before POST /api/runs returns a runId', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    // streamViaDaemon: capture onRunCreated but never resolve, so the POST
    // looks "in-flight" for the rest of the test. This is the exact window
    // in which phantom rows used to be written.
    let capturedOnRunCreated: ((runId: string) => void) | null = null;
    streamViaDaemon.mockImplementation(async (options: { onRunCreated?: (runId: string) => void }) => {
      capturedOnRunCreated = options.onRunCreated ?? null;
      return new Promise<void>(() => {});
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-phantom', name: 'Project', skillId: null, designSystemId: null } as never}
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

    const sendProps = await waitForReadyChatPaneProps();
    expect(sendProps?.onSend).toBeTypeOf('function');

    await sendProps!.onSend!('hello world', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    // The user message must be persisted immediately — it is committed
    // user intent and has no runId concept.
    const userSave = saveMessage.mock.calls.find((call) => call[2]?.role === 'user');
    expect(userSave?.[2]?.content).toBe('hello world');

    // The assistant placeholder must NOT be persisted yet: runStatus
    // is 'running' and the daemon has not returned a runId.
    const phantomSave = saveMessage.mock.calls.find(
      (call) =>
        call[2]?.role === 'assistant' &&
        call[2]?.runStatus === 'running' &&
        !call[2]?.runId,
    );
    expect(phantomSave).toBeUndefined();

    // Now simulate POST /api/runs returning a runId. The assistant row
    // transitions to 'queued' with a runId — that's a non-phantom write
    // that the guard lets through.
    expect(capturedOnRunCreated).not.toBeNull();
    capturedOnRunCreated!('run-pinned-xyz');

    await waitFor(() => {
      const pinnedSave = saveMessage.mock.calls.find(
        (call) =>
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-pinned-xyz' &&
          call[2]?.runStatus === 'queued',
      );
      expect(pinnedSave).toBeTruthy();
    });
  });

  // Companion regression: if the user navigates away (component unmounts)
  // BEFORE onRunCreated ever fires, the assistant placeholder must never
  // appear in DB. This is the exact failure mode the user reported — the
  // PluginLoopHome auto-send fired, the user moved on, and a phantom row
  // sat forever in the project's conversation.
  it('never persists a phantom assistant row when send aborts before runId', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);

    streamViaDaemon.mockImplementation(async () => {
      // Simulate a POST that never returns (network blip, daemon timeout).
      return new Promise<void>(() => {});
    });

    chatPaneSpy.mockClear();

    const view = render(
      <ProjectView
        project={{ id: 'project-aborted', name: 'Project', skillId: null, designSystemId: null } as never}
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

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('quick send', [], []);
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    view.unmount();

    const phantomSave = saveMessage.mock.calls.find(
      (call) =>
        call[2]?.role === 'assistant' &&
        call[2]?.runStatus === 'running' &&
        !call[2]?.runId,
    );
    expect(phantomSave).toBeUndefined();
  });

  it('persists a daemon assistant row as failed after an AMR auth error returns post-run creation', async () => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    streamViaDaemon.mockImplementation(async (options: {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => void };
    }) => {
      options.onRunCreated?.('run-auth-expired');
      options.handlers.onError(
        new Error('Your authentication token has expired. Please sign in again.'),
      );
    });

    chatPaneSpy.mockClear();

    render(
      <ProjectView
        project={{ id: 'project-auth-expired', name: 'Project', skillId: null, designSystemId: null } as never}
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

    const sendProps = await waitForReadyChatPaneProps();
    await sendProps!.onSend!('retry auth', [], []);

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const failedAssistantSave = saveMessage.mock.calls.find(
        (call) =>
          call[0] === 'project-auth-expired' &&
          call[1] === 'conv-1' &&
          call[2]?.role === 'assistant' &&
          call[2]?.runId === 'run-auth-expired' &&
          call[2]?.runStatus === 'failed' &&
          call[2]?.events?.some(
            (event: { kind?: string; label?: string; detail?: string }) =>
              event.kind === 'status' &&
              event.label === 'error' &&
              event.detail === 'Your authentication token has expired. Please sign in again.',
          ),
      );
      expect(failedAssistantSave).toBeTruthy();
    });
  });

  it('does not replay a terminal succeeded row with empty produced files', async () => {
    const runCreatedAt = Date.now();
    const existingArtifact = {
      artifactManifest: {
        entry: 'real-daemon-smoke.html',
        exports: ['html'],
        kind: 'html',
        metadata: {
          artifactType: 'text/html',
          identifier: 'real-daemon-smoke',
          inferred: false,
        },
        renderer: 'html',
        title: 'Real Daemon Smoke',
        version: 1,
      },
      kind: 'html',
      mime: 'text/html',
      mtime: runCreatedAt + 1,
      name: 'real-daemon-smoke.html',
      size: 100,
    };

    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([
      {
        id: 'msg-replay',
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        runId: 'run-replay',
        runStatus: 'succeeded',
        producedFiles: [],
      },
    ]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([existingArtifact]);
    fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue({
      id: 'run-replay',
      status: 'succeeded',
      createdAt: runCreatedAt,
      updatedAt: runCreatedAt + 1,
      exitCode: 0,
      signal: null,
    });
    listActiveChatRuns.mockResolvedValue([]);
    reattachDaemonRun.mockImplementation(async (options: {
      handlers: {
        onDelta: (delta: string) => void;
        onDone: () => void;
      };
    }) => {
      options.handlers.onDelta(
        '<artifact identifier="real-daemon-smoke" type="text/html" title="Real Daemon Smoke"><h1>Real Daemon Smoke</h1></artifact>',
      );
      options.handlers.onDone();
    });

    render(
      <ProjectView
        project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
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

    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledWith('project-1'));
    expect(fetchChatRunStatus).not.toHaveBeenCalled();
    expect(reattachDaemonRun).not.toHaveBeenCalled();
    expect(saveMessage).not.toHaveBeenCalledWith(
      'project-1',
      'conv-1',
      expect.objectContaining({
        id: 'msg-replay',
        producedFiles: [existingArtifact],
      }),
    );
    expect(writeProjectTextFile).not.toHaveBeenCalled();
  });
});
