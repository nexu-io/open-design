// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import type { ProjectWorkspaceScopeResponse } from '@open-design/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { AppConfig, PreviewComment, PreviewCommentTarget, Project } from '../../src/types';

// Keep ProjectView, Toast and registry HTTP interpretation real. FileWorkspace
// exposes the owning callback boundary; this is not an iframe-editor or native
// browser test. Inputs remain available for retry, while visible draft/image
// retention is separately verified through the actual FileViewer in Chrome.
const listConversations = vi.fn();
const createConversation = vi.fn();
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
const deletePreviewComment = vi.fn();
const uploadProjectFiles = vi.fn();
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
  deletePreviewComment: (...args: unknown[]) => deletePreviewComment(...args),
  uploadProjectFiles: (...args: unknown[]) => uploadProjectFiles(...args),
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
  createConversation: (...args: unknown[]) => createConversation(...args),
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
  vi.resetAllMocks();
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
});

const project: Project = {
  id: 'project-comment-save-boundaries', name: 'Comment save boundaries',
  skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1,
};
const conversation = {
  id: 'conversation-comment-save-boundaries', projectId: project.id,
  title: 'Comment save boundaries', createdAt: 1, updatedAt: 1,
};
const config: AppConfig = {
  mode: 'daemon', apiKey: '', baseUrl: '', model: '', agentId: null,
  skillId: null, designSystemId: null, agentModels: {},
};
const target: PreviewCommentTarget = {
  filePath: 'index.html', elementId: 'hero', selector: '#hero', label: 'Hero',
  text: 'Hero', position: { x: 10, y: 20, width: 100, height: 40 },
  htmlHint: '<div id="hero">Hero</div>',
};
const note = 'Keep the note and both image references available for retry.';
const savedComment: PreviewComment = {
  id: 'comment-save-boundaries', projectId: project.id,
  conversationId: conversation.id, ...target, note, status: 'open',
  createdAt: 1, updatedAt: 1,
};
const commentsPath = `/api/projects/${project.id}/conversations/${conversation.id}/comments`;
const uploadPath = `/api/projects/${project.id}/upload`;
const unboundScope: ProjectWorkspaceScopeResponse = {
  scope: { kind: 'unbound', projectId: project.id, workspaceId: null, context: null },
};

type PreviewState = {
  onSavePreviewComment: (
    target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[],
  ) => Promise<PreviewComment | null>;
  onRemovePreviewComment: (id: string) => Promise<boolean>;
  previewComments: PreviewComment[];
};
function preview(): PreviewState {
  return fileWorkspaceSpy.mock.calls.at(-1)![0] as PreviewState;
}
function renderOwner(routeConversationId: string | null) {
  return render(
    <ProjectView
      project={project} routeFileName={null} routeConversationId={routeConversationId}
      config={config} agents={[]} skills={[]} designTemplates={[]} designSystems={[]}
      daemonLive onModeChange={() => {}} onAgentChange={() => {}}
      onAgentModelChange={() => {}} onRefreshAgents={() => {}} onOpenSettings={() => {}}
      onBack={() => {}} onClearPendingPrompt={() => {}} onTouchProject={() => {}}
      onProjectChange={() => {}} onProjectsRefresh={() => {}}
    />,
  );
}
function expectApprovedSaveFailure() {
  const toast = screen.getByRole('status');
  expect(within(toast).getByText('评论保存失败', { exact: true })).toBeTruthy();
  expect(within(toast).getByText('本次评论未保存成功，请重新尝试。', { exact: true })).toBeTruthy();
  expect(toast.textContent).not.toMatch(/storage unavailable|could not be stored/);
}
function dismissToast() {
  fireEvent.click(within(screen.getByRole('status')).getByRole('button'));
}
function uploadedFiles(init: RequestInit): File[] {
  if (!(init.body instanceof FormData)) throw new Error('Expected the real upload provider to send FormData');
  return init.body.getAll('files').filter((entry): entry is File => entry instanceof File);
}

beforeEach(async () => {
  const { zhCN } = await import('../../src/i18n/locales/zh-CN');
  translation.t = (key: string) => key in zhCN ? zhCN[key as keyof typeof zhCN] : key;
  const registry = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  // Exercise the actual DTO/HTTP interpretation, including partial upload results.
  upsertPreviewComment.mockImplementation(registry.upsertPreviewComment);
  uploadProjectFiles.mockImplementation(registry.uploadProjectFiles);
  deletePreviewComment.mockImplementation(registry.deletePreviewComment);
  listConversations.mockResolvedValue([conversation]);
  createConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue([]);
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }));
});

