// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { PreviewComment, PreviewCommentTarget } from '../../src/types';

// This comment HTTP/Toast scenario owns its mocks independently of the
// run-cleanup suite's persisted run fixtures and unresolved retry callbacks.
const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const listActiveChatRuns = vi.fn();
const upsertPreviewComment = vi.fn();
const originalFetch = globalThis.fetch;
const translation = vi.hoisted(() => ({ t: (value: string) => value }));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (value: string) => translation.t(value) }),
  useT: () => ((value: string) => translation.t(value)),
}));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>('../../src/providers/daemon');
  return { ...actual,
    fetchChatRunStatus: vi.fn(async () => null),
    listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
    listProjectRuns: vi.fn(async () => []),
    reattachDaemonRun: vi.fn(),
    streamViaDaemon: vi.fn(),
  };
});
vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: vi.fn(async () => null),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchProjectFileText: vi.fn(),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: (...args: unknown[]) => upsertPreviewComment(...args),
  writeProjectTextFile: vi.fn(),
}));
vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }));
vi.mock('../../src/router', () => ({ navigate: vi.fn() }));
vi.mock('../../src/state/projects', () => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: vi.fn(),
  patchProject: vi.fn(),
  saveMessage: vi.fn(),
  saveTabs: vi.fn(),
  cacheTabsLocally: (_projectId: string, state: unknown) => state,
  persistTabsToDaemonNow: vi.fn(),
}));
vi.mock('../../src/components/AppChromeHeader', () => ({ AppChromeHeader: () => null }));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: Record<string, unknown>) => (
    <div className="pane"><div className={`chat-log-wrap${props.chatLogTray ? ' has-chat-log-tray' : ''}`}>
      {props.chatLogTray as ComponentProps<'div'>['children']}
    </div></div>
  ),
}));
const fileWorkspaceSpy = vi.fn();
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: (props: Record<string, unknown>) => { fileWorkspaceSpy(props); return null; },
}));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));

afterEach(() => {
  cleanup();
  translation.t = (value: string) => value;
  vi.clearAllMocks();
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
});

describe('ProjectView preview comment save feedback', () => {
  it('shows the S26 title and explanation when a comment POST fails, preserving its save result and retry path', async () => {
    // Keep the owning ProjectView + Toast real. Only the preview child is a
    // prop seam; this does not claim to exercise the iframe comment editor.
    const { zhCN } = await import('../../src/i18n/locales/zh-CN');
    translation.t = (key: string) => key in zhCN ? zhCN[key as keyof typeof zhCN] : key;
    const registry = await vi.importActual<typeof import('../../src/providers/registry')>(
      '../../src/providers/registry',
    );
    const projectId = 'project-comment-s26';
    const conversationId = 'conv-comment-s26';
    const target: PreviewCommentTarget = {
      filePath: 'index.html', elementId: 'hero', selector: '#hero', label: 'Hero',
      text: '', position: { x: 10, y: 20, width: 100, height: 40 },
      htmlHint: '<div id="hero">Hero</div>',
    };
    const note = 'Keep this comment available after a failed save.';
    const saved: PreviewComment = {
      id: 'comment-s26', projectId, conversationId, ...target, note, status: 'open',
      createdAt: 1, updatedAt: 1,
    };
    listConversations.mockResolvedValue([{ id: conversationId, title: 'Comment copy' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    const priorUpsertImplementation = upsertPreviewComment.getMockImplementation();
    upsertPreviewComment.mockImplementation(registry.upsertPreviewComment);

    try {
      render(
        <ProjectView
          project={{ id: projectId, name: 'Comment copy', skillId: null, designSystemId: null } as never}
          routeFileName={null}
          routeConversationId={conversationId}
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
      await waitFor(() => expect(fileWorkspaceSpy).toHaveBeenCalled());
      const preview = () => fileWorkspaceSpy.mock.calls.at(-1)?.[0] as {
        onSavePreviewComment: (
          target: PreviewCommentTarget, note: string, attachAfterSave: boolean,
        ) => Promise<unknown>;
        previewComments: unknown[];
      };
      expect(screen.queryByRole('status')).toBeNull();
      const commentPosts: RequestInit[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/api/projects/${projectId}/conversations/${conversationId}/comments`
            && init?.method === 'POST') {
          commentPosts.push(init);
          return commentPosts.length === 1
            ? new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'storage unavailable' } }), { status: 500 })
            : new Response(JSON.stringify({ comment: saved }), { status: 200 });
        }
        // Unrelated background reads are inert; no local daemon is contacted.
        return new Response('{}', { status: 200 });
      });
      await act(async () => {
        expect(await preview().onSavePreviewComment(target, note, false)).toBeNull();
      });
      expect(commentPosts).toHaveLength(1);
      expect(JSON.parse(String(commentPosts[0]?.body))).toEqual({ target, note });
      const toast = screen.getByRole('status');
      // S26 uses ProjectView's global branch. This assertion guards the real
      // caller opt-in as well as Toast's separately tested portal capability.
      expect.soft(toast.parentElement).toBe(document.body);
      // Exact approved S26 copy, not implementation key names or CSS classes.
      expect(within(toast).getByText('评论保存失败', { exact: true })).toBeTruthy();
      expect(within(toast).getByText('本次评论未保存成功，请重新尝试。', { exact: true })).toBeTruthy();
      expect(toast.textContent).not.toContain('storage unavailable');
      expect(preview().previewComments).toEqual([]);

      fireEvent.click(within(toast).getByRole('button', { name: zhCN['common.dismiss'] }));
      await act(async () => {
        expect(await preview().onSavePreviewComment(target, note, false)).toEqual(saved);
      });
      expect(commentPosts).toHaveLength(2);
      expect(commentPosts[1]?.body).toBe(commentPosts[0]?.body);
      expect(preview().previewComments).toEqual([saved]);
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      // A red copy assertion must not leave the real HTTP implementation in
      // the shared mock for the remaining complete-file tests.
      upsertPreviewComment.mockImplementation(priorUpsertImplementation ?? (() => undefined));
      globalThis.fetch = originalFetch;
    }
  });

});
