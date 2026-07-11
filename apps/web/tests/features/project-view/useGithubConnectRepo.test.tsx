// @vitest-environment jsdom
//
// The "Connect your repo" CTA hook against a fake `ProjectViewTransportPort`.
// Drives the tri-state `githubConnected` resolution and the single handler
// shared by the review banner and the chat CTA.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGithubConnectRepo } from '../../../src/features/project-view/hooks/useGithubConnectRepo.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';

function makePort(
  overrides: Partial<ProjectViewTransportPort> = {},
): ProjectViewTransportPort {
  return {
    readProjectRawText: vi.fn(async () => null),
    extractMemory: vi.fn(async () => {}),
    loadQueuedChatSends: vi.fn(() => []),
    saveQueuedChatSends: vi.fn(),
    readSavedChatPanelWidth: vi.fn(() => 460),
    saveChatPanelWidth: vi.fn(),
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
    hasAutoSendFirstMessageFlag: vi.fn(() => false),
    readAmrGateOkFlag: vi.fn(() => false),
    fetchProjectFileText: vi.fn(async () => null),
    ...overrides,
  };
}

describe('useGithubConnectRepo', () => {
  it('starts undefined and resolves to the checked status once connectRepoNeeded is true', async () => {
    const port = makePort({ checkGithubConnected: vi.fn(async () => true) });
    const { result } = renderHook(() =>
      useGithubConnectRepo(port, true, () => 'prompt', vi.fn(), vi.fn()),
    );
    expect(result.current.githubConnected).toBeUndefined();
    await waitFor(() => expect(result.current.githubConnected).toBe(true));
  });

  it('resets to undefined when connectRepoNeeded goes false', async () => {
    const port = makePort({ checkGithubConnected: vi.fn(async () => true) });
    const { result, rerender } = renderHook(
      ({ needed }) => useGithubConnectRepo(port, needed, () => 'prompt', vi.fn(), vi.fn()),
      { initialProps: { needed: true } },
    );
    await waitFor(() => expect(result.current.githubConnected).toBe(true));
    rerender({ needed: false });
    expect(result.current.githubConnected).toBeUndefined();
  });

  it('re-checks when the port fires its refresh-trigger bridge', async () => {
    let trigger: (() => void) | null = null;
    const check = vi.fn(async () => false);
    const port = makePort({
      checkGithubConnected: check,
      subscribeGithubConnectRefreshTriggers: vi.fn((onTrigger) => {
        trigger = onTrigger;
        return () => {};
      }),
    });
    renderHook(() => useGithubConnectRepo(port, true, () => 'prompt', vi.fn(), vi.fn()));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    act(() => trigger?.());
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it('handleConnectRepo is a no-op while the status is unresolved', () => {
    const port = makePort({ checkGithubConnected: vi.fn(() => new Promise<boolean>(() => {})) });
    const onConnected = vi.fn();
    const onNotConnected = vi.fn();
    const { result } = renderHook(() =>
      useGithubConnectRepo(port, true, () => 'prompt', onConnected, onNotConnected),
    );
    act(() => result.current.handleConnectRepo());
    expect(onConnected).not.toHaveBeenCalled();
    expect(onNotConnected).not.toHaveBeenCalled();
  });

  it('calls onConnected with the built prompt when connected', async () => {
    const port = makePort({ checkGithubConnected: vi.fn(async () => true) });
    const onConnected = vi.fn();
    const onNotConnected = vi.fn();
    const { result } = renderHook(() =>
      useGithubConnectRepo(port, true, () => 'import-prompt', onConnected, onNotConnected),
    );
    await waitFor(() => expect(result.current.githubConnected).toBe(true));
    act(() => result.current.handleConnectRepo());
    expect(onConnected).toHaveBeenCalledWith('import-prompt');
    expect(onNotConnected).not.toHaveBeenCalled();
  });

  it('calls onNotConnected when not connected', async () => {
    const port = makePort({ checkGithubConnected: vi.fn(async () => false) });
    const onConnected = vi.fn();
    const onNotConnected = vi.fn();
    const { result } = renderHook(() =>
      useGithubConnectRepo(port, true, () => 'import-prompt', onConnected, onNotConnected),
    );
    await waitFor(() => expect(result.current.githubConnected).toBe(false));
    act(() => result.current.handleConnectRepo());
    expect(onNotConnected).toHaveBeenCalledOnce();
    expect(onConnected).not.toHaveBeenCalled();
  });
});
