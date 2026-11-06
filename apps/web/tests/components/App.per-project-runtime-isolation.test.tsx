// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { Route } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  fetchMediaProvidersFromDaemon,
  loadConfig,
  mergeDaemonConfig,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgents,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates, patchProject } from '../../src/state/projects';
import {
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';

const PROJECT_A_ROUTE: Route = {
  kind: 'project',
  projectId: 'project-a',
  conversationId: null,
  fileName: null,
};

const PROJECT_B_ROUTE: Route = {
  kind: 'project',
  projectId: 'project-b',
  conversationId: null,
  fileName: null,
};

const HOME_ROUTE: Route = {
  kind: 'home',
  view: 'home',
};

const useRouteMock = vi.fn<() => Route>(() => PROJECT_A_ROUTE);
const useProjectRouteWorkspaceContextMock = vi.hoisted(() =>
  vi.fn(() => ({
    workspaceId: null,
    context: null,
    directoryItem: null,
    status: 'ready',
    refresh: vi.fn(),
  })),
);

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

vi.mock('../../src/collab/useProjectRouteWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/collab/useProjectRouteWorkspaceContext')
  >();
  return {
    ...actual,
    useProjectRouteWorkspaceContext: useProjectRouteWorkspaceContextMock,
  };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: (props: {
    config: AppConfig;
    onAgentChange: (agentId: string) => void;
    onAgentModelChange: (
      agentId: string,
      choice: { model?: string; reasoning?: string; serviceTier?: string },
    ) => void;
  }) => (
    <div data-testid="entry-view">
      <output data-testid="entry-config">
        {props.config.mode}:{props.config.agentId}:
        {props.config.agentModels?.[props.config.agentId ?? '']?.model ?? ''}
      </output>
      <button
        onClick={() => {
          props.onAgentChange('pi');
          props.onAgentModelChange('pi', {
            model: 'zai/glm-5.3-flash',
          });
        }}
      >
        Switch entry default to pi glm-flash
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: (props: {
    project: Project;
    config: AppConfig;
    onAgentChange: (agentId: string) => void;
    onAgentModelChange: (
      agentId: string,
      choice: { model?: string; reasoning?: string; serviceTier?: string },
    ) => void;
  }) => {
    const activeAgent = props.config.agentId ?? '';
    const activeModel = props.config.agentModels?.[activeAgent]?.model ?? '';
    return (
      <div data-testid={`project-view-${props.project.id}`}>
        <output data-testid="project-id">{props.project.id}</output>
        <output data-testid="project-runtime">
          {props.config.mode}:{activeAgent}:{activeModel}
        </output>
        <button
          onClick={() => {
            props.onAgentChange('pi');
            props.onAgentModelChange('pi', {
              model: 'zai/glm-5.3-flash',
            });
          }}
        >
          Switch current project to pi glm-flash
        </button>
      </div>
    );
  },
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  openWorkspaceTab: vi.fn(),
  WorkspaceTabsBar: () => null,
}));

vi.mock('../../src/components/MemoryToast', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/MemoryToast')>(
    '../../src/components/MemoryToast',
  );
  return {
    ...actual,
    MemoryToast: () => null,
  };
});

vi.mock('../../src/components/PrivacyConsentModal', () => ({
  PrivacyConsentModal: () => null,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgents: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
    patchProject: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchComposioConfigFromDaemon: vi.fn(),
    fetchDaemonConfig: vi.fn(),
    fetchMediaProvidersFromDaemon: vi.fn(),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
  };
});

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {
    codex: {
      model: 'gpt-5.4',
      reasoning: 'high',
    },
  },
  agentCliEnv: {},
  privacyDecisionAt: 1778244000000,
};

const projectA: Project = {
  id: 'project-a',
  name: 'Project A (Codex)',
  skillId: null,
  designSystemId: null,
  customInstructions: '',
  createdAt: 1,
  updatedAt: 1,
};

const projectB: Project = {
  id: 'project-b',
  name: 'Project B (Pi)',
  skillId: null,
  designSystemId: null,
  customInstructions: '',
  createdAt: 2,
  updatedAt: 2,
};

describe('App per-project provider and model isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetWorkspaceDirectoryCache();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    useRouteMock.mockReturnValue(PROJECT_A_ROUTE);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(fetchDaemonConfig).mockResolvedValue(null);
    vi.mocked(fetchMediaProvidersFromDaemon).mockResolvedValue({
      status: 'ok',
      providers: {},
    });
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgents).mockResolvedValue([
      {
        id: 'codex',
        name: 'Codex',
        bin: 'codex',
        available: true,
        models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
      },
      {
        id: 'pi',
        name: 'Pi',
        bin: 'pi',
        available: true,
        models: [{ id: 'zai/glm-5.3-flash', label: 'GLM 5.3 Flash' }],
      },
    ]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(listProjects).mockResolvedValue([projectA, projectB]);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(patchProject).mockImplementation(async (id, patch) => ({
      ...(id === 'project-a' ? projectA : projectB),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps Project A on codex when Project B switches to pi (zai/glm-5.3-flash)', async () => {
    const view = render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-id')).toHaveTextContent('project-a');
      expect(screen.getByTestId('project-runtime')).toHaveTextContent(
        'daemon:codex:gpt-5.4',
      );
    });

    // Switch route to Project B
    useRouteMock.mockReturnValue(PROJECT_B_ROUTE);
    view.rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-id')).toHaveTextContent('project-b');
    });

    // In Project B, switch agent to pi + zai/glm-5.3-flash
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch current project to pi glm-flash' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-runtime')).toHaveTextContent(
        'daemon:pi:zai/glm-5.3-flash',
      );
    });

    // Verify Project B persisted its runtimePrefs via patchProject, and Project A was not overwritten
    expect(patchProject).toHaveBeenCalledWith(
      'project-b',
      expect.objectContaining({
        metadata: expect.objectContaining({
          runtimePrefs: expect.objectContaining({
            mode: 'daemon',
            agentId: 'pi',
            agentModels: expect.objectContaining({
              pi: {
                model: 'zai/glm-5.3-flash',
              },
            }),
          }),
        }),
      }),
      null,
    );
    expect(patchProject).not.toHaveBeenCalledWith(
      'project-a',
      expect.anything(),
      expect.anything(),
    );

    // Switch back to Project A: it MUST still be on codex:gpt-5.4!
    useRouteMock.mockReturnValue(PROJECT_A_ROUTE);
    view.rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-id')).toHaveTextContent('project-a');
      expect(screen.getByTestId('project-runtime')).toHaveTextContent(
        'daemon:codex:gpt-5.4',
      );
    });
  });

  it('preserves existing project runtime when changing default provider on the Home entry view', async () => {
    const view = render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-runtime')).toHaveTextContent(
        'daemon:codex:gpt-5.4',
      );
    });

    // Navigate to Home (entry view) and change default agent to pi
    useRouteMock.mockReturnValue(HOME_ROUTE);
    view.rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('entry-config')).toHaveTextContent(
        'daemon:codex:gpt-5.4',
      );
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch entry default to pi glm-flash' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('entry-config')).toHaveTextContent(
        'daemon:pi:zai/glm-5.3-flash',
      );
    });

    // Return to Project A: it keeps its original codex runtime
    useRouteMock.mockReturnValue(PROJECT_A_ROUTE);
    view.rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-id')).toHaveTextContent('project-a');
      expect(screen.getByTestId('project-runtime')).toHaveTextContent(
        'daemon:codex:gpt-5.4',
      );
    });
  });
});
