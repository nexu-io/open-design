// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
  synthesizeHandoff,
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
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
    synthesizeHandoff: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
}));

vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));

vi.mock('../../src/components/FileWorkspace', () => ({
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

// A thin ChatPane stand-in: exposes the resume control + the live message
// list + the composer draft so the test can prove the synthesized prompt
// is auto-sent (lands as a user message) rather than seeded into the draft.
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({
    messages,
    onResumeConversation,
    resumeConversationDisabled,
    initialDraft,
  }: {
    messages: ChatMessage[];
    onResumeConversation?: () => void;
    resumeConversationDisabled?: boolean;
    initialDraft?: string;
  }) => (
    <div>
      <button
        type="button"
        data-testid="resume"
        disabled={resumeConversationDisabled}
        onClick={() => onResumeConversation?.()}
      />
      <div data-testid="messages">
        {messages.map((m) => `${m.role}:${m.content}`).join('|')}
      </div>
      <textarea data-testid="draft" readOnly value={initialDraft ?? ''} />
    </div>
  ),
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedSynthesizeHandoff = vi.mocked(synthesizeHandoff);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);

const config: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  baseUrl: '',
  model: 'claude-opus-4-7',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project: Project = {
  id: 'p1',
  name: 'Project p1',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const origConversation: Conversation = {
  id: 'conv-orig',
  projectId: 'p1',
  title: 'Original',
  createdAt: 1,
  updatedAt: 1,
};

const freshConversation: Conversation = {
  id: 'conv-new',
  projectId: 'p1',
  title: null,
  createdAt: 2,
  updatedAt: 2,
};

const origMessage: ChatMessage = {
  id: 'm1',
  role: 'user',
  content: 'first turn',
  createdAt: 1,
};

function renderProjectView(configOverride?: Partial<AppConfig>) {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={configOverride ? { ...config, ...configOverride } : config}
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
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

function messagesText(): string {
  return screen.getByTestId('messages').textContent ?? '';
}

describe('ProjectView resume conversation', () => {
  beforeEach(() => {
    mockedListConversations.mockResolvedValue([origConversation]);
    mockedCreateConversation.mockResolvedValue(freshConversation);
    // The original conversation carries a transcript; the freshly created
    // one is empty (its DB read settles before the auto-send fires).
    mockedListMessages.mockImplementation(async (_projectId, conversationId) =>
      conversationId === origConversation.id ? [origMessage] : [],
    );
    mockedFetchPreviewComments.mockResolvedValue([]);
    // handleSend's best-effort memory/extract POST hits fetch; keep it benign.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('synthesizes a handoff prompt and auto-sends it as the first message of a new conversation', async () => {
    mockedSynthesizeHandoff.mockResolvedValue({
      prompt: 'SYNTHESIZED HANDOFF',
      model: 'claude-opus-4-7',
      inputTokens: 10,
      outputTokens: 5,
      transcriptMessageCount: 1,
    });

    renderProjectView();

    // Wait for the original transcript to hydrate so the resume control
    // is enabled (it is disabled when there is nothing to hand off).
    await waitFor(() => {
      expect(messagesText()).toContain('user:first turn');
    });
    expect((screen.getByTestId('resume') as HTMLButtonElement).disabled).toBe(false);

    screen.getByTestId('resume').click();

    await waitFor(() => {
      expect(mockedSynthesizeHandoff).toHaveBeenCalledWith('p1', {
        // Scoped to the conversation being resumed, not the whole project.
        conversationId: origConversation.id,
        apiKey: 'sk-test',
        model: 'claude-opus-4-7',
        maxTokens: expect.any(Number),
      });
    });
    // Default Anthropic config has baseUrl '' — it must be omitted, not
    // forwarded as an empty string the handoff route would 400.
    expect(mockedSynthesizeHandoff.mock.calls[0]![1]).not.toHaveProperty('baseUrl');
    await waitFor(() => {
      expect(mockedCreateConversation).toHaveBeenCalledWith('p1');
    });
    // The synthesized prompt must land as a real user message in the new
    // conversation — proving auto-send, not a composer seed.
    await waitFor(() => {
      expect(messagesText()).toContain('user:SYNTHESIZED HANDOFF');
    });
    expect(messagesText()).not.toContain('user:first turn');
    expect((screen.getByTestId('draft') as HTMLTextAreaElement).value).toBe('');
  });

  it('forwards baseUrl when the user has set a custom one', async () => {
    mockedSynthesizeHandoff.mockResolvedValue({
      prompt: 'SYNTHESIZED HANDOFF',
      model: 'claude-opus-4-7',
      inputTokens: 10,
      outputTokens: 5,
      transcriptMessageCount: 1,
    });

    renderProjectView({ baseUrl: 'https://proxy.example' });

    await waitFor(() => {
      expect(messagesText()).toContain('user:first turn');
    });
    screen.getByTestId('resume').click();

    await waitFor(() => {
      expect(mockedSynthesizeHandoff).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ baseUrl: 'https://proxy.example' }),
      );
    });
  });

  it('disables the resume control while the conversation has no transcript to hand off', async () => {
    // Guards the `messages.length === 0` arm of resumeConversationDisabled:
    // a fresh/empty conversation has nothing to synthesize a handoff from.
    mockedListMessages.mockResolvedValue([]);

    renderProjectView();

    await waitFor(() => {
      expect(screen.getByTestId('resume')).toBeTruthy();
    });
    expect((screen.getByTestId('resume') as HTMLButtonElement).disabled).toBe(true);
    expect(messagesText()).toBe('');
  });

  it('shows a toast and creates no conversation when synthesis fails', async () => {
    mockedSynthesizeHandoff.mockResolvedValue(null);

    renderProjectView();

    await waitFor(() => {
      expect(messagesText()).toContain('user:first turn');
    });

    screen.getByTestId('resume').click();

    await waitFor(() => {
      expect(mockedSynthesizeHandoff).toHaveBeenCalledTimes(1);
    });
    await screen.findByText(/handoff prompt/i);
    expect(mockedCreateConversation).not.toHaveBeenCalled();
    expect(messagesText()).toContain('user:first turn');
  });

  it('surfaces the daemon-classified error message in the toast', async () => {
    // A structured daemon error (rate limit, empty transcript, ...) must
    // reach the toast verbatim, not collapse into a generic message.
    mockedSynthesizeHandoff.mockResolvedValue({
      error: {
        code: 'RATE_LIMITED',
        message: 'This request would exceed your rate limit of 30,000 input tokens per minute.',
      },
    });

    renderProjectView();

    await waitFor(() => {
      expect(messagesText()).toContain('user:first turn');
    });

    screen.getByTestId('resume').click();

    await screen.findByText(/exceed your rate limit/i);
    expect(mockedCreateConversation).not.toHaveBeenCalled();
  });
});
