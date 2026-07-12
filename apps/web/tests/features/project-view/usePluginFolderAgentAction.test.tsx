// @vitest-environment jsdom
//
// Plugin-folder agent action: installing a generated plugin folder into the
// registry, and the long-poll workflow that publishes it to GitHub or opens
// an Open Design community-plugin PR, streaming progress into the
// conversation as a synthetic assistant message via the injected port.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Dispatch, SetStateAction } from 'react';
import type { AgentInfo, AppConfig, ChatMessage, Conversation } from '../../../src/types';

import { usePluginFolderAgentAction } from '../../../src/features/project-view/hooks/usePluginFolderAgentAction.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';

function makePort(overrides: Partial<ProjectViewTransportPort> = {}): ProjectViewTransportPort {
  return {
    readProjectRawText: vi.fn(async () => null),
    extractMemory: vi.fn(async () => {}),
    loadQueuedChatSends: vi.fn(() => []),
    saveQueuedChatSends: vi.fn(),
    readSavedChatPanelWidth: vi.fn(() => 460),
    saveChatPanelWidth: vi.fn(),
    hasAutoSendFirstMessageFlag: vi.fn(() => false),
    readAmrGateOkFlag: vi.fn(() => false),
    readAutoSendAttachments: vi.fn(() => []),
    readAutoSendContext: vi.fn(() => null),
    clearAutoSendSession: vi.fn(),
    markDesignSystemAuditAutoRepairEligible: vi.fn(),
    consumeDesignSystemAuditAutoRepair: vi.fn(() => false),
    clearDesignSystemAuditAutoRepair: vi.fn(),
    subscribeSplitResize: vi.fn(() => () => {}),
    getSplitIsRtl: vi.fn(() => false),
    subscribeChatPanelPointerDrag: vi.fn(() => () => {}),
    checkGithubConnected: vi.fn(async () => false),
    subscribeGithubConnectRefreshTriggers: vi.fn(() => () => {}),
    fetchAppliedPluginSnapshot: vi.fn(async () => null),
    listPlugins: vi.fn(async () => []),
    duplicatePluginAsProject: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    copyTextToClipboard: vi.fn(async () => true),
    subscribeCapturedKeyDown: vi.fn(() => () => {}),
    patchProjectMetadata: vi.fn(async () => {}),
    patchProjectName: vi.fn(async () => {}),
    listConversations: vi.fn(async () => []),
    createConversation: vi.fn(async () => null),
    patchConversation: vi.fn(async () => null),
    deleteConversation: vi.fn(async () => true),
    fetchRunStatus: vi.fn(async () => null),
    subscribeBufferedTextFlushTriggers: vi.fn(() => () => {}),
    isDocumentHidden: vi.fn(() => false),
    isDocumentFocused: vi.fn(() => true),
    focusWindow: vi.fn(),
    listMessages: vi.fn(async () => []),
    saveMessage: vi.fn(async () => {}),
    fetchPreviewComments: vi.fn(async () => []),
    uploadPreviewCommentImages: vi.fn(async () => []),
    savePreviewComment: vi.fn(async () => null),
    patchPreviewCommentStatus: vi.fn(async () => null),
    deletePreviewComment: vi.fn(async () => true),
    loadOpenTabs: vi.fn(async () => ({ tabs: [], active: null })),
    cacheOpenTabsLocally: vi.fn((_projectId, state) => state),
    persistOpenTabsToDaemon: vi.fn(async () => {}),
    fetchProjectFiles: vi.fn(async () => []),
    fetchLiveArtifacts: vi.fn(async () => []),
    writeProjectTextFile: vi.fn(async () => null),
    subscribeProjectFileEvents: vi.fn(() => () => {}),
    fetchProjectFileText: vi.fn(async () => null),
    installGeneratedPluginFolder: vi.fn(async () => ({ ok: true, message: 'installed', warnings: [], log: [] })),
    startGeneratedPluginShareTask: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    waitGeneratedPluginShareTask: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    finalizeBrandProject: vi.fn(async () => ({ ok: true as const, result: {} as never })),
    fetchDesignSystemPackageAudit: vi.fn(async () => null),
    patchProjectDesignSystemId: vi.fn(async () => {}),
    fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })),
    ...overrides,
  };
}

const byokConfig = {
  mode: 'byok',
  apiProtocol: 'anthropic',
  apiKey: 'sk-test',
  model: 'claude-3',
} as unknown as AppConfig;