describe('S26 additional ProjectView save boundaries', () => {
  it('returns the approved save failure while conversation creation is pending, then saves the same note once creation finishes', async () => {
    let finishCreation!: (value: typeof conversation) => void;
    const creating = new Promise<typeof conversation>((resolve) => { finishCreation = resolve; });
    listConversations.mockResolvedValue([]);
    createConversation.mockReturnValue(creating);
    const requests: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // Empty projects seed only after the real scope hook confirms authority.
      if (String(input) === `/api/projects/${project.id}/workspace-scope`) {
        return Response.json(unboundScope);
      }
      if (init?.method === 'POST' || init?.method === 'DELETE') {
        requests.push({ url: String(input), init });
      }
      if (String(input) === commentsPath && init?.method === 'POST') {
        return new Response(JSON.stringify({ comment: savedComment }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    renderOwner(null);
    await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fileWorkspaceSpy).toHaveBeenCalled());
    const inputTarget = structuredClone(target);
    try {
      await act(async () => {
        expect(await preview().onSavePreviewComment(inputTarget, note, false)).toBeNull();
      });
      expect(requests).toEqual([]);
      expect(preview().previewComments).toEqual([]);
      expect(inputTarget).toEqual(target);
      expectApprovedSaveFailure();
      dismissToast();
      await act(async () => { finishCreation(conversation); await creating; });
      await waitFor(() => expect(listMessages).toHaveBeenCalled());
      await act(async () => {
        expect(await preview().onSavePreviewComment(inputTarget, note, false)).toEqual(savedComment);
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]!.url).toBe(commentsPath);
      expect(JSON.parse(String(requests[0]!.init.body))).toEqual({ target, note });
      expect(preview().previewComments).toEqual([savedComment]);
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      // Even a red copy assertion must settle the controlled creation operation.
      await act(async () => { finishCreation(conversation); await creating; });
    }
  });

  it('does not POST a comment after a partial image upload, and retries the unchanged note and both files after recovery', async () => {
    const images = [new File(['first image'], 'first.png', { type: 'image/png' }),
      new File(['second image'], 'second.png', { type: 'image/png' })];
    const originalImages = [...images];
    const storedImages = images.map((file) => ({ name: file.name, path: `uploads/${file.name}`, size: file.size }));
    const uploads: RequestInit[] = [];
    const commentPosts: RequestInit[] = [];
    const saved: PreviewComment = { ...savedComment,
      attachments: storedImages.map(({ name, path }) => ({ name, path })),
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === uploadPath && init?.method === 'POST') {
        uploads.push(init);
        return new Response(JSON.stringify({ files: uploads.length === 1 ? storedImages.slice(0, 1) : storedImages }), { status: 200 });
      }
      if (String(input) === commentsPath && init?.method === 'POST') {
        commentPosts.push(init);
        return new Response(JSON.stringify({ comment: saved }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    renderOwner(conversation.id);
    await waitFor(() => expect(listMessages).toHaveBeenCalled());
    await waitFor(() => expect(fileWorkspaceSpy).toHaveBeenCalled());
    await act(async () => {
      expect(await preview().onSavePreviewComment(target, note, false, images)).toBeNull();
    });
    expect(uploads).toHaveLength(1);
    expect(uploadedFiles(uploads[0]!)).toEqual(originalImages);
    expect(commentPosts).toHaveLength(0);
    expect(preview().previewComments).toEqual([]);
    expect(images).toEqual(originalImages);
    expectApprovedSaveFailure();
    dismissToast();
    await act(async () => {
      expect(await preview().onSavePreviewComment(target, note, false, images)).toEqual(saved);
    });
    expect(uploads).toHaveLength(2);
    expect(uploadedFiles(uploads[1]!)).toEqual(originalImages);
    expect(commentPosts).toHaveLength(1);
    expect(JSON.parse(String(commentPosts[0]!.body))).toEqual({
      target, note, attachments: storedImages.map(({ name, path }) => ({ name, path })),
    });
    expect(preview().previewComments).toEqual([saved]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refuses deletion before a conversation exists without calling save or presenting the approved save explanation', async () => {
    let finishCreation!: (value: typeof conversation) => void;
    const creating = new Promise<typeof conversation>((resolve) => { finishCreation = resolve; });
    listConversations.mockResolvedValue([]);
    createConversation.mockReturnValue(creating);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === `/api/projects/${project.id}/workspace-scope`) {
        return Response.json(unboundScope);
      }
      return Response.json({});
    });
    renderOwner(null);
    await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fileWorkspaceSpy).toHaveBeenCalled());
    try {
      await act(async () => { expect(await preview().onRemovePreviewComment(savedComment.id)).toBe(false); });
      expect(deletePreviewComment).not.toHaveBeenCalled();
      expect(upsertPreviewComment).not.toHaveBeenCalled();
      expect(uploadProjectFiles).not.toHaveBeenCalled();
      expect(preview().previewComments).toEqual([]);
      expect(screen.queryByText('本次评论未保存成功，请重新尝试。', { exact: true })).toBeNull();
    } finally {
      await act(async () => { finishCreation(conversation); await creating; });
    }
  });

  it('keeps a failed DELETE distinct from S26 and removes the saved comment only after a successful DELETE', async () => {
    fetchPreviewComments.mockResolvedValue([savedComment]);
    const deletes: RequestInit[] = [];
    const posts: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push(init);
      if (String(input) === `${commentsPath}/${savedComment.id}` && init?.method === 'DELETE') {
        deletes.push(init);
        return new Response('{}', { status: deletes.length === 1 ? 500 : 200 });
      }
      return new Response('{}', { status: 200 });
    });
    renderOwner(conversation.id);
    await waitFor(() => expect(preview().previewComments).toEqual([savedComment]));
    await act(async () => { expect(await preview().onRemovePreviewComment(savedComment.id)).toBe(false); });
    expect(preview().previewComments).toEqual([savedComment]);
    expect(deletes).toHaveLength(1);
    expect(posts).toEqual([]);
    // The delete failure has no newly approved save description. Do not pin its
    // legacy wording as a new product requirement or silently recategorize it.
    expect(screen.queryByText('本次评论未保存成功，请重新尝试。', { exact: true })).toBeNull();
    dismissToast();
    await act(async () => { expect(await preview().onRemovePreviewComment(savedComment.id)).toBe(true); });
    expect(deletes).toHaveLength(2);
    expect(preview().previewComments).toEqual([]);
    expect(posts).toEqual([]);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
