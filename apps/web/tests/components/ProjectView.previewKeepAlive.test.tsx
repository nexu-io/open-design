// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { useIframeKeepAlivePool } from '../../src/components/IframeKeepAlivePool';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchProjectFiles, fetchPreviewComments } from '../../src/providers/registry';
import {
  getHtmlSourceSnapshot,
  setHtmlSourceSnapshot,
} from '../../src/components/html-source-snapshot-cache';

import { navigate } from '../../src/router';

const evictProjectMock = vi.fn();

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: () => {},
  }),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/components/IframeKeepAlivePool', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/IframeKeepAlivePool')>(
    '../../src/components/IframeKeepAlivePool',
  );
  return {
    ...actual,
    useIframeKeepAlivePool: vi.fn(),
  };
});

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn(),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({ openRequest, tabsState }: { openRequest?: { name: string } | null; tabsState: { active: string | null } }) => (
    <div data-testid="file-workspace" data-open-request={openRequest?.name} data-active-tab={tabsState.active} />
  ),
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/chat/ProjectChatPane', () => ({
  ChatPane: ({ onConversationPlacementChange, onRequestOpenFile }: {
    onConversationPlacementChange: (placement: 'right') => void;
    onRequestOpenFile: (name: string) => void;
  }) => <div data-testid="chat-pane">
    <button onClick={() => onConversationPlacementChange('right')}>Move chat right</button>
    <button onClick={() => onRequestOpenFile('index.html')}>Open artifact</button>
  </div>,
}));

const mockedUseIframeKeepAlivePool = vi.mocked(useIframeKeepAlivePool);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: 'skill-1',
  designSystemId: 'ds-1',
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-1',
  projectId: project.id,
  title: null,
  createdAt: 1,
  updatedAt: 1,
};

