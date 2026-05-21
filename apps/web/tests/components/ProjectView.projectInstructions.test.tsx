// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
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
  patchProject,
} from '../../src/state/projects';
import { fetchPreviewComments } from '../../src/providers/registry';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
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
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: () => <div data-testid="chat-pane" />,
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedPatchProject = vi.mocked(patchProject);

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const baseProject: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-1',
  projectId: baseProject.id,
  title: null,
  createdAt: 1,
  updatedAt: 1,
};

function ProjectViewHarness({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  return (
    <ProjectView
      project={project}
      routeFileName={null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={setProject}
      onProjectsRefresh={vi.fn()}
    />
  );
}

const SAVED = 'Always use tabs, never spaces.';

describe('ProjectView – saved Project instructions surface (#1822)', () => {
  beforeEach(() => {
    mockedListConversations.mockResolvedValue([conversation]);
    mockedCreateConversation.mockResolvedValue(conversation);
    mockedListMessages.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: ['index.html'], active: 'index.html' });
    mockedFetchPreviewComments.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a persistent saved-state chip (not just a bare pencil) when instructions exist', async () => {
    render(<ProjectViewHarness initialProject={{ ...baseProject, customInstructions: SAVED }} />);

    const chip = await screen.findByTestId('project-instructions-chip');
    expect(chip).toBeTruthy();
    // The empty-state add affordance must not be the surface once a value exists.
    expect(screen.queryByTestId('project-instructions-add')).toBeNull();
    // Nothing is expanded until the user opts in.
    expect(screen.queryByTestId('project-instructions-preview')).toBeNull();
    expect(screen.queryByTestId('project-instructions-textarea')).toBeNull();
  });

  it('opens a read-only review panel that previews the saved instructions', async () => {
    render(<ProjectViewHarness initialProject={{ ...baseProject, customInstructions: SAVED }} />);

    fireEvent.click(await screen.findByTestId('project-instructions-chip'));

    const preview = screen.getByTestId('project-instructions-preview');
    expect(preview.textContent).toBe(SAVED);
    // The panel makes the active/injected state explicit.
    expect(screen.getByText('project.instructionsActive')).toBeTruthy();
    // Review is read-only — no editor until the user asks to edit.
    expect(screen.queryByTestId('project-instructions-textarea')).toBeNull();
  });

  it('reopens the editor from the review panel with the saved value prefilled', async () => {
    render(<ProjectViewHarness initialProject={{ ...baseProject, customInstructions: SAVED }} />);

    fireEvent.click(await screen.findByTestId('project-instructions-chip'));
    fireEvent.click(screen.getByTestId('project-instructions-edit'));

    const textarea = screen.getByTestId('project-instructions-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(SAVED);
  });

  it('offers an add affordance and opens an empty editor when no instructions are saved', async () => {
    render(<ProjectViewHarness initialProject={baseProject} />);

    const add = await screen.findByTestId('project-instructions-add');
    expect(screen.queryByTestId('project-instructions-chip')).toBeNull();

    fireEvent.click(add);

    const textarea = screen.getByTestId('project-instructions-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('reads the saved value back in the review panel right after a save', async () => {
    mockedPatchProject.mockResolvedValue({ ...baseProject, customInstructions: SAVED });
    render(<ProjectViewHarness initialProject={baseProject} />);

    fireEvent.click(await screen.findByTestId('project-instructions-add'));
    fireEvent.change(screen.getByTestId('project-instructions-textarea'), {
      target: { value: SAVED },
    });
    fireEvent.click(screen.getByTestId('project-instructions-save'));

    expect(mockedPatchProject).toHaveBeenCalledWith('project-1', { customInstructions: SAVED });
    // Save lands on the review panel so the stored value is confirmed back.
    await waitFor(() => {
      expect(screen.getByTestId('project-instructions-preview').textContent).toBe(SAVED);
    });
    expect(screen.getByTestId('project-instructions-chip')).toBeTruthy();
  });
});
