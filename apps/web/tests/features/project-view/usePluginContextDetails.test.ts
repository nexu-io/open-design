// @vitest-environment jsdom
//
// The chat context-chip plugin/design-system details hook against a fake
// `ProjectViewTransportPort`. Drives the applied-plugin snapshot fetch, the
// "View details" lookup, the duplicate-as-project action (success + failure),
// and the design-system preview trigger.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord, PluginDuplicateProjectResponse } from '@open-design/contracts';

import { usePluginContextDetails } from '../../../src/features/project-view/hooks/usePluginContextDetails.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';
import type { DesignSystemSummary } from '../../../src/types';

function makePort(overrides: Partial<ProjectViewTransportPort> = {}): ProjectViewTransportPort {
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
    ...overrides,
  };
}

const record = { id: 'plugin-1', title: 'Plugin One' } as InstalledPluginRecord;

describe('usePluginContextDetails', () => {
  it('fetches the applied-plugin snapshot once a snapshot id is set, and clears it when unset', async () => {
    const port = makePort({
      fetchAppliedPluginSnapshot: vi.fn(async () => ({ status: 'fresh' }) as never),
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) =>
        usePluginContextDetails(port, id, () => 'name', vi.fn(), vi.fn()),
      { initialProps: { id: 'snap-1' as string | undefined } },
    );
    await waitFor(() => expect(result.current.activePluginSnapshot).not.toBeNull());

    rerender({ id: undefined });
    expect(result.current.activePluginSnapshot).toBeNull();
  });

  it('opens a plugin details panel only when the id resolves to an installed plugin', async () => {
    const port = makePort({ listPlugins: vi.fn(async () => [record]) });
    const { result } = renderHook(() =>
      usePluginContextDetails(port, undefined, () => 'name', vi.fn(), vi.fn()),
    );

    await act(async () => {
      await result.current.handleOpenContextPluginDetails('missing');
    });
    expect(result.current.contextPluginDetails).toBeNull();

    await act(async () => {
      await result.current.handleOpenContextPluginDetails('plugin-1');
    });
    expect(result.current.contextPluginDetails).toEqual(record);

    act(() => result.current.closeContextPluginDetails());
    expect(result.current.contextPluginDetails).toBeNull();
  });

  it('duplicates a plugin, closes the panel, and navigates on success', async () => {
    const response = {
      projectId: 'p2',
      conversationId: 'c2',
      relPath: 'index.html',
    } as PluginDuplicateProjectResponse;
    const duplicatePluginAsProject = vi.fn(async () => response);
    const port = makePort({ duplicatePluginAsProject });
    const onNavigate = vi.fn();
    const onFailed = vi.fn();
    const { result } = renderHook(() =>
      usePluginContextDetails(port, undefined, () => 'Duplicated name', onNavigate, onFailed),
    );

    await act(async () => {
      await result.current.handleDuplicateContextPlugin(record);
    });

    expect(duplicatePluginAsProject).toHaveBeenCalledWith('plugin-1', { name: 'Duplicated name' });
    expect(onNavigate).toHaveBeenCalledWith({
      projectId: 'p2',
      conversationId: 'c2',
      fileName: 'index.html',
    });
    expect(onFailed).not.toHaveBeenCalled();
    expect(result.current.contextPluginDetails).toBeNull();
  });

  it('calls onDuplicateFailed instead of navigating when the duplicate call throws', async () => {
    const port = makePort({
      duplicatePluginAsProject: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const onNavigate = vi.fn();
    const onFailed = vi.fn();
    const { result } = renderHook(() =>
      usePluginContextDetails(port, undefined, () => 'name', onNavigate, onFailed),
    );

    await act(async () => {
      await result.current.handleDuplicateContextPlugin(record);
    });

    expect(onFailed).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('opens and closes the design-system preview', () => {
    const port = makePort();
    const { result } = renderHook(() =>
      usePluginContextDetails(port, undefined, () => 'name', vi.fn(), vi.fn()),
    );
    const system = { id: 'ds-1', title: 'DS One' } as DesignSystemSummary;

    act(() => result.current.handleOpenContextDesignSystemDetails(system));
    expect(result.current.contextDesignSystemDetails).toEqual(system);

    act(() => result.current.closeContextDesignSystemDetails());
    expect(result.current.contextDesignSystemDetails).toBeNull();
  });
});