const daemonConfig = {
  mode: 'daemon',
  agentId: 'claude',
  agentModels: { claude: { model: 'claude-opus' } },
} as unknown as AppConfig;

const agentsById = new Map<string, AgentInfo>([
  ['claude', { id: 'claude', name: 'Claude' } as unknown as AgentInfo],
]);

function renderPluginFolderAgentAction(
  overrides: {
    port?: ProjectViewTransportPort;
    config?: AppConfig;
    activeConversationId?: string | null;
    currentConversationActionDisabled?: boolean;
    appendConversationMessage?: (
      conversationId: string,
      message: ChatMessage,
      options?: { telemetryFinalized?: boolean; keepalive?: boolean },
      persist?: boolean,
    ) => void;
    replaceConversationMessage?: (
      conversationId: string,
      message: ChatMessage,
      options?: { telemetryFinalized?: boolean; keepalive?: boolean },
      persist?: boolean,
    ) => void;
    setConversations?: Dispatch<SetStateAction<Conversation[]>>;
  } = {},
) {
  const port = overrides.port ?? makePort();
  const appendConversationMessage = overrides.appendConversationMessage ?? vi.fn();
  const replaceConversationMessage = overrides.replaceConversationMessage ?? vi.fn();
  const setConversations = overrides.setConversations ?? vi.fn();
  const rendered = renderHook(() =>
    usePluginFolderAgentAction(
      port,
      'p1',
      overrides.config ?? byokConfig,
      agentsById,
      overrides.activeConversationId === undefined ? 'c1' : overrides.activeConversationId,
      overrides.currentConversationActionDisabled ?? false,
      appendConversationMessage,
      replaceConversationMessage,
      setConversations,
    ),
  );
  return { ...rendered, port, appendConversationMessage, replaceConversationMessage, setConversations };
}