const skill: SkillSummary = {
  id: 'skill-1',
  name: 'Prompt skill',
  description: 'Old prompt context',
  triggers: ['prompt'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Create a prototype.',
  aggregatesExamples: false,
};

const designSystem: DesignSystemSummary = {
  id: 'ds-1',
  title: 'Design System',
  category: 'product',
  summary: 'Old system context',
};

function renderProjectView(props?: {
  skills?: SkillSummary[];
  designSystems?: DesignSystemSummary[];
  routeFileName?: string;
}) {
  return render(
    <ProjectView
      project={project}
      routeFileName={props?.routeFileName ?? null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={props?.skills ?? [skill]}
      designTemplates={[] as SkillSummary[]}
      designSystems={props?.designSystems ?? [designSystem]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

describe('ProjectView preview keep-alive invalidation', () => {
  beforeEach(() => {
    mockedUseIframeKeepAlivePool.mockReturnValue({
      attach: vi.fn(),
      release: vi.fn(),
      evict: vi.fn(),
      evictProject: evictProjectMock,
      evictMatching: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      revision: vi.fn(() => 0),
    });
    mockedListConversations.mockResolvedValue([conversation]);
    mockedCreateConversation.mockResolvedValue(conversation);
    mockedListMessages.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    mockedFetchPreviewComments.mockResolvedValue([]);
    vi.mocked(fetchProjectFiles).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps restored artifact tabs hidden until the user clicks an artifact', async () => {
    mockedLoadTabs.mockResolvedValue({ tabs: ['index.html'], active: 'index.html' });
    renderProjectView();
    const preview = await screen.findByTestId('file-workspace');
    const split = screen.getByTestId('workspace-edit-layout').parentElement!;
    await waitFor(() => expect(preview).toHaveAttribute('data-active-tab', 'index.html'));
    expect(split).toHaveAttribute('data-conversation-placement', 'full');
    expect(vi.mocked(navigate).mock.calls.at(-1)?.[0]).toMatchObject({ fileName: null });

    fireEvent.click(screen.getByRole('button', { name: 'Open artifact' }));
    expect(split).toHaveAttribute('data-conversation-placement', 'left');
    expect(preview).toHaveAttribute('data-open-request', 'index.html');
    expect(screen.getByTestId('file-workspace')).toBe(preview);
    expect(vi.mocked(navigate).mock.calls.at(-1)?.[0]).toMatchObject({ fileName: 'index.html' });
  });

  it('keeps newly discovered output hidden and restores the chosen side on artifact click', async () => {
    vi.mocked(fetchProjectFiles).mockResolvedValue([{
      name: 'index.html', path: 'index.html', type: 'file', size: 1,
      mtime: 1, mime: 'text/html', kind: 'html',
    }]);
    renderProjectView();
    const preview = await screen.findByTestId('file-workspace');
    const split = screen.getByTestId('workspace-edit-layout').parentElement!;
    await waitFor(() => expect(preview).toHaveAttribute('data-active-tab', 'index.html'));
    expect(split).toHaveAttribute('data-conversation-placement', 'full');
    fireEvent.click(screen.getByRole('button', { name: 'Move chat right' }));
    fireEvent.click(screen.getByRole('button', { name: 'workspace.collapsePreview' }));
    expect(split).toHaveAttribute('data-conversation-placement', 'full');
    fireEvent.click(screen.getByRole('button', { name: 'Open artifact' }));
    expect(split).toHaveAttribute('data-conversation-placement', 'right');
  });

  it('opens an explicitly linked file immediately', async () => {
    renderProjectView({ routeFileName: 'index.html' });
    const preview = await screen.findByTestId('file-workspace');
    expect(preview).toHaveAttribute('data-open-request', 'index.html');
    expect(screen.getByTestId('workspace-edit-layout').parentElement)
      .toHaveAttribute('data-conversation-placement', 'left');
  });

  it('collapses and restores the preview without remounting it or losing pane placement', async () => {
    renderProjectView();
    await screen.findByTestId('chat-pane');
    const preview = screen.getByTestId('file-workspace');
    const layout = screen.getByTestId('workspace-edit-layout');
    const split = layout.parentElement!;
    fireEvent.click(screen.getByRole('button', { name: 'Move chat right' }));
    expect(split).toHaveAttribute('data-conversation-placement', 'right');
    fireEvent.click(screen.getByRole('button', { name: 'workspace.collapsePreview' }));
    expect(split).toHaveAttribute('data-conversation-placement', 'full');
    const expand = screen.getByRole('button', { name: 'workspace.expandPreview' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveAttribute('aria-controls', layout.id);
    expect(screen.getByTestId('file-workspace')).toBe(preview);
    fireEvent.click(expand);
    expect(split).toHaveAttribute('data-conversation-placement', 'right');
    expect(screen.getByTestId('file-workspace')).toBe(preview);
    expect(screen.queryByRole('button', { name: 'workspace.expandPreview' })).toBeNull();
  });

  it('evicts the active preview when registry prompt context changes for the open project', async () => {
    const view = renderProjectView();

    view.rerender(
      <ProjectView
        project={project}
        routeFileName={null}
        config={config}
        agents={[] as AgentInfo[]}
        skills={[{ ...skill, description: 'Fresh prompt context' }]}
        designTemplates={[] as SkillSummary[]}
        designSystems={[designSystem]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onRefreshAgents={vi.fn()}
        onOpenSettings={vi.fn()}
        onBack={vi.fn()}
        onClearPendingPrompt={vi.fn()}
        onTouchProject={vi.fn()}
        onProjectChange={vi.fn()}
        onProjectsRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(evictProjectMock).toHaveBeenCalledWith('project-1', { includeActive: true });
    });
  });

  it('keeps HTML snapshots across project-internal child remounts but clears them when authorization scope remounts ProjectView', () => {
    const view = renderProjectView();
    setHtmlSourceSnapshot({
      authorizationScopeKey: 'local',
      projectId: project.id,
      fileName: 'preview.html',
      refreshKey: '1:1:0',
      source: '<html>authorized</html>',
    });

    // Root-tab switches replace FileWorkspace/FileViewer children while this
    // ProjectView stays mounted. No child lifecycle may clear this snapshot.
    view.rerender(
      <ProjectView
        project={project}
        routeFileName={null}
        config={config}
        agents={[] as AgentInfo[]}
        skills={[skill]}
        designTemplates={[] as SkillSummary[]}
        designSystems={[designSystem]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onRefreshAgents={vi.fn()}
        onOpenSettings={vi.fn()}
        onBack={vi.fn()}
        onClearPendingPrompt={vi.fn()}
        onTouchProject={vi.fn()}
        onProjectChange={vi.fn()}
        onProjectsRefresh={vi.fn()}
      />,
    );
    expect(getHtmlSourceSnapshot('local', project.id, 'preview.html', '1:1:0')?.source)
      .toBe('<html>authorized</html>');

    view.rerender(
      <ProjectView
        key="workspace-b:member-b:project-1"
        project={project}
        routeFileName={null}
        config={config}
        agents={[] as AgentInfo[]}
        skills={[skill]}
        designTemplates={[] as SkillSummary[]}
        designSystems={[designSystem]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onRefreshAgents={vi.fn()}
        onOpenSettings={vi.fn()}
        onBack={vi.fn()}
        onClearPendingPrompt={vi.fn()}
        onTouchProject={vi.fn()}
        onProjectChange={vi.fn()}
        onProjectsRefresh={vi.fn()}
      />,
    );
    expect(getHtmlSourceSnapshot('local', project.id, 'preview.html', '1:1:0')).toBeNull();

    setHtmlSourceSnapshot({
      authorizationScopeKey: 'local',
      projectId: project.id,
      fileName: 'preview.html',
      refreshKey: '1:1:0',
      source: '<html>reauthorized</html>',
    });
    view.unmount();
    expect(getHtmlSourceSnapshot('local', project.id, 'preview.html', '1:1:0')).toBeNull();
  });
});
