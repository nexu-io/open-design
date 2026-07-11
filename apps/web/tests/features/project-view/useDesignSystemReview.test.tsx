// @vitest-environment jsdom
//
// The design-system-project workspace's per-section review cluster: sending
// "needs work" feedback through the standard chat-send path, persisting an
// approve/needs-work decision onto `project.metadata.designSystemReview`
// through the injected port, and auto-sending a decision that was queued
// while the conversation couldn't yet accept a send.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project, ProjectFile } from '../../../src/types';

import { useDesignSystemReview } from '../../../src/features/project-view/hooks/useDesignSystemReview.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';

type HandleSend = (prompt: string, attachments: unknown[], commentAttachments: unknown[]) => Promise<boolean>;

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
    subscribeProjectFileEvents: vi.fn(() => () => {}),
    hasAutoSendFirstMessageFlag: vi.fn(() => false),
    readAmrGateOkFlag: vi.fn(() => false),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Project One',
    skillId: null,
    pendingPrompt: null,
    metadata: null,
    appliedPluginSnapshotId: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as unknown as Project;
}

describe('useDesignSystemReview', () => {
  describe('sendDesignSystemFeedback', () => {
    it('is a no-op for blank feedback', () => {
      const handleSend = vi.fn<HandleSend>(async () => true);
      const { result } = renderHook(() =>
        useDesignSystemReview(
          makePort(),
          makeProject(),
          [] as ProjectFile[],
          'c1',
          true,
          false,
          vi.fn(),
          handleSend,
        ),
      );
      const task = result.current.sendDesignSystemFeedback('Colors', '   ', []);
      expect(task).toBeUndefined();
      expect(handleSend).not.toHaveBeenCalled();
    });

    it('returns a queued task and does not send when the conversation cannot accept one yet', () => {
      const handleSend = vi.fn<HandleSend>(async () => true);
      const { result } = renderHook(() =>
        useDesignSystemReview(
          makePort(),
          makeProject(),
          [] as ProjectFile[],
          null,
          true,
          false,
          vi.fn(),
          handleSend,
        ),
      );
      const task = result.current.sendDesignSystemFeedback('Colors', 'needs contrast fixes', []);
      expect(task).toEqual(expect.objectContaining({ status: 'queued' }));
      expect(handleSend).not.toHaveBeenCalled();
    });

    it('sends the feedback prompt and returns a sent task when the conversation can accept one', () => {
      const handleSend = vi.fn<HandleSend>(async () => true);
      const { result } = renderHook(() =>
        useDesignSystemReview(
          makePort(),
          makeProject(),
          [] as ProjectFile[],
          'c1',
          true,
          false,
          vi.fn(),
          handleSend,
        ),
      );
      const task = result.current.sendDesignSystemFeedback('Colors', 'needs contrast fixes', []);
      expect(task).toEqual(expect.objectContaining({ status: 'sent' }));
      expect(handleSend).toHaveBeenCalledOnce();
      const [prompt] = handleSend.mock.calls[0]!;
      expect(prompt).toContain('Colors');
    });
  });

  describe('persistDesignSystemReviewDecision', () => {
    it('merges the decision into project.metadata.designSystemReview and patches it through the port', () => {
      const port = makePort();
      const onProjectChange = vi.fn();
      const project = makeProject({ metadata: { kind: 'other' } });
      const { result } = renderHook(() =>
        useDesignSystemReview(
          port,
          project,
          [] as ProjectFile[],
          'c1',
          true,
          false,
          onProjectChange,
          vi.fn(async () => true),
        ),
      );
      act(() => result.current.persistDesignSystemReviewDecision('Colors', 'looks-good'));
      expect(onProjectChange).toHaveBeenCalledOnce();
      const [updated] = onProjectChange.mock.calls[0]!;
      expect(updated.metadata.designSystemReview.Colors).toEqual(
        expect.objectContaining({ decision: 'looks-good' }),
      );
      expect(port.patchProjectMetadata).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          designSystemReview: expect.objectContaining({
            Colors: expect.objectContaining({ decision: 'looks-good' }),
          }),
        }),
      );
    });

    it('carries feedback/files/agentTask details when provided', () => {
      const port = makePort();
      const project = makeProject();
      const { result } = renderHook(() =>
        useDesignSystemReview(
          port,
          project,
          [] as ProjectFile[],
          'c1',
          true,
          false,
          vi.fn(),
          vi.fn(async () => true),
        ),
      );
      act(() =>
        result.current.persistDesignSystemReviewDecision('Typography', 'needs-work', {
          feedback: 'too tight',
          files: ['a.md'],
        }),
      );
      const [, metadata] = (port.patchProjectMetadata as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(metadata.designSystemReview.Typography).toEqual(
        expect.objectContaining({ decision: 'needs-work', feedback: 'too tight', files: ['a.md'] }),
      );
    });
  });

  describe('queued-feedback auto-send effect', () => {
    it('auto-sends a queued needs-work decision once the conversation can accept it', () => {
      const port = makePort();
      const handleSend = vi.fn<HandleSend>(async () => true);
      const onProjectChange = vi.fn();
      const project = makeProject({
        metadata: {
          kind: 'other',
          designSystemReview: {
            Colors: {
              decision: 'needs-work',
              updatedAt: new Date(0).toISOString(),
              feedback: 'needs contrast fixes',
              agentTask: { status: 'queued', prompt: '', queuedAt: 't1' },
            },
          },
        },
      });
      renderHook(() =>
        useDesignSystemReview(
          port,
          project,
          [] as ProjectFile[],
          'c1',
          true,
          false,
          onProjectChange,
          handleSend,
        ),
      );
      expect(handleSend).toHaveBeenCalledOnce();
      expect(onProjectChange).toHaveBeenCalledOnce();
      const [updated] = onProjectChange.mock.calls[0]!;
      expect(updated.metadata.designSystemReview.Colors.agentTask).toEqual(
        expect.objectContaining({ status: 'sent' }),
      );
    });

    it('does not auto-send when the conversation cannot accept one yet', () => {
      const handleSend = vi.fn<HandleSend>(async () => true);
      const project = makeProject({
        metadata: {
          kind: 'other',
          designSystemReview: {
            Colors: {
              decision: 'needs-work',
              updatedAt: new Date(0).toISOString(),
              feedback: 'needs contrast fixes',
              agentTask: { status: 'queued', prompt: '', queuedAt: 't1' },
            },
          },
        },
      });
      renderHook(() =>
        useDesignSystemReview(
          makePort(),
          project,
          [] as ProjectFile[],
          null,
          true,
          false,
          vi.fn(),
          handleSend,
        ),
      );
      expect(handleSend).not.toHaveBeenCalled();
    });

    it('does not re-send the same queued task twice', () => {
      const handleSend = vi.fn<HandleSend>(async () => true);
      const project = makeProject({
        metadata: {
          kind: 'other',
          designSystemReview: {
            Colors: {
              decision: 'needs-work',
              updatedAt: new Date(0).toISOString(),
              feedback: 'needs contrast fixes',
              agentTask: { status: 'queued', prompt: '', queuedAt: 't1' },
            },
          },
        },
      });
      const { rerender } = renderHook(
        ({ p }) =>
          useDesignSystemReview(
            makePort(),
            p,
            [] as ProjectFile[],
            'c1',
            true,
            false,
            vi.fn(),
            handleSend,
          ),
        { initialProps: { p: project } },
      );
      expect(handleSend).toHaveBeenCalledOnce();
      // Re-render with the same still-"queued" snapshot (as if onProjectChange
      // hadn't propagated back into the prop yet) — must not double-send.
      rerender({ p: project });
      expect(handleSend).toHaveBeenCalledOnce();
    });
  });
});