describe('usePluginFolderAgentAction', () => {
  describe('pluginWorkflowAgentName', () => {
    it('derives an api-protocol label outside daemon mode', () => {
      const { result } = renderPluginFolderAgentAction({ config: byokConfig });
      expect(result.current.pluginWorkflowAgentName).toContain('claude-3');
    });

    it('derives the agent/model label in daemon mode', () => {
      const { result } = renderPluginFolderAgentAction({ config: daemonConfig });
      expect(result.current.pluginWorkflowAgentName).toContain('Claude');
    });
  });

  describe('handlePluginFolderAgentAction', () => {
    it('is a no-op when the current conversation action is disabled', async () => {
      const port = makePort();
      const { result } = renderPluginFolderAgentAction({ port, currentConversationActionDisabled: true });
      await act(async () => {
        await result.current.handlePluginFolderAgentAction('plugins/foo', 'install');
      });
      expect(port.installGeneratedPluginFolder).not.toHaveBeenCalled();
    });

    it('is a no-op with no active conversation', async () => {
      const port = makePort();
      const { result } = renderPluginFolderAgentAction({ port, activeConversationId: null });
      await act(async () => {
        await result.current.handlePluginFolderAgentAction('plugins/foo', 'install');
      });
      expect(port.installGeneratedPluginFolder).not.toHaveBeenCalled();
    });

    it('installs the plugin folder and clears busy state on success', async () => {
      const port = makePort({
        installGeneratedPluginFolder: vi.fn(async () => ({
          ok: true,
          message: 'Installed plugin.',
          warnings: [],
          log: [],
        })),
      });
      const { result } = renderPluginFolderAgentAction({ port });
      let outcome: { message?: string } | void = undefined;
      await act(async () => {
        outcome = await result.current.handlePluginFolderAgentAction('plugins/foo', 'install');
      });
      expect(port.installGeneratedPluginFolder).toHaveBeenCalledWith('p1', 'plugins/foo');
      expect(outcome).toEqual({ message: 'Installed plugin.' });
      expect(result.current.activePluginActionPaths.has('plugins/foo')).toBe(false);
      expect(result.current.hiddenAssistantPluginActionPaths.has('plugins/foo')).toBe(false);
    });

    it('throws and clears busy state when the install outcome is not ok', async () => {
      const port = makePort({
        installGeneratedPluginFolder: vi.fn(async () => ({
          ok: false,
          message: 'Install failed.',
          warnings: [],
          log: [],
        })),
      });
      const { result } = renderPluginFolderAgentAction({ port });
      await expect(
        act(async () => {
          await result.current.handlePluginFolderAgentAction('plugins/foo', 'install');
        }),
      ).rejects.toThrow('Install failed.');
      expect(result.current.activePluginActionPaths.has('plugins/foo')).toBe(false);
      expect(result.current.hiddenAssistantPluginActionPaths.has('plugins/foo')).toBe(false);
    });

    it('clears busy state and rethrows when starting the share task fails', async () => {
      const port = makePort({
        startGeneratedPluginShareTask: vi.fn(async () => {
          throw new Error('network down');
        }),
      });
      const { result } = renderPluginFolderAgentAction({ port });
      await expect(
        act(async () => {
          await result.current.handlePluginFolderAgentAction('plugins/foo', 'publish');
        }),
      ).rejects.toThrow('network down');
      expect(result.current.activePluginActionPaths.has('plugins/foo')).toBe(false);
      expect(result.current.hiddenAssistantPluginActionPaths.has('plugins/foo')).toBe(false);
    });

    it('appends a streaming progress message, then replaces it with the success content once the task completes', async () => {
      const port = makePort({
        startGeneratedPluginShareTask: vi.fn(async () => ({
          taskId: 't1',
          action: 'publish-github' as const,
          path: 'plugins/foo',
          status: 'running' as const,
          startedAt: 1000,
        })),
        waitGeneratedPluginShareTask: vi.fn(async () => ({
          taskId: 't1',
          action: 'publish-github' as const,
          path: 'plugins/foo',
          status: 'done' as const,
          startedAt: 1000,
          endedAt: 2000,
          progress: ['cloning repo', 'pushing branch'],
          nextSince: 2,
          result: { message: 'Published.', url: 'https://example.com/repo' },
        })),
      });
      const appendConversationMessage = vi.fn();
      const replaceConversationMessage = vi.fn();
      const setConversations = vi.fn();
      const { result } = renderPluginFolderAgentAction({
        port,
        appendConversationMessage,
        replaceConversationMessage,
        setConversations,
      });
      await act(async () => {
        const promise = result.current.handlePluginFolderAgentAction('plugins/foo', 'publish');
        // Let the void-wrapped long-poll IIFE run to completion.
        await promise;
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(appendConversationMessage).toHaveBeenCalledOnce();
      const [conversationId, progressMessage] = appendConversationMessage.mock.calls[0]!;
      expect(conversationId).toBe('c1');
      expect(progressMessage.runStatus).toBe('running');
      expect(result.current.forceStreamingPluginMessageIds.has(progressMessage.id)).toBe(false);
      expect(replaceConversationMessage).toHaveBeenCalled();
      const lastReplace = replaceConversationMessage.mock.calls.at(-1)!;
      const [, finalMessage, finalOptions] = lastReplace;
      expect(finalMessage.runStatus).toBe('succeeded');
      expect(finalMessage.content).toContain('Published.');
      expect(finalOptions).toEqual({ telemetryFinalized: true });
      expect(setConversations).toHaveBeenCalled();
      expect(result.current.activePluginActionPaths.has('plugins/foo')).toBe(false);
      expect(result.current.hiddenAssistantPluginActionPaths.has('plugins/foo')).toBe(false);
    });

    it('replaces the progress message with failure content when the task fails', async () => {
      const port = makePort({
        startGeneratedPluginShareTask: vi.fn(async () => ({
          taskId: 't2',
          action: 'contribute-open-design' as const,
          path: 'plugins/bar',
          status: 'running' as const,
          startedAt: 1000,
        })),
        waitGeneratedPluginShareTask: vi.fn(async () => ({
          taskId: 't2',
          action: 'contribute-open-design' as const,
          path: 'plugins/bar',
          status: 'failed' as const,
          startedAt: 1000,
          endedAt: 2000,
          progress: [],
          nextSince: 0,
          error: { message: 'PR failed to open.' },
        })),
      });
      const replaceConversationMessage = vi.fn();
      const { result } = renderPluginFolderAgentAction({ port, replaceConversationMessage });
      await act(async () => {
        await result.current.handlePluginFolderAgentAction('plugins/bar', 'contribute');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      const lastReplace = replaceConversationMessage.mock.calls.at(-1)!;
      const [, finalMessage] = lastReplace;
      expect(finalMessage.runStatus).toBe('failed');
      expect(finalMessage.content).toContain('PR failed to open.');
    });
  });
});
